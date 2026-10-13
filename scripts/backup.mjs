// Scarlett nightly backup.
// Reads every table in the Supabase project and writes ONE json file to ./backup/ in the same layout as the
// "Backup" button in the app, so there is a single restore story. Run by .github/workflows/backup.yml.
//
// Needs two environment variables (set as GitHub repository secrets, never committed):
//   SUPABASE_URL          e.g. https://hdqryvhwyzxtpvooowns.supabase.co
//   SUPABASE_SERVICE_KEY  the project's service_role / secret key (read access that bypasses row security)
// Optional (used for testing): SUPABASE_APIKEY, SUPABASE_BEARER, TABLES (comma list, skips table discovery), OUT_DIR.
import { mkdir, writeFile } from 'node:fs/promises';

const BASE = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_SERVICE_KEY || '';
if (!BASE || !KEY) { console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.'); process.exit(1); }

const HEADERS = { apikey: process.env.SUPABASE_APIKEY || KEY };
const bearer = process.env.SUPABASE_BEARER || (KEY.startsWith('eyJ') ? KEY : '');  // new-style sb_secret keys go in apikey only
if (bearer) HEADERS.Authorization = 'Bearer ' + bearer;

// Device push keys are not needed to rebuild Scarlett, so they stay out of the backup.
const EXCLUDE = new Set(['pushSubscriptions']);
const PAGE = 1000;

async function api(path, extra = {}) {
  const res = await fetch(BASE + '/rest/v1/' + path, { ...extra, headers: { ...HEADERS, ...(extra.headers || {}) } });
  if (!res.ok) throw new Error(`${path.split('?')[0] || '/'}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res;
}

// Table names (and each table's primary key, so paging is stable) come from the API's own description of the
// database, so a table added to Scarlett later is backed up automatically.
async function discover() {
  const spec = await (await api('', { headers: { Accept: 'application/openapi+json' } })).json();
  const defs = spec.definitions || (spec.components && spec.components.schemas) || {};
  const out = {};
  for (const [name, def] of Object.entries(defs)) {
    const props = def.properties || {};
    const pk = Object.keys(props).find(c => /<pk/.test(props[c].description || '')) || (props.id ? 'id' : Object.keys(props)[0]);
    out[name] = pk;
  }
  return out;
}

async function fetchTable(name, pk) {
  const rows = [];
  let total = null;
  for (let from = 0; ; from += PAGE) {
    const res = await api(`${encodeURIComponent(name)}?select=*&order=${encodeURIComponent(pk)}.asc`, {
      headers: { Range: `${from}-${from + PAGE - 1}`, 'Range-Unit': 'items', Prefer: 'count=exact' },
    });
    const page = await res.json();
    if (total === null) total = Number((res.headers.get('content-range') || '').split('/')[1]);
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return { rows, total };
}

const found = process.env.TABLES
  ? Object.fromEntries(process.env.TABLES.split(',').map(t => [t.trim(), 'id']))
  : await discover();
const names = Object.keys(found).filter(n => !EXCLUDE.has(n)).sort();
if (!names.length) { console.error('No tables found, so nothing to back up. Treating that as a failure.'); process.exit(1); }

const out = { app: 'Scarlett', exportedAt: new Date().toISOString(), exportedBy: 'nightly-backup', tables: {}, counts: {}, problems: [] };
let failed = 0;
for (const name of names) {
  try {
    let { rows, total } = await fetchTable(name, found[name]);
    if (Number.isFinite(total) && total !== rows.length) {          // data moved while we were reading: read once more
      ({ rows, total } = await fetchTable(name, found[name]));
      if (Number.isFinite(total) && total !== rows.length) out.problems.push(`${name}: expected ${total} rows, got ${rows.length}`);
    }
    out.tables[name] = rows;
    out.counts[name] = rows.length;
    console.log(`${name}: ${rows.length}`);
  } catch (e) {
    failed++;
    out.problems.push(`${name}: ${e.message}`);
    console.error(`FAILED ${name}: ${e.message}`);
  }
}

const dir = process.env.OUT_DIR || 'backup';
await mkdir(dir, { recursive: true });
const file = `${dir}/scarlett-backup-${out.exportedAt.slice(0, 10)}.json`;
await writeFile(file, JSON.stringify(out));
const total = Object.values(out.counts).reduce((a, b) => a + b, 0);
console.log(`Wrote ${file}: ${total} records across ${Object.keys(out.counts).length} tables.`);
if (out.problems.length) console.warn('Problems:\n' + out.problems.join('\n'));
if (failed) process.exit(1);   // a failed table fails the run, so GitHub emails the person who set it up

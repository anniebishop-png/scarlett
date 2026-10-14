// Team access: list who has access, deactivate someone who has left, or bring them back.
// POST (Authorization: Bearer <Supabase access token>), only for the people in ACCESS_ADMINS.
//   { action: 'list' }
//   { action: 'deactivate', email, dryRun? }   bans the sign-in, removes their appUsers row and push devices, logs it
//   { action: 'reactivate', email, name?, role? }
// It uses the Netlify service key (SUPABASE_SERVICE_ROLE_KEY), which is why this runs on the server and not in the page.
// A banned person can't sign in again or refresh their session; a page they already have open can keep working for up to
// about an hour until its sign-in token expires.
const { env, sb, sbHeaders } = require('../lib/push-common');

const ACCESS_ADMINS = ['annie.bishop@equiratings.com', 'ruairi@equiratings.com'];
const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });
const base = () => env('SUPABASE_URL').replace(/\/$/, '');

async function authAdmin(path, opts){
  const res = await fetch(base() + '/auth/v1/admin/' + path, Object.assign({ headers: sbHeaders({ 'Content-Type': 'application/json' }) }, opts || {}));
  const text = await res.text();
  if(!res.ok) throw new Error('Auth admin ' + res.status + ' on ' + path.split('?')[0] + ': ' + text.slice(0, 200));
  return text ? JSON.parse(text) : null;
}
async function allAuthUsers(){
  const out = [];
  for(let page = 1; page <= 20; page++){
    const r = await authAdmin('users?page=' + page + '&per_page=200');
    const list = (r && r.users) || [];
    out.push(...list);
    if(list.length < 200) break;
  }
  return out;
}
const isBanned = u => !!(u && u.banned_until && new Date(u.banned_until).getTime() > Date.now());
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

exports.handler = async (event) => {
  if(event.httpMethod !== 'POST') return json(405, { error: 'POST only' });
  try{
    const token = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '');
    if(!token) return json(401, { error: 'Not signed in' });
    const PUBLISHABLE = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_-zgn37TBJaub87sbxxfM3A_HJvyfvMU';
    const ur = await fetch(base() + '/auth/v1/user', { headers: { apikey: PUBLISHABLE, Authorization: 'Bearer ' + token } });
    if(!ur.ok) return json(401, { error: 'Invalid session' });
    const caller = String((await ur.json()).email || '').toLowerCase();
    if(!ACCESS_ADMINS.includes(caller)) return json(403, { error: 'Only Annie and Geogs can manage access' });

    let body = {};
    try{ body = JSON.parse(event.body || '{}'); }catch(_){ return json(400, { error: 'Bad JSON' }); }
    const target = String(body.email || '').trim().toLowerCase();
    const callerRow = ((await sb('appUsers?select=name&email=eq.' + encodeURIComponent(caller))) || [])[0];
    const actor = (callerRow && callerRow.name) || cap(caller.split('@')[0].split('.')[0]);

    if(body.action === 'list'){
      const [users, authUsers] = await Promise.all([sb('appUsers?select=email,name,role&order=name.asc'), allAuthUsers()]);
      const byEmail = {}; authUsers.forEach(u => { byEmail[String(u.email || '').toLowerCase()] = u; });
      const rows = (users || []).map(u => {
        const a = byEmail[u.email.toLowerCase()];
        return { email: u.email, name: u.name, role: u.role, status: !a ? 'not signed up' : (isBanned(a) ? 'deactivated' : 'active'), lastSignIn: a ? a.last_sign_in_at : null, admin: ACCESS_ADMINS.includes(u.email.toLowerCase()) };
      });
      const known = new Set((users || []).map(u => u.email.toLowerCase()));
      const gone = authUsers.filter(u => isBanned(u) && u.email && !known.has(String(u.email).toLowerCase()));
      const log = gone.length ? ((await sb('changeLog?select=docId,title,snapshot,at&action=eq.deactivate&coll=eq.appUsers&order=at.desc&limit=200')) || []) : [];
      const deactivated = gone.map(u => {
        const e = String(u.email).toLowerCase(), l = log.find(x => String(x.docId).toLowerCase() === e);
        return { email: e, name: (l && l.title) || cap(e.split('@')[0].split('.')[0]), role: (l && l.snapshot && l.snapshot.role) || 'member' };
      });
      return json(200, { users: rows, deactivated, me: caller });
    }

    if(!target || !/^[^@\s]+@equiratings\.com$/.test(target)) return json(400, { error: 'A team email is needed' });

    if(body.action === 'deactivate'){
      if(ACCESS_ADMINS.includes(target)) return json(400, { error: 'Annie and Geogs can not be deactivated here' });
      const row = ((await sb('appUsers?select=email,name,role&email=ilike.' + encodeURIComponent(target))) || [])[0];
      const au = (await allAuthUsers()).find(u => String(u.email || '').toLowerCase() === target);
      const plan = { email: target, name: row ? row.name : null, role: row ? row.role : null, hasSignIn: !!au, alreadyDeactivated: isBanned(au), inTeamList: !!row };
      if(body.dryRun) return json(200, { dryRun: true, plan });
      if(!row && !au) return json(404, { error: 'No one with that email is in Scarlett', plan });
      if(au && !isBanned(au)) await authAdmin('users/' + au.id, { method: 'PUT', body: JSON.stringify({ ban_duration: '876000h' }) });
      if(row) await sb('appUsers?email=ilike.' + encodeURIComponent(target), { method: 'DELETE' });
      let devices = 0;
      try{ const d = (await sb('pushSubscriptions?select=id&email=ilike.' + encodeURIComponent(target))) || []; devices = d.length; if(devices) await sb('pushSubscriptions?email=ilike.' + encodeURIComponent(target), { method: 'DELETE' }); }catch(_){}
      try{
        await sb('changeLog', { method: 'POST', headers: sbHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }), body: JSON.stringify({
          id: 'chg_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at: new Date().toISOString(), actor, email: caller, action: 'deactivate', coll: 'appUsers', docId: target,
          title: row ? row.name : target, snapshot: { name: row ? row.name : null, role: row ? row.role : null } }) });
      }catch(_){}
      return json(200, { ok: true, plan, devicesRemoved: devices });
    }

    if(body.action === 'reactivate'){
      const au = (await allAuthUsers()).find(u => String(u.email || '').toLowerCase() === target);
      if(au && isBanned(au)) await authAdmin('users/' + au.id, { method: 'PUT', body: JSON.stringify({ ban_duration: 'none' }) });
      const role = body.role === 'manager' ? 'manager' : 'member';
      const name = String(body.name || '').trim() || cap(target.split('@')[0].split('.')[0]);
      await sb('appUsers?on_conflict=email', { method: 'POST', headers: sbHeaders({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify({ email: target, name, role }) });
      try{
        await sb('changeLog', { method: 'POST', headers: sbHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }), body: JSON.stringify({
          id: 'chg_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at: new Date().toISOString(), actor, email: caller, action: 'reactivate', coll: 'appUsers', docId: target, title: name }) });
      }catch(_){}
      return json(200, { ok: true, email: target, name, role });
    }

    return json(400, { error: 'Unknown action' });
  }catch(e){
    console.error('access-admin failed', e && e.message);
    return json(500, { error: String((e && e.message) || e) });
  }
};

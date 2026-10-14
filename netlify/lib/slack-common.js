// Shared code for the Slack to-do messages (slack-digest.js runs it on a schedule, slack-send.js on demand).
// Secrets live in Netlify environment variables, never in code:
//   SLACK_BOT_TOKEN (xoxb-...), SLACK_TEAM_CHANNEL (channel ID, optional), SLACK_DIGEST_TZ, SLACK_DIGEST_HOUR (optional),
//   plus the SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY the push functions already use.
const { env, sb } = require('./push-common');

const SITE = process.env.SCARLETT_URL || 'https://scarlett.equiratings.com/';
const MAX_LIST = 10;

function localParts(tz, now){
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' });
  const p = {};
  fmt.formatToParts(now).forEach(x => { p[x.type] = x.value; });
  return { date: p.year + '-' + p.month + '-' + p.day, hour: Number(p.hour) % 24, minute: Number(p.minute), weekday: p.weekday };
}
function dayLabel(iso){
  const d = new Date(iso + 'T12:00:00Z');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ----- Slack -----
async function slack(method, args, httpGet){
  const token = env('SLACK_BOT_TOKEN');
  const res = httpGet
    ? await fetch('https://slack.com/api/' + method + '?' + new URLSearchParams(args), { headers: { Authorization: 'Bearer ' + token } })
    : await fetch('https://slack.com/api/' + method, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(args) });
  if(res.status === 429){ await new Promise(r => setTimeout(r, 1500)); return slack(method, args, httpGet); }
  return res.json();
}
const slackIdFor = async email => {
  const r = await slack('users.lookupByEmail', { email }, true);
  return r.ok ? r.user.id : null;
};

// ----- data -----
async function loadData(today){
  const [users, tasks] = await Promise.all([
    sb('appUsers?select=email,name,role'),
    sb('tasks?select=id,title,client,dateISO,owners,status&status=neq.done&dateISO=lte.' + today + '&limit=5000'),
  ]);
  let reviews = [];
  try{ reviews = (await sb('pricingQuotes?select=id,title,client,event,reviewer,reviewRequestedBy&reviewStatus=eq.pending')) || []; }catch(_){ /* review columns not there yet */ }
  const people = (users || []).filter(u => u.email && u.name).map(u => {
    const mine = (tasks || []).filter(t => (t.owners || []).includes(u.name) && t.dateISO);
    mine.sort((a, b) => a.dateISO.localeCompare(b.dateISO));
    return {
      name: u.name, email: String(u.email).toLowerCase(), role: u.role,
      dueToday: mine.filter(t => t.dateISO === today),
      overdue: mine.filter(t => t.dateISO < today),
      reviews: u.role === 'manager' ? reviews.filter(q => String(q.reviewer || '').toLowerCase() === String(u.email).toLowerCase()) : [],
    };
  });
  return people;
}
const hasWork = p => p.dueToday.length || p.overdue.length || p.reviews.length;

// ----- messages -----
function taskLine(t, withDate, today){
  let s = '• ' + esc(t.title || 'Untitled task');
  if(t.client) s += '  _' + esc(t.client) + '_';
  if(withDate) s += '  (due ' + esc(dayLabel(t.dateISO)) + ')';
  return s;
}
function listBlock(title, rows){
  if(!rows.length) return null;
  const shown = rows.slice(0, MAX_LIST), more = rows.length - shown.length;
  return '*' + title + ' (' + rows.length + ')*\n' + shown.join('\n') + (more > 0 ? '\n_+' + more + ' more in Scarlett_' : '');
}
function dmMessage(p, today){
  const parts = [
    listBlock('Due today', p.dueToday.map(t => taskLine(t, false, today))),
    listBlock('Overdue', p.overdue.map(t => taskLine(t, true, today))),
    listBlock('Quotes waiting for your review', p.reviews.map(q => '• ' + esc(q.title || q.client || 'Quote') + (q.reviewRequestedBy ? '  _from ' + esc(q.reviewRequestedBy) + '_' : ''))),
  ].filter(Boolean);
  const head = 'Good morning ' + esc(p.name) + '. Your day on Scarlett, ' + dayLabel(today) + '.';
  const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: '*' + head + '*' } }];
  parts.forEach(t => blocks.push({ type: 'section', text: { type: 'mrkdwn', text: t.slice(0, 2900) } }));
  if(!parts.length) blocks.push({ type: 'section', text: { type: 'mrkdwn', text: 'Nothing due today and nothing overdue. Nice.' } });
  blocks.push({ type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open Scarlett' }, url: SITE }] });
  return { text: head, blocks };
}
function channelMessage(people, today){
  const active = people.filter(p => p.dueToday.length || p.overdue.length);
  const head = 'Today on Scarlett, ' + dayLabel(today);
  const blocks = [{ type: 'header', text: { type: 'plain_text', text: head } }];
  if(!active.length){
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: 'Nothing due today and nothing overdue.' } });
  }else{
    active.sort((a, b) => (b.dueToday.length + b.overdue.length) - (a.dueToday.length + a.overdue.length));
    let chunk = '';
    const flush = () => { if(chunk){ blocks.push({ type: 'section', text: { type: 'mrkdwn', text: chunk } }); chunk = ''; } };
    active.forEach(p => {
      const bits = [];
      if(p.dueToday.length) bits.push(p.dueToday.length + ' due today');
      if(p.overdue.length) bits.push(p.overdue.length + ' overdue');
      let line = '*' + esc(p.name) + '*  ' + bits.join(', ');
      p.dueToday.slice(0, 3).forEach(t => { line += '\n   • ' + esc(t.title || 'Untitled task'); });
      if(p.dueToday.length > 3) line += '\n   _+' + (p.dueToday.length - 3) + ' more_';
      if(chunk.length + line.length > 2700) flush();
      chunk += (chunk ? '\n\n' : '') + line;
    });
    flush();
  }
  blocks.push({ type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open Scarlett' }, url: SITE }] });
  return { text: head, blocks: blocks.slice(0, 50) };
}

// ----- run -----
// Pilot: until SLACK_ALL_TEAM=true is set in Netlify, only these people get DMs and the team channel post is skipped.
const PILOT = ['annie.bishop@equiratings.com', 'ruairi@equiratings.com'];
const pilotOn = () => String(process.env.SLACK_ALL_TEAM || '').toLowerCase() !== 'true';

async function runAll(today, onlyEmail){
  let people = await loadData(today);
  if(pilotOn() && !onlyEmail) people = people.filter(p => PILOT.includes(String(p.email || '').toLowerCase()));
  const out = { people: people.length, dms: 0, skipped: 0, noSlackUser: [], failed: [], channel: null };
  for(const p of people){
    if(onlyEmail && p.email !== onlyEmail) continue;
    if(!onlyEmail && !hasWork(p)){ out.skipped++; continue; }
    const uid = await slackIdFor(p.email);
    if(!uid){ out.noSlackUser.push(p.email); continue; }
    const r = await slack('chat.postMessage', Object.assign({ channel: uid, unfurl_links: false }, dmMessage(p, today)));
    if(r.ok) out.dms++; else out.failed.push(p.name + ': ' + r.error);
  }
  if(!onlyEmail && !pilotOn() && process.env.SLACK_TEAM_CHANNEL){
    const r = await slack('chat.postMessage', Object.assign({ channel: process.env.SLACK_TEAM_CHANNEL, unfurl_links: false }, channelMessage(people, today)));
    out.channel = r.ok ? 'posted' : r.error;
  }
  return out;
}


module.exports = { localParts, runAll };

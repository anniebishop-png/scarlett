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
  const token = process.env.SLACK_BOT_TOKEN || process.env.SLACK_OAUTH_TOKEN || env('SLACK_BOT_TOKEN');   // either name works
  const res = httpGet
    ? await fetch('https://slack.com/api/' + method + '?' + new URLSearchParams(args), { headers: { Authorization: 'Bearer ' + token } })
    : await fetch('https://slack.com/api/' + method, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(args) });
  if(res.status === 429){ await new Promise(r => setTimeout(r, 1500)); return slack(method, args, httpGet); }
  return res.json();
}
let lastLookupError = null;
const slackIdFor = async email => {
  const r = await slack('users.lookupByEmail', { email }, true);
  if(!r.ok) lastLookupError = r.error + (r.needed ? ' (needs ' + r.needed + ')' : '');
  return r.ok ? r.user.id : null;
};

// ----- data -----
async function loadData(today){
  const [users, tasks] = await Promise.all([
    sb('appUsers?select=email,name,role'),
    sb('tasks?select=id,title,client,notes,dateISO,owners,status&status=neq.done&dateISO=lte.' + today + '&limit=5000'),
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
  // Generic titles like "Finance" or "Client comms" say nothing on their own, so show the start of the task's notes.
  const note = String(t.notes || '').replace(/\s+/g, ' ').trim();
  if(note) s += ': ' + esc(note.length > 70 ? note.slice(0, 67).trim() + '...' : note);
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
      p.dueToday.slice(0, 3).forEach(t => { line += '\n   • ' + esc(t.title || 'Untitled task') + (t.client ? '  _' + esc(t.client) + '_' : ''); });
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
// Each person chooses what Slack sends them (notifyPrefs.slackMode, set from the bell panel in Scarlett):
//   daily    = weekday digest of tasks due today and overdue (plus quotes waiting for review), and assignment DMs
//   overdue  = digest only when something is overdue (or a quote is waiting), and assignment DMs
//   assigned = assignment DMs only (the default for anyone who has not chosen)
//   off      = nothing
// If the notifyPrefs table has not been created yet, only the pilot people (Annie, Ruairi) get the digest.
const PILOT = ['annie.bishop@equiratings.com', 'ruairi@equiratings.com'];
async function loadModes(){
  try{
    const rows = (await sb('notifyPrefs?select=email,slackMode')) || [];
    const m = {};
    rows.forEach(r => { m[String(r.email || '').toLowerCase()] = r.slackMode; });
    return { map: m, ok: true };
  }catch(_){ return { map: {}, ok: false }; }
}
function modeOf(modes, email){
  const e = String(email || '').toLowerCase();
  if(!modes.ok) return PILOT.includes(e) ? 'daily' : 'assigned';
  const v = modes.map[e];
  return ['daily', 'overdue', 'assigned', 'off'].includes(v) ? v : 'assigned';
}

async function runAll(today, onlyEmail, opts){
  opts = opts || {};
  const [people, modes] = await Promise.all([loadData(today), loadModes()]);
  const out = { people: people.length, dms: 0, skipped: 0, noSlackUser: [], failed: [], channel: null };
  for(const p of people){
    let msgP = p;
    if(onlyEmail){
      if(p.email !== onlyEmail) continue;           // test send: always goes to the caller
    }else{
      const mode = modeOf(modes, p.email);
      // On Mondays the overdue list goes out in the Monday alert instead, so it is left out of the digest.
      const base = opts.monday ? Object.assign({}, p, { overdue: [] }) : p;
      msgP = base;
      if(mode === 'daily'){ if(!hasWork(base)){ out.skipped++; continue; } }
      else if(mode === 'overdue'){
        if(!(base.overdue.length || base.reviews.length)){ out.skipped++; continue; }
        msgP = Object.assign({}, base, { dueToday: [] });
      }else{ out.skipped++; continue; }
    }
    const uid = await slackIdFor(p.email);
    if(!uid){ out.noSlackUser.push(p.email); out.slackError = lastLookupError; continue; }
    const r = await slack('chat.postMessage', Object.assign({ channel: uid, unfurl_links: false }, dmMessage(msgP, today)));
    if(r.ok) out.dms++; else out.failed.push(p.name + ': ' + r.error);
  }
  if(opts.monday && !onlyEmail) out.monday = await sendMonday(people, today);
  // The team channel post is separate: it only goes out when SLACK_CHANNEL_POST=true and a channel is set.
  if(!onlyEmail && process.env.SLACK_TEAM_CHANNEL && String(process.env.SLACK_CHANNEL_POST || '').toLowerCase() === 'true'){
    const shown = people.filter(p => modeOf(modes, p.email) !== 'off');
    const r = await slack('chat.postMessage', Object.assign({ channel: process.env.SLACK_TEAM_CHANNEL, unfurl_links: false }, channelMessage(shown, today)));
    out.channel = r.ok ? 'posted' : r.error;
  }
  return out;
}

// ----- Monday overdue alert and manager summary -----
// Every Monday morning (same run as the digest) everyone with overdue tasks gets a DM that cannot be switched off,
// and the managers listed in SLACK_MANAGER_EMAILS (default Annie and Ruairi) get a roll-up of who has what.
const MANAGERS_DEFAULT = ['annie.bishop@equiratings.com', 'ruairi@equiratings.com'];
const managerEmails = () => (process.env.SLACK_MANAGER_EMAILS ? String(process.env.SLACK_MANAGER_EMAILS).split(',') : MANAGERS_DEFAULT).map(s => s.trim().toLowerCase()).filter(Boolean);
function daysLate(iso, today){
  const a = Date.parse(iso + 'T12:00:00Z'), b = Date.parse(today + 'T12:00:00Z');
  return Math.max(0, Math.round((b - a) / 86400000));
}
function lateLine(t, today){
  let s = taskLine(t, false, today);
  const n = daysLate(t.dateISO, today);
  return s + '  (due ' + esc(dayLabel(t.dateISO)) + ', ' + n + (n === 1 ? ' day' : ' days') + ' ago)';
}
function mondayAlert(p, today, isTest){
  const n = p.overdue.length;
  const head = 'Overdue tasks, ' + dayLabel(today);
  const blocks = [{ type: 'header', text: { type: 'plain_text', text: head } }];
  if(n){
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: 'Good morning ' + esc(p.name) + '. You have ' + n + (n === 1 ? ' task' : ' tasks') + ' overdue from last week or earlier.' } });
    const shown = p.overdue.slice(0, MAX_LIST), more = n - shown.length;
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: (shown.map(t => lateLine(t, today)).join('\n') + (more > 0 ? '\n_+' + more + ' more in Scarlett_' : '')).slice(0, 2900) } });
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: 'Please mark them done or move the date in Scarlett. This Monday reminder goes to everyone with overdue tasks.' }] });
  }else{
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: 'Test message. You have nothing overdue, so on a real Monday you would not get this alert.' } });
  }
  blocks.push({ type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open Scarlett' }, url: SITE }] });
  return { text: n ? 'You have ' + n + ' overdue ' + (n === 1 ? 'task' : 'tasks') + ' on Scarlett' : head, blocks };
}
function managerSummary(people, today){
  const withOverdue = people.filter(p => p.overdue.length).sort((a, b) => b.overdue.length - a.overdue.length || a.name.localeCompare(b.name));
  const ids = new Set();
  withOverdue.forEach(p => p.overdue.forEach(t => ids.add(t.id)));
  const head = 'Team overdue summary, ' + dayLabel(today);
  const blocks = [{ type: 'header', text: { type: 'plain_text', text: head } }];
  if(!withOverdue.length){
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: 'Nobody has any overdue tasks this Monday.' } });
  }else{
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: '*' + ids.size + ' overdue ' + (ids.size === 1 ? 'task' : 'tasks') + ' across ' + withOverdue.length + (withOverdue.length === 1 ? ' person' : ' people') + '*' } });
    let chunk = '';
    const flush = () => { if(chunk){ blocks.push({ type: 'section', text: { type: 'mrkdwn', text: chunk } }); chunk = ''; } };
    withOverdue.forEach(p => {
      const oldest = p.overdue[0];
      let line = '*' + esc(p.name) + '*  ' + p.overdue.length + ' overdue (oldest ' + esc(dayLabel(oldest.dateISO)) + ')';
      p.overdue.slice(0, 4).forEach(t => { line += '\n   • ' + esc(t.title || 'Untitled task') + (t.client ? '  _' + esc(t.client) + '_' : '') + '  (due ' + esc(dayLabel(t.dateISO)) + ')'; });
      if(p.overdue.length > 4) line += '\n   _+' + (p.overdue.length - 4) + ' more_';
      if(chunk.length + line.length > 2700) flush();
      chunk += (chunk ? '\n\n' : '') + line;
    });
    flush();
  }
  blocks.push({ type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open Scarlett' }, url: SITE }] });
  return { text: head, blocks: blocks.slice(0, 50) };
}
// testEmail: send only to that person (their own alert, even with nothing overdue, plus the manager summary).
async function sendMonday(people, today, testEmail){
  const out = { alerts: 0, summaries: 0, noSlackUser: [], failed: [] };
  for(const p of people){
    if(testEmail ? p.email !== testEmail : !p.overdue.length) continue;
    const uid = await slackIdFor(p.email);
    if(!uid){ out.noSlackUser.push(p.email); continue; }
    const r = await slack('chat.postMessage', Object.assign({ channel: uid, unfurl_links: false }, mondayAlert(p, today, !!testEmail)));
    if(r.ok) out.alerts++; else out.failed.push(p.name + ': ' + r.error);
  }
  const msg = managerSummary(people, today);
  for(const e of (testEmail ? [testEmail] : managerEmails())){
    const uid = await slackIdFor(e);
    if(!uid){ out.noSlackUser.push(e); continue; }
    const r = await slack('chat.postMessage', Object.assign({ channel: uid, unfurl_links: false }, msg));
    if(r.ok) out.summaries++; else out.failed.push(e + ': ' + r.error);
  }
  return out;
}
// Who has chosen what, and whether each person can be found in Slack (no messages are sent).
async function optInReport(){
  const [users, modes] = await Promise.all([sb('appUsers?select=email,name,role'), loadModes()]);
  const rows = [];
  for(const u of (users || [])){
    if(!u.email) continue;
    const e = String(u.email).toLowerCase();
    const chosen = modes.ok ? modes.map[e] : null;
    rows.push({ name: u.name, email: e, chosen: chosen || null, effective: modeOf(modes, e), inSlack: !!(await slackIdFor(e)) });
  }
  return { prefsTable: modes.ok, slackLookupError: lastLookupError, people: rows };
}

// DM people when someone assigns them a task. Never throws; returns a small summary. Goes to the whole team (the pilot limit only applies to the daily digest).
async function notifyAssigned(names, title, sender, senderEmail){
  const out = { dms: 0, skipped: 0, failed: [] };
  try{
    if(!(process.env.SLACK_BOT_TOKEN || process.env.SLACK_OAUTH_TOKEN)) return Object.assign(out, { note: 'Slack not set up' });
    const users = (await sb('appUsers?select=email,name')) || [];
    const modes = await loadModes();
    const want = new Set((names || []).map(n => String(n).trim().toLowerCase()));
    for(const u of users){
      if(!u.email || !u.name || !want.has(String(u.name).trim().toLowerCase())) continue;
      const email = String(u.email).toLowerCase();
      if(email === String(senderEmail || '').toLowerCase()) continue;
      if(modeOf(modes, email) === 'off'){ out.skipped++; continue; }
      const uid = await slackIdFor(email);
      if(!uid){ out.skipped++; continue; }
      const head = esc(sender) + ' assigned you a task: *' + esc(title) + '*';
      const r = await slack('chat.postMessage', {
        channel: uid, unfurl_links: false, text: sender + ' assigned you a task: ' + title,
        blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: head } },
          { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open Scarlett' }, url: SITE }] },
        ],
      });
      if(r.ok) out.dms++; else out.failed.push(u.name + ': ' + r.error);
    }
  }catch(e){ out.failed.push(String(e && e.message || e)); }
  return out;
}

module.exports = { localParts, runAll, sendMonday, optInReport, notifyAssigned, slack, loadData, loadModes, modeOf, channelMessage, SITE, esc, dayLabel };

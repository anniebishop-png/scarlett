// Owner-triggered Slack posts: Annie and Ruairi pick a channel and send a team summary or a card for one task, quote or show.
// POST (Authorization: Bearer <Supabase access token>), only for the people in OWNERS.
//   { action: 'channels' }                                   channels the Slack app can see
//   { action: 'search', q }                                  find tasks, quotes and shows by name
//   { action: 'post', channel, summary: true, note? }        the team summary now
//   { action: 'post', channel, item: {type, id}, note? }     a card for one item (type: task | quote | show)
//   { action: 'post', channel, message }                     your own message (Slack formatting works: *bold*, _italic_, bullets)
// The item is looked up again on the server, so the card always shows what Scarlett really holds.
// Quote cards never include prices.
const { env, sb, sbHeaders } = require('../lib/push-common');
const { localParts, slack, loadData, loadModes, modeOf, channelMessage, SITE, esc, dayLabel } = require('../lib/slack-common');

const OWNERS = ['annie.bishop@equiratings.com', 'ruairi@equiratings.com'];
const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });
const clean = q => String(q || '').replace(/[,()*%\\"']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
const STATUS = { notstarted: 'Not started', inprogress: 'In progress', done: 'Done', blocked: 'Blocked', waiting: 'Waiting' };
const niceStatus = s => STATUS[String(s || '').toLowerCase()] || (s ? String(s).replace(/^./, c => c.toUpperCase()) : '');
const first = e => { const f = String(e || '').split('@')[0].split(/[._-]/)[0]; return f ? f.charAt(0).toUpperCase() + f.slice(1) : 'Someone'; };

function fieldsBlock(pairs){
  const f = pairs.filter(([, v]) => v).map(([k, v]) => ({ type: 'mrkdwn', text: '*' + k + '*\n' + esc(v) }));
  return f.length ? { type: 'section', fields: f.slice(0, 10) } : null;
}
function itemMessage(type, row, sender, note, today){
  let title, pairs;
  if(type === 'task'){
    title = row.title || 'Untitled task';
    pairs = [['Client', row.client], ['Due', row.dateISO ? dayLabel(row.dateISO) : ''], ['Status', niceStatus(row.status)], ['Owners', (row.owners || []).join(', ')]];
  }else if(type === 'quote'){
    title = row.title || 'Quote';
    const rv = row.reviewStatus === 'approved' ? 'Approved' : row.reviewStatus === 'changes' ? 'Changes requested' : row.reviewStatus === 'pending' ? 'Waiting for review' : '';
    pairs = [['Client', row.client], ['Event', row.event], ['Status', niceStatus(row.status)], ['Review', rv], ['Reviewer', row.reviewerName]];
  }else{
    title = row.eventName || 'Show';
    pairs = [['Discipline', row.discipline], ['Clients', (row.clients || []).join(', ')], ['Week of', row.weekId]];
  }
  const label = { task: 'Task', quote: 'Quote', show: 'Show' }[type];
  const blocks = [];
  if(note) blocks.push({ type: 'section', text: { type: 'mrkdwn', text: esc(note) } });
  blocks.push({ type: 'section', text: { type: 'mrkdwn', text: '*' + label + ': ' + esc(title) + '*' } });
  const fb = fieldsBlock(pairs); if(fb) blocks.push(fb);
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: 'Sent by ' + esc(sender) + ' from Scarlett' }] });
  blocks.push({ type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open Scarlett' }, url: SITE }] });
  return { text: label + ': ' + title, blocks };
}

exports.handler = async (event) => {
  if(event.httpMethod !== 'POST') return json(405, { error: 'POST only' });
  try{
    const token = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '');
    if(!token) return json(401, { error: 'Not signed in' });
    const PUBLISHABLE = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_-zgn37TBJaub87sbxxfM3A_HJvyfvMU';
    const ur = await fetch(env('SUPABASE_URL').replace(/\/$/, '') + '/auth/v1/user', { headers: { apikey: PUBLISHABLE, Authorization: 'Bearer ' + token } });
    if(!ur.ok) return json(401, { error: 'Invalid session' });
    const email = String((await ur.json()).email || '').toLowerCase();
    if(!OWNERS.includes(email)) return json(403, { error: 'Only the owners can send Slack updates' });
    if(!(process.env.SLACK_BOT_TOKEN || process.env.SLACK_OAUTH_TOKEN)) return json(400, { error: 'Slack is not set up yet' });

    let body = {};
    try{ body = JSON.parse(event.body || '{}'); }catch(_){ return json(400, { error: 'Bad JSON' }); }

    if(body.action === 'channels'){
      const out = [];
      let cursor = '';
      for(let i = 0; i < 6; i++){
        const args = { types: 'public_channel,private_channel', exclude_archived: 'true', limit: '200' };
        if(cursor) args.cursor = cursor;
        const r = await slack('conversations.list', args, true);
        if(!r.ok) return json(200, { channels: [], error: r.error + (r.needed ? ' (needs ' + r.needed + ')' : '') });
        (r.channels || []).forEach(c => out.push({ id: c.id, name: c.name, isPrivate: !!c.is_private, isMember: !!c.is_member }));
        cursor = r.response_metadata && r.response_metadata.next_cursor;
        if(!cursor) break;
      }
      out.sort((a, b) => (b.isMember - a.isMember) || a.name.localeCompare(b.name));
      return json(200, { channels: out, defaultChannel: process.env.SLACK_TEAM_CHANNEL || '' });
    }

    if(body.action === 'search'){
      const q = clean(body.q);
      if(q.length < 2) return json(200, { results: [] });
      const like = encodeURIComponent('*' + q + '*');
      const [tasks, shows] = await Promise.all([
        sb('tasks?select=id,title,client,dateISO,status&title=ilike.' + like + '&order=dateISO.desc&limit=8'),
        sb('shows?select=id,eventName,discipline,weekId&"archivedAt"=is.null&eventName=ilike.' + like + '&limit=6').catch(() => []),
      ]);
      let quotes = [];
      try{ quotes = (await sb('pricingQuotes?select=id,title,client,event,status&or=(title.ilike.' + like + ',client.ilike.' + like + ')&limit=6')) || []; }catch(_){ /* pricing tables not available */ }
      const results = []
        .concat((tasks || []).map(t => ({ type: 'task', id: t.id, title: t.title || 'Untitled task', sub: [t.client, t.dateISO, niceStatus(t.status)].filter(Boolean).join(' · ') })))
        .concat(quotes.map(x => ({ type: 'quote', id: x.id, title: x.title, sub: [x.client, x.event, niceStatus(x.status)].filter(Boolean).join(' · ') })))
        .concat((shows || []).map(x => ({ type: 'show', id: x.id, title: x.eventName, sub: [x.discipline, x.weekId].filter(Boolean).join(' · ') })));
      return json(200, { results });
    }

    if(body.action === 'post'){
      const channel = String(body.channel || '').trim();
      if(!/^[CG][A-Z0-9]{6,}$/.test(channel)) return json(400, { error: 'Pick a channel' });
      const note = String(body.note || '').replace(/\s+/g, ' ').trim().slice(0, 500);
      const sender = first(email);
      const today = localParts(process.env.SLACK_DIGEST_TZ || 'Europe/London', new Date()).date;
      let msg, what;
      if(body.summary){
        const [people, modes] = await Promise.all([loadData(today), loadModes()]);
        msg = channelMessage(people.filter(p => modeOf(modes, p.email) !== 'off'), today);
        if(note) msg.blocks.splice(1, 0, { type: 'section', text: { type: 'mrkdwn', text: esc(note) } });
        what = 'team summary';
      }else if(typeof body.message === 'string' && body.message.trim()){
        const text = body.message.replace(/\r\n/g, '\n').trim().slice(0, 6000);
        const blocks = [];
        let chunk = '';
        text.split(/\n{2,}/).forEach(par => {
          while(par.length > 2800){ if(chunk){ blocks.push(chunk); chunk = ''; } blocks.push(par.slice(0, 2800)); par = par.slice(2800); }
          if(chunk.length + par.length + 2 > 2800){ blocks.push(chunk); chunk = ''; }
          chunk += (chunk ? '\n\n' : '') + par;
        });
        if(chunk) blocks.push(chunk);
        msg = { text: text.slice(0, 200), blocks: blocks.map(t => ({ type: 'section', text: { type: 'mrkdwn', text: t } })).concat([{ type: 'context', elements: [{ type: 'mrkdwn', text: 'Posted from Scarlett by ' + esc(sender) }] }]) };
        what = 'note: ' + text.replace(/\s+/g, ' ').slice(0, 60);
      }else if(body.item && ['task', 'quote', 'show'].includes(body.item.type) && body.item.id){
        const { type, id } = body.item;
        const q = encodeURIComponent(String(id));
        const rows = type === 'task' ? await sb('tasks?select=*&id=eq.' + q + '&limit=1')
          : type === 'quote' ? await sb('pricingQuotes?select=id,title,client,event,status,"reviewStatus","reviewerName"&id=eq.' + q + '&limit=1')
          : await sb('shows?select=id,"eventName",discipline,clients,"weekId"&id=eq.' + q + '&limit=1');
        if(!rows || !rows[0]) return json(404, { error: 'That item was not found' });
        msg = itemMessage(type, rows[0], sender, note, today);
        what = type + ': ' + (rows[0].title || rows[0].eventName || id);
      }else return json(400, { error: 'Nothing to send' });

      const r = await slack('chat.postMessage', Object.assign({ channel, unfurl_links: false }, msg));
      if(!r.ok) return json(200, { ok: false, error: r.error === 'not_in_channel' ? 'Scarlett is not in that channel. In Slack, type /invite @Scarlett there, then try again.' : r.error });
      try{
        await sb('changeLog', { method: 'POST', headers: sbHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }), body: JSON.stringify({
          id: 'chg_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at: new Date().toISOString(), actor: sender, email,
          action: 'slack-post', coll: 'slack', docId: channel, title: what, snapshot: { channel, what } }) });
      }catch(_){ /* the log is a nice-to-have */ }
      return json(200, { ok: true });
    }
    return json(400, { error: 'Unknown action' });
  }catch(e){
    console.error(e);
    return json(500, { error: String(e && e.message || e) });
  }
};

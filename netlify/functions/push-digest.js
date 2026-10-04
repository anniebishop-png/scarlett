// Scheduled every 30 minutes (see netlify.toml). Sends each person a weekday morning digest at 9:30am in the time zone their
// device reported: how many of their tasks, delivery items and hustle deals are overdue or due today.
const { sb, sendToSubs, inList } = require('../lib/push-common');

const HUSTLE_CLOSED = ['5. Won', '6. Lost', '7. Parked'];
const DIGEST_HOUR = 9, DIGEST_MINUTE = 30;   // 9:30am local; the scheduler runs on the hour and half hour

function localParts(tz, now){
  try{
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' });
    const p = {};
    fmt.formatToParts(now).forEach(x => { p[x.type] = x.value; });
    return { date: p.year + '-' + p.month + '-' + p.day, hour: Number(p.hour) % 24, minute: Number(p.minute), weekday: p.weekday };
  }catch(_){ return null; }
}

async function itemsFor(name, today){
  const owner = encodeURIComponent('{"' + name.replace(/"/g, '') + '"}');
  const [tasks, deliveries, deals] = await Promise.all([
    sb('tasks?select=id,title,dateISO&owners=cs.' + owner + '&status=neq.done&dateISO=lte.' + today),
    sb('deliveryItems?select=id,title,item,category,date,sourceType&owners=cs.' + owner + '&status=neq.delivered&date=lte.' + today),
    sb('hustleOpportunities?select=id,opportunity,nextAction,nextActionDate,stage&owner=eq.' + encodeURIComponent(name) + '&nextActionDate=lte.' + today),
  ]);
  const items = [];
  (tasks || []).forEach(t => {
    if(!t.dateISO || String(t.id).startsWith('spawn_del_')) return;   // mirrors of delivery items are counted below
    items.push({ date: t.dateISO, title: t.title || 'Untitled task' });
  });
  (deliveries || []).forEach(d => {
    if(!d.date || d.sourceType === 'task') return;                    // mirrors of board tasks are counted above
    items.push({ date: d.date, title: d.title || d.item || d.category || 'Delivery item' });
  });
  (deals || []).forEach(o => {
    if(!o.nextActionDate || HUSTLE_CLOSED.includes(o.stage)) return;
    items.push({ date: o.nextActionDate, title: (o.opportunity || 'Deal') + (o.nextAction ? ': ' + o.nextAction : '') });
  });
  items.sort((a, b) => a.date.localeCompare(b.date));
  const overdue = items.filter(i => i.date < today);
  const dueToday = items.filter(i => i.date === today);
  return { overdue, dueToday };
}

exports.handler = async (event) => {
  // Only Netlify's scheduler should run this (its payload carries next_run). Direct web requests are refused so
  // nobody can trigger repeat digests by visiting the URL.
  let scheduled = false;
  try{ scheduled = !!(event && event.body && JSON.parse(event.body).next_run); }catch(_){}
  if(!scheduled) return { statusCode: 403, body: 'Scheduled use only' };
  const now = new Date();
  const subs = (await sb('pushSubscriptions?select=*')) || [];
  const due = subs.filter(s => {
    const lp = s.tz ? localParts(s.tz, now) : null;
    return lp && lp.hour === DIGEST_HOUR && lp.minute >= DIGEST_MINUTE && !['Sat', 'Sun'].includes(lp.weekday) && s.userName;
  });
  const cache = {};
  const results = { devices: due.length, sent: 0, skipped: 0 };
  for(const s of due){
    const lp = localParts(s.tz, now);
    const k = s.userName + '|' + lp.date;
    if(!cache[k]) cache[k] = await itemsFor(s.userName, lp.date);
    const { overdue, dueToday } = cache[k];
    if(!overdue.length && !dueToday.length){ results.skipped++; continue; }
    const bits = [];
    if(dueToday.length) bits.push(dueToday.length + ' due today');
    if(overdue.length) bits.push(overdue.length + ' overdue');
    const first = (dueToday[0] || overdue[0]).title;
    const r = await sendToSubs([s], { title: 'Your day on Scarlett', body: bits.join(', ') + '. Next up: ' + first, url: '/', tag: 'digest-' + lp.date });
    results.sent += r.sent;
  }
  console.log('digest', JSON.stringify(results));
  return { statusCode: 200, body: JSON.stringify(results) };
};

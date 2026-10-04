// POST { to: ["Sam", ...], title: "Task name" }  (Authorization: Bearer <Supabase access token>)
// or   { test: true }  to send the caller a test notification on their own devices.
// Verifies the caller is a signed-in @equiratings.com user, then pushes "<Caller> assigned you: <title>" to every
// device registered by the people in "to". The caller never gets a push for their own assignment.
const { env, sb, sendToSubs, inList } = require('../lib/push-common');

const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });

exports.handler = async (event) => {
  if(event.httpMethod !== 'POST') return json(405, { error: 'POST only' });
  try{
    const auth = event.headers.authorization || event.headers.Authorization || '';
    const token = auth.replace(/^Bearer\s+/i, '');
    if(!token) return json(401, { error: 'Not signed in' });

    const key = env('SUPABASE_SERVICE_ROLE_KEY');
    const ur = await fetch(env('SUPABASE_URL').replace(/\/$/, '') + '/auth/v1/user', { headers: { apikey: key, Authorization: 'Bearer ' + token } });
    if(!ur.ok) return json(401, { error: 'Invalid session' });
    const user = await ur.json();
    const email = String(user.email || '').toLowerCase();
    if(!email.endsWith('@equiratings.com')) return json(403, { error: 'Not allowed' });
    const senderFirst = email.split('@')[0].split(/[._-]/)[0];
    const sender = senderFirst ? senderFirst.charAt(0).toUpperCase() + senderFirst.slice(1) : 'A teammate';

    let body = {};
    try{ body = JSON.parse(event.body || '{}'); }catch(_){ return json(400, { error: 'Bad JSON' }); }

    if(body.test){
      const mine = await sb('pushSubscriptions?select=*&email=eq.' + encodeURIComponent(email));
      const r = await sendToSubs(mine || [], { title: 'Scarlett', body: 'Phone notifications are working on this device.', url: '/', tag: 'test' });
      return json(200, r);
    }

    const to = (Array.isArray(body.to) ? body.to : []).map(String).map(s => s.trim()).filter(Boolean).slice(0, 12);
    const title = String(body.title || 'an item').replace(/\s+/g, ' ').trim().slice(0, 120);
    if(!to.length) return json(400, { error: 'No recipients' });

    const subs = (await sb('pushSubscriptions?select=*&userName=' + encodeURIComponent(inList(to)))) || [];
    const targets = subs.filter(s => String(s.email || '').toLowerCase() !== email);
    if(!targets.length) return json(200, { sent: 0, note: 'No registered devices' });
    const r = await sendToSubs(targets, { title: 'Assigned to you', body: sender + ' assigned you: ' + title, url: '/', tag: 'assign-' + Date.now() });
    return json(200, r);
  }catch(e){
    console.error(e);
    return json(500, { error: String(e && e.message || e) });
  }
};

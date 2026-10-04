// Shared helpers for the push-notification functions. Secrets come from Netlify environment variables:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
const webpush = require('web-push');

function env(name){
  const v = process.env[name];
  if(!v) throw new Error('Missing Netlify environment variable ' + name);
  return v;
}

function sbHeaders(extra){
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  return Object.assign({ apikey: key, Authorization: 'Bearer ' + key }, extra || {});
}

async function sb(path, opts){
  const url = env('SUPABASE_URL').replace(/\/$/, '') + '/rest/v1/' + path;
  const res = await fetch(url, Object.assign({ headers: sbHeaders() }, opts || {}));
  if(!res.ok) throw new Error('Supabase ' + res.status + ' on ' + path.split('?')[0] + ': ' + (await res.text()).slice(0, 200));
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function setupWebPush(){
  webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
}

// Sends one payload to a list of subscription rows. Dead subscriptions (404/410) are deleted.
async function sendToSubs(subs, payload){
  setupWebPush();
  const body = JSON.stringify(payload);
  let sent = 0, removed = 0, failed = 0;
  await Promise.all(subs.map(async s => {
    try{
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 60 * 60 * 12 });
      sent++;
    }catch(e){
      if(e && (e.statusCode === 404 || e.statusCode === 410)){
        removed++;
        try{ await sb('pushSubscriptions?id=eq.' + encodeURIComponent(s.id), { method: 'DELETE' }); }catch(_){}
      }else{
        failed++;
        console.error('push failed', e && e.statusCode, e && e.body);
      }
    }
  }));
  return { sent, removed, failed };
}

// PostgREST list filter, e.g. in.("Annie","Sam L")
function inList(values){
  return 'in.(' + values.map(v => '"' + String(v).replace(/"/g, '') + '"').join(',') + ')';
}

module.exports = { env, sb, sbHeaders, sendToSubs, inList };

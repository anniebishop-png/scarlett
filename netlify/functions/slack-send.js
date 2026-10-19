// On-demand Slack to-dos. POST {test:true} sends the caller their own message now; POST {all:true} runs the full send now.
// POST {report:true} lists who has opted in (no messages). POST {monday:true,test:true} sends you the Monday overdue alert and manager summary; {monday:true} sends them to everyone now.
// Authorization: Bearer <Supabase access token>. Managers only.
const { env, sb } = require('../lib/push-common');
const { localParts, runAll, sendMonday, optInReport, loadData } = require('../lib/slack-common');

const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });

exports.handler = async (event) => {
  if(event.httpMethod !== 'POST') return json(405, { error: 'POST only' });
  try{
    const auth = event.headers.authorization || event.headers.Authorization || '';
    const token = auth.replace(/^Bearer\s+/i, '');
    if(!token) return json(401, { error: 'Not signed in' });
    const PUBLISHABLE = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_-zgn37TBJaub87sbxxfM3A_HJvyfvMU';
    const ur = await fetch(env('SUPABASE_URL').replace(/\/$/, '') + '/auth/v1/user', { headers: { apikey: PUBLISHABLE, Authorization: 'Bearer ' + token } });
    if(!ur.ok) return json(401, { error: 'Invalid session' });
    const email = String((await ur.json()).email || '').toLowerCase();
    if(!email.endsWith('@equiratings.com')) return json(403, { error: 'Not allowed' });
    const me = ((await sb('appUsers?select=role&email=eq.' + encodeURIComponent(email))) || [])[0];
    if(!me || me.role !== 'manager') return json(403, { error: 'Managers only' });

    let body = {};
    try{ body = JSON.parse(event.body || '{}'); }catch(_){ return json(400, { error: 'Bad JSON' }); }
    const today = localParts(process.env.SLACK_DIGEST_TZ || 'Europe/London', new Date()).date;
    if(body.report) return json(200, await optInReport());
    // {monday:true, test:true}: send the caller their own Monday alert and the manager summary. {monday:true}: send the real Monday messages now.
    if(body.monday) return json(200, await sendMonday(await loadData(today), today, body.test ? email : undefined));
    if(body.test) return json(200, await runAll(today, email));
    if(body.all) return json(200, await runAll(today));
    return json(400, { error: 'Send {test:true} or {all:true}' });
  }catch(e){
    console.error('slack send failed', e && e.message);
    return json(500, { error: String((e && e.message) || e) });
  }
};

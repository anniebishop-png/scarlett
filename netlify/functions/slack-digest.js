// Weekday morning to-dos in Slack. Scheduled in netlify.toml (every 30 minutes); it only sends in the SLACK_DIGEST_HOUR
// hour (default 9) in SLACK_DIGEST_TZ (default Europe/London), Monday to Friday. Netlify does not allow scheduled functions
// to be called over the web, so the on-demand version lives in slack-send.js.
const { localParts, runAll } = require('../lib/slack-common');

exports.handler = async () => {
  try{
    const tz = process.env.SLACK_DIGEST_TZ || 'Europe/London', hour = Number(process.env.SLACK_DIGEST_HOUR || 9);
    const lp = localParts(tz, new Date());
    if(lp.hour !== hour || lp.minute >= 30 || ['Sat', 'Sun'].includes(lp.weekday)) return { statusCode: 200, body: JSON.stringify({ skipped: 'not send time' }) };
    const out = await runAll(lp.date, undefined, { monday: lp.weekday === 'Mon' });
    console.log('slack digest', JSON.stringify(out));
    return { statusCode: 200, body: JSON.stringify(out) };
  }catch(e){
    console.error('slack digest failed', e && e.message);
    return { statusCode: 500, body: String((e && e.message) || e) };
  }
};

# Scarlett to-dos in Slack

Every weekday at 9:00am (London time) Scarlett:
- DMs each teammate their tasks due today and overdue. Managers also see quotes waiting for their review.
- Posts a team summary in one channel (no quote details there).
- Skips anyone with nothing due.

The code is `netlify/lib/slack-common.js`, run on a schedule by `netlify/functions/slack-digest.js` (see `netlify.toml`) and on demand by `netlify/functions/slack-send.js`. It needs no new database tables.

## One-time setup (about 10 minutes)
1. Go to https://api.slack.com/apps, **Create New App**, **From a manifest**, pick the EquiRatings workspace and paste:

```json
{
  "display_information": { "name": "Scarlett", "description": "Daily to-dos from Scarlett" },
  "features": { "bot_user": { "display_name": "Scarlett", "always_online": true } },
  "oauth_config": { "scopes": { "bot": ["chat:write", "chat:write.public", "users:read", "users:read.email", "im:write"] } },
  "settings": { "org_deploy_enabled": false, "socket_mode_enabled": false, "token_rotation_enabled": false }
}
```
2. **Install to Workspace** (a Slack admin may need to approve). Copy the **Bot User OAuth Token** (starts `xoxb-`). Treat it like a password and never paste it into chat or code.
3. In Slack, open the team channel, click its name, scroll to the bottom and copy the **Channel ID** (starts with `C`).
4. In Netlify: Site configuration, Environment variables, add:
   - `SLACK_BOT_TOKEN` = the xoxb token
   - `SLACK_TEAM_CHANNEL` = the channel ID
   - optional `SLACK_DIGEST_TZ` (default `Europe/London`) and `SLACK_DIGEST_HOUR` (default `9`)
5. Netlify: Deploys, **Trigger deploy**, so the new variables are picked up.

## Matching people
Scarlett matches each person to Slack by their `@equiratings.com` email (the one in the Scarlett users list). If someone uses a
different email in Slack they are skipped; the function log lists them under `noSlackUser`.

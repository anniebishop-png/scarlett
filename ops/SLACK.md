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
  "oauth_config": { "scopes": { "bot": ["chat:write", "chat:write.public", "users:read", "users:read.email", "im:write", "channels:read", "groups:read"] } },
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

## Who gets what (each person chooses)
In the bell panel in Scarlett, under **Slack messages**, each person picks one:
- **Every weekday**: the 9am DM with tasks due today and overdue, plus assignment DMs.
- **Only when something is overdue**: a 9am DM only on days they have overdue tasks, plus assignment DMs.
- **Only when I'm added to a task** (the default for everyone who has not chosen): assignment DMs only.
- **Off**: nothing from Slack.
Managers also get quotes waiting for their review in the first two. The choice is stored in the `notifyPrefs` table (`sql/2026-10-notify-prefs.sql`). Until that SQL is run, only Annie and Ruairi get the 9am digest.
The team channel post is separate: it only goes out when `SLACK_CHANNEL_POST` is `true` and `SLACK_TEAM_CHANNEL` is set, and it leaves out anyone who chose Off.

## Assignment DMs
When someone assigns a task to another person, `push-assign.js` sends the phone/desktop push as before and also a Slack DM ("Sam assigned you a task: ..."). The sender never gets one for their own assignment. These go to the whole team unless they chose Off. If Slack is not set up the Slack part is silently skipped.

The token variable can be called either `SLACK_BOT_TOKEN` or `SLACK_OAUTH_TOKEN`.

## Send to Slack (owners only)
Annie and Ruairi see a **Slack** button in the top bar. It opens a window to pick a channel and send either the team summary right now or a card for one task, quote or show (with an optional note). Quote cards never show prices. Posting needs two confirmations (Send, then Confirm). It runs through `netlify/functions/slack-post.js`, which checks the caller is one of the two owners, and each post is written to the change log.
The channel list needs the `channels:read` and `groups:read` scopes (add them under OAuth & Permissions, then Reinstall to Workspace). Without them the window still works if you paste a channel ID. For a private channel, invite Scarlett first with `/invite @Scarlett`.

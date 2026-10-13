# Scarlett (BECS dashboard)

Scarlett is EquiRatings' internal ops tracker: the weekly board, shows, client deliverables, Hustle, podcast schedule, clients, and a managers-only Pricing section.
Live at https://scarlett.equiratings.com/

## The short version for anyone taking this over
Nothing in Scarlett lives inside Claude. It is three ordinary services, and Claude is only the tool that has been used to edit the code.

| Piece | Where it lives | What it does |
|---|---|---|
| Code | This GitHub repo (`anniebishop-png/scarlett`, branch `main`) | The whole app is one static page, `index.html`, plus a few small files |
| Hosting | Netlify (site `scarlettequiratings`) | Serves the page and runs the small server functions. Every push to `main` deploys automatically in about a minute |
| Data and logins | Supabase (project `hdqryvhwyzxtpvooowns`) | Postgres database, sign-in, row-level security (the real access rules) |

Any developer, or any AI coding tool, can pick this up from the repo. There is no build framework to learn.

## What is in the repo
- `index.html`: the app (HTML, CSS and JavaScript in one file). Pricing, review, Hustle, delivery tracker and the rest are sections inside it.
- `supabase-firestore-shim.js`: a thin layer that lets the app talk to Supabase using Firestore-style calls (`db.collection('tasks').doc(id).set(...)`). The app was originally written for that style.
- `sw.js`, `manifest.json`, icons: installable app and push notifications.
- `netlify/functions/`: small server functions. `push-assign` and `push-digest` (phone notifications), `slack-digest` and `slack-send` (Slack to-dos). Shared code is in `netlify/lib/`.
- `scripts/backup.mjs`: nightly backup of every table. `scripts/stamp-build.js`: runs on each deploy so open copies can offer a refresh.
- `sql/`: database changes, one file per change, named by month. See below.
- `ops/`: set-up notes (`BACKUP.md`, `SLACK.md`, `OFFBOARDING.md`).
- `netlify.toml`: build command, function folder and schedules.

## Deploying a change
1. Edit the files and commit to `main` (or push a branch and merge it).
2. Netlify builds and publishes automatically. Check the Deploys tab if something looks wrong.
3. If the change needs new database columns or tables, run its file from `sql/` in the Supabase SQL Editor (choose "Run and enable RLS" if Supabase shows the warning). The change that needs it says so in its commit message and its SQL file.

Everything in this repo is publicly downloadable from the site, because Netlify publishes the repo root. So never commit prices, keys, tokens or personal data. Secrets live in Netlify environment variables.

## Who can see what
- Sign-in is email and password, limited to `@equiratings.com`. The sign-in page enforces this, and a restrictive database rule (`equiratings_only`) refuses everyone else's reads and writes, so the database is the real lock.
- Roles are in the `appUsers` table: `manager` or `member`. Managers see Pricing. Hustle shows members only their own opportunities.
- The Price list and tiers tab, and the price and rate tables behind it, can only be edited by Annie, Geogs and Diarm. That is enforced by database policies (`pricing_edit`), not just hidden in the page.
- Hiding a button in the page is a convenience. Any new restriction should be a database policy first.

## Data tables (Supabase, schema `public`)
`tasks`, `weeks`, `recurringTasks`, `shows`, `deliveryItems`, `contractClients`, `clientProfiles`, `clientOps`, `podcastEpisodes`, `hustleOpportunities`, `teamActivity`, `changeLog`, `appUsers`, `pushSubscriptions`, `pricingServices`, `pricingPackages`, `pricingQuotes`, `pricingSettings`, plus small reference tables `clients`, `divisions`, `deliverable_presets`, `shows_reference` and `team`.

## Environment variables (Netlify, Site configuration, Environment variables)
| Name | Used for |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Functions that read everyone's data (digests, Slack). The service key bypasses row security, treat it like a password |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Phone and desktop push notifications |
| `SLACK_BOT_TOKEN`, `SLACK_TEAM_CHANNEL` | Slack to-dos (see `ops/SLACK.md`). Optional `SLACK_DIGEST_TZ`, `SLACK_DIGEST_HOUR` |

The public Supabase key that the page uses is not secret and is in `index.html`.

## Rebuilding from nothing
1. Create a Supabase project. Create the tables listed above using the files in `sql/` (see "Database history" for what is and is not covered), then run the policy files.
2. Restore data from a backup JSON (the Backup button in the app or the nightly file, see `ops/BACKUP.md`).
3. Create a Netlify site from this GitHub repo, set the environment variables above, and point the domain at it.
4. Put the new project's URL and public key into `index.html` (search for `createClient`).
5. Add users to `appUsers` and create their sign-ins in Supabase, Authentication.

## Database history
`sql/schema-snapshot.sql` is the full table structure exported from the live database on 2026-10-14 (tables, columns, defaults, keys). Running it creates every table. Row-level security policies are defined in the dated files in `sql/` (appUsers and `is_manager()` in `2026-10-hustle-permissions.sql`, pricing in `2026-10-pricing*.sql`). The policies on the older tables are not captured in the repo yet. `sql/export-schema.sql` has the queries to export them.
Rule going forward: any time SQL is run in Supabase, the same SQL is saved as a new dated file in `sql/` and committed.

## Backups and other people
- Data is backed up by the Backup button (Annie and Geogs) and a nightly job, see `ops/BACKUP.md`.
- When someone leaves, follow `ops/OFFBOARDING.md`.

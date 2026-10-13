# Scarlett backups

Scarlett's code is safe in this GitHub repo. Its data (tasks, shows, clients, Hustle, podcast, activity log, users)
lives only in Supabase, so it is backed up two ways.

## 1. Backup button (manual)
Annie and Geogs see a **Backup** button in the top right of the home header. One click downloads every table as a
single JSON file, for example `scarlett-backup-2026-10-13-1152.json`.

## 2. Nightly backup (automatic)
`scripts/backup.mjs` writes the same JSON file every night, run by a GitHub Action. Each file is kept for 90 days
as a downloadable "artifact" on the run (Actions tab, open a run, Artifacts at the bottom). A failed run emails the
person who set the workflow up.

### One-time setup (about 5 minutes, done in the GitHub and Supabase websites)
1. Make sure this repository is **Private** (Settings, scroll to the bottom, Change visibility). The backup contains
   everyone's tasks and Hustle data.
2. In Supabase: Project Settings, API Keys. Copy the **service_role** key (or the **secret** key if the project uses
   the new key style). It can read everything, so treat it like a password and never paste it into chat or code.
3. In GitHub: this repo, Settings, Secrets and variables, Actions, **New repository secret**. Add two:
   - `SUPABASE_URL` = `https://hdqryvhwyzxtpvooowns.supabase.co`
   - `SUPABASE_SERVICE_KEY` = the key from step 2
4. In GitHub: Add file, Create new file. Name it `.github/workflows/backup.yml` (typing the slashes makes the
   folders) and paste in the contents of `ops/backup-workflow.yml`. Commit it to main.
5. Open the **Actions** tab, choose "Nightly Scarlett backup", **Run workflow**. When it goes green, open the run
   and check the Artifacts section has a `scarlett-backup-DATE` file. After that it runs by itself every night.

### Good to know
- New tables added to Scarlett later are picked up automatically. Device push keys are left out on purpose.
- Task attachments (files in Supabase storage) are not in the JSON, only the records that point to them.
- GitHub pauses scheduled workflows in a repo with no activity for 60 days. Scarlett is edited far more often than
  that, but if edits ever stop, run the workflow by hand now and then.
- Keep a copy of a recent backup outside GitHub too (a shared drive), in case the GitHub account is the problem.

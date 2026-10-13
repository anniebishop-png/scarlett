# Offboarding checklist

Use this when someone leaves the team or should lose access. Do it the same day. Takes about 10 minutes.

## 1. Scarlett sign-in (Supabase)
1. Open Supabase, project Scarlett, **Authentication, Users**.
2. Find the person by email, open the menu on their row, and choose **Delete user** (or **Ban user** if you may want to restore them).
3. Their sessions stop working at the next refresh (within about an hour).

## 2. Scarlett role
1. Supabase, **Table Editor, appUsers**: delete the person's row (or set `role` to `member` if they are staying but should lose manager access).
2. Pricing and Hustle access are driven by this table, so this removes manager-only access straight away.

## 3. Their work
1. In Scarlett, search tasks, delivery items and Hustle opportunities for their name and reassign anything still open.
2. Recurring tasks: check **recurringTasks** for their name.

## 4. Other places
- Slack: deactivate or remove from the team channel (their daily to-do DM stops once they are no longer in `appUsers`).
- Netlify and GitHub: remove them if they had access.
- Shared logins: change any shared passwords they knew (social accounts, Canva, Dropbox, and so on).
- Google Workspace: handled by whoever manages company email.

## 5. Record it
Write the date and what you did in the team's notes, so there is a record of who had access and when it ended.

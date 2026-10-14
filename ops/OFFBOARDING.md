# Offboarding checklist

Use this when someone leaves the team or should lose access. Do it the same day. Takes about 10 minutes.

## 1 and 2. Scarlett access (the quick way)
1. Sign in as Annie or Geogs and click **Access** in the top right of the header.
2. Find the person and click **Deactivate**, then **Confirm**.
3. This stops them signing in, removes their role and phone alerts, takes them out of the daily Slack to-dos, and logs it in the change log. Their tasks and history stay. A page they already have open can keep working for up to an hour.
4. Mistake? The same screen has **Bring back** under Deactivated.

If the Access button is not available, do it by hand: Supabase, Authentication, Users, delete (or ban) the user; then Table Editor, `appUsers`, delete their row.

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

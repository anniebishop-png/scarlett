-- Slack message preference, one row per person (id = their lowercase email).
-- slackMode: daily | overdue | assigned | off.  Nobody with no row is treated as 'assigned' (assignment DMs only).
-- Safe to run more than once. In the Supabase prompt "Potential issues detected" choose "Run and enable RLS".

create table if not exists public."notifyPrefs" (
  id text primary key,
  email text not null,
  "slackMode" text not null default 'assigned',
  updated_at timestamptz default now(),
  constraint notifyprefs_mode_ok check ("slackMode" in ('daily','overdue','assigned','off'))
);

alter table public."notifyPrefs" enable row level security;

drop policy if exists equiratings_only on public."notifyPrefs";
create policy equiratings_only on public."notifyPrefs" as restrictive for all to authenticated
  using ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) ~~ '%@equiratings.com'::text))
  with check ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) ~~ '%@equiratings.com'::text));

-- each person can read and change only their own row
drop policy if exists "own notify prefs" on public."notifyPrefs";
create policy "own notify prefs" on public."notifyPrefs" as permissive for all to authenticated
  using (lower(email) = lower(auth.jwt() ->> 'email'))
  with check (lower(email) = lower(auth.jwt() ->> 'email'));

-- keep the daily digest for the two people who have it now
insert into public."notifyPrefs" (id, email, "slackMode") values
  ('annie.bishop@equiratings.com', 'annie.bishop@equiratings.com', 'daily'),
  ('ruairi@equiratings.com', 'ruairi@equiratings.com', 'daily')
on conflict (id) do nothing;

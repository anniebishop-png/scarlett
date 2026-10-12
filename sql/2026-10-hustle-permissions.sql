-- Scarlett: roles and Hustle permissions (managers see everything, members see opportunities they own)

-- 1. Who is who. Edit roles in Table Editor > appUsers (manager or member).
create table if not exists public."appUsers" (
  email text primary key,
  name text not null,
  role text not null default 'member' check (role in ('manager','member'))
);
alter table public."appUsers" enable row level security;
drop policy if exists appusers_select on public."appUsers";
drop policy if exists equiratings_only on public."appUsers";
create policy appusers_select on public."appUsers" for select to authenticated using (true);
create policy equiratings_only on public."appUsers" as restrictive for all to authenticated
  using (lower(coalesce(auth.jwt()->>'email','')) like '%@equiratings.com')
  with check (lower(coalesce(auth.jwt()->>'email','')) like '%@equiratings.com');
revoke insert, update, delete on public."appUsers" from authenticated, anon;

insert into public."appUsers" (email, name, role) values
  ('annie.bishop@equiratings.com', 'Annie',     'manager'),
  ('brayden@equiratings.com',      'Brayden',   'manager'),
  ('diarm@equiratings.com',        'Diarm',     'manager'),
  ('nicole@equiratings.com',       'Nicole',    'manager'),
  ('ruairi@equiratings.com',       'Geogs',     'manager'),
  ('sam@equiratings.com',          'Sam',       'manager'),
  ('ali@equiratings.com',          'Ali',       'member'),
  ('maria@equiratings.com',        'Maz',       'member'),
  ('georgia@equiratings.com',      'Georgia',   'member'),
  ('charlotte@equiratings.com',    'Charlotte', 'member'),
  ('emma@equiratings.com',         'Emma',      'member'),
  ('samantha@equiratings.com',     'Sammy',     'member'),
  ('sean@equiratings.com',         'Sean',      'member'),
  ('marissa@equiratings.com',      'Marissa',   'member'),
  ('rozzie@equiratings.com',       'Rozzie',    'member')
on conflict (email) do update set name = excluded.name, role = excluded.role;

-- 2. Helpers the rules use
create or replace function public.is_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public."appUsers"
    where lower(email) = lower(coalesce(auth.jwt()->>'email','')) and role = 'manager');
$$;
create or replace function public.my_name() returns text
language sql stable security definer set search_path = public as $$
  select name from public."appUsers"
    where lower(email) = lower(coalesce(auth.jwt()->>'email','')) limit 1;
$$;
revoke execute on function public.is_manager() from public, anon;
revoke execute on function public.my_name() from public, anon;
grant execute on function public.is_manager() to authenticated;
grant execute on function public.my_name() to authenticated;

-- 3. Hustle opportunities: managers everything; members only their own
alter table public."hustleOpportunities" enable row level security;
do $$
declare r record;
begin
  for r in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'hustleOpportunities' and permissive = 'PERMISSIVE'
  loop
    execute format('drop policy %I on public."hustleOpportunities"', r.policyname);
  end loop;
end $$;
create policy hustle_read on public."hustleOpportunities" for select to authenticated
  using (public.is_manager() or "owner" = public.my_name());
create policy hustle_insert on public."hustleOpportunities" for insert to authenticated
  with check (public.is_manager() or "owner" = public.my_name());
create policy hustle_update on public."hustleOpportunities" for update to authenticated
  using (public.is_manager() or "owner" = public.my_name()) with check (true);
create policy hustle_delete on public."hustleOpportunities" for delete to authenticated
  using (public.is_manager() or "owner" = public.my_name());

-- 4. The change log must not leak other people's Hustle entries
drop policy if exists changelog_select on public."changeLog";
create policy changelog_select on public."changeLog" for select to authenticated
  using (coll <> 'hustleOpportunities' or public.is_manager()
         or lower(coalesce(email,'')) = lower(coalesce(auth.jwt()->>'email','')));

-- ---------------------------------------------------------------
-- UNDO (only if needed): puts Hustle back to "everyone on the team sees everything"
-- drop policy if exists hustle_read on public."hustleOpportunities";
-- drop policy if exists hustle_insert on public."hustleOpportunities";
-- drop policy if exists hustle_update on public."hustleOpportunities";
-- drop policy if exists hustle_delete on public."hustleOpportunities";
-- create policy hustle_all on public."hustleOpportunities" for all to authenticated using (true) with check (true);
-- drop policy if exists changelog_select on public."changeLog";
-- create policy changelog_select on public."changeLog" for select to authenticated using (true);

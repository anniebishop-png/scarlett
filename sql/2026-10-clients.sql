-- Scarlett: Clients (one record per client: owner, team, contract dates, shows, links, notes)
-- A client's name is its key everywhere in Scarlett (tasks, delivery items, shows), so it is the table's key too.

create table if not exists public.clients (
  name text primary key,
  status text not null default 'active' check (status in ('active','prospect','past')),
  owner text,
  team text[] not null default '{}',
  "contractStart" text,
  "contractEnd" text,
  shows text[] not null default '{}',
  links jsonb not null default '[]'::jsonb,
  notes text,
  "createdFrom" text,
  "createdBy" text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.clients enable row level security;
do $$
declare r record;
begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'clients'
  loop
    execute format('drop policy %I on public.clients', r.policyname);
  end loop;
end $$;

-- Everyone on the team can see, add and edit clients; only managers can delete one.
create policy clients_read   on public.clients for select to authenticated using (true);
create policy clients_insert on public.clients for insert to authenticated with check (true);
create policy clients_update on public.clients for update to authenticated using (true) with check (true);
create policy clients_delete on public.clients for delete to authenticated using (public.is_manager());
create policy equiratings_only on public.clients as restrictive for all to authenticated
  using (lower(coalesce(auth.jwt()->>'email','')) like '%@equiratings.com')
  with check (lower(coalesce(auth.jwt()->>'email','')) like '%@equiratings.com');

revoke all on public.clients from anon;
grant select, insert, update, delete on public.clients to authenticated;

-- live updates for other people's changes
do $$ begin
  alter publication supabase_realtime add table public.clients;
exception when duplicate_object then null; when undefined_object then null;
end $$;

notify pgrst, 'reload schema';

-- Scarlett: Pricing (managers only)
-- Four tables, all locked to managers by the database itself (public.is_manager()), so other people
-- cannot read the prices even through the API. Run once in the Supabase SQL Editor.
-- The price list itself is loaded separately (not stored in the code), after this has been run.
-- Staff costs are derived hourly rates and cost floors only. No salaries, no margins.

create table if not exists public."pricingServices" (
  id text primary key,
  name text not null,
  section text not null default 'Other',
  "sortOrder" integer not null default 0,
  team text,
  "stdHours" numeric,
  "seniorHours" numeric,
  "costFloor" numeric,
  price numeric,
  billing text not null default 'per event',
  tiers text[] not null default '{}',
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public."pricingPackages" (
  id text primary key,
  name text not null,
  blurb text,
  "sortOrder" integer not null default 0,
  lines jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public."pricingQuotes" (
  id text primary key,
  title text not null,
  client text,
  event text,
  "showId" text,
  "packageName" text,
  status text not null default 'draft',
  lines jsonb not null default '[]'::jsonb,
  discount numeric not null default 0,
  total numeric not null default 0,
  "totalStd" numeric not null default 0,
  "totalSenior" numeric not null default 0,
  notes text,
  "createdBy" text,
  "createdAt" text,
  "updatedAt" text,
  "archivedAt" text
);
create table if not exists public."pricingSettings" (
  id text primary key,
  "stdRate" numeric,
  "seniorRate" numeric
);

do $$
declare t text; r record;
begin
  foreach t in array array['pricingServices','pricingPackages','pricingQuotes','pricingSettings'] loop
    execute format('alter table public.%I enable row level security', t);
    for r in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', r.policyname, t);
    end loop;
    execute format('create policy pricing_managers on public.%I for all to authenticated using (public.is_manager()) with check (public.is_manager())', t);
    execute format($f$create policy equiratings_only on public.%I as restrictive for all to authenticated using (lower(coalesce(auth.jwt()->>'email','')) like '%%@equiratings.com') with check (lower(coalesce(auth.jwt()->>'email','')) like '%%@equiratings.com')$f$, t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; when undefined_object then null;
    end;
  end loop;
end $$;

notify pgrst, 'reload schema';

-- Scarlett: database structure snapshot, exported from the live Supabase project on 2026-10-14.
-- Structure only (tables, columns, defaults, keys). No data, no prices, no keys.
-- To rebuild the database, run this file first, then the dated files in this folder for row-level security policies
-- and helper functions (sql/2026-10-hustle-permissions.sql creates appUsers and is_manager(); sql/2026-10-pricing*.sql
-- the pricing policies). The row-level security policies of the older tables are not captured yet: run query 2 in
-- sql/export-schema.sql and append the result here.
-- Safe to run on a database that already has these tables (create table if not exists).

create table if not exists public."appUsers" (
  email text not null,
  name text not null,
  role text not null default 'member'::text,
  PRIMARY KEY (email)
);

create table if not exists public."changeLog" (
  id text not null,
  at text not null,
  actor text,
  email text,
  action text not null,
  coll text not null,
  "docId" text not null,
  title text,
  client text,
  "weekId" text,
  changes jsonb,
  snapshot jsonb,
  created_at timestamp with time zone default now(),
  PRIMARY KEY (id)
);

create table if not exists public."clientOps" (
  id text not null,
  client text,
  "showId" text default ''::text,
  "eventName" text default ''::text,
  "weekId" text default ''::text,
  kind text not null,
  "dueDate" text default ''::text,
  status text not null default 'pending'::text,
  notes text default ''::text,
  "doneAt" text,
  PRIMARY KEY (id)
);

create table if not exists public."clientProfiles" (
  name text not null,
  status text not null default 'active'::text,
  owner text,
  team text[] not null default '{}'::text[],
  "contractStart" text,
  "contractEnd" text,
  shows text[] not null default '{}'::text[],
  links jsonb not null default '[]'::jsonb,
  notes text,
  "createdFrom" text,
  "createdBy" text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  PRIMARY KEY (name)
);

create table if not exists public.clients (
  id text not null,
  name text not null,
  UNIQUE (name),
  PRIMARY KEY (id)
);

create table if not exists public."contractClients" (
  client text not null,
  categories jsonb not null default '[]'::jsonb,
  PRIMARY KEY (client)
);

create table if not exists public.deliverable_presets (
  id text not null,
  discipline text not null,
  item text not null,
  cmh_grade text,
  day_offset text,
  PRIMARY KEY (id)
);

create table if not exists public."deliveryItems" (
  id text not null default (gen_random_uuid())::text,
  client text,
  item text default ''::text,
  date text default ''::text,
  title text default ''::text,
  graphics text default ''::text,
  status text not null default 'notstarted'::text,
  notes text default ''::text,
  category text,
  "sourceType" text,
  "sourceId" text,
  downloads text default ''::text,
  reach text default ''::text,
  division text,
  owners text[],
  updated_at timestamp with time zone not null default now(),
  "deliveredAt" timestamp with time zone,
  "assignedTo" text[],
  "assignedBy" text,
  "assignedAt" timestamp with time zone,
  link text,
  PRIMARY KEY (id)
);

create table if not exists public.divisions (
  id text not null,
  name text not null,
  UNIQUE (name),
  PRIMARY KEY (id)
);

create table if not exists public."hustleOpportunities" (
  id text not null,
  opportunity text,
  stage text,
  owner text,
  "nextAction" text,
  division text,
  service text,
  discipline text[],
  start text,
  "end" text,
  engage text,
  created_at timestamp with time zone default now(),
  "nextActionDate" text,
  "closedReason" text,
  "stageChangedAt" timestamp with time zone,
  "expectedClose" text,
  "sizeBand" text,
  "clientType" text,
  contact text,
  "proposalLink" text,
  "activityLog" jsonb not null default '[]'::jsonb,
  updated_at timestamp with time zone not null default now(),
  "assignedTo" text[],
  "assignedBy" text,
  "assignedAt" timestamp with time zone,
  value numeric,
  "pipelineYear" integer,
  PRIMARY KEY (id)
);

create table if not exists public."podcastEpisodes" (
  id text not null default (gen_random_uuid())::text,
  date text,
  platform text,
  title text default ''::text,
  brand text default ''::text,
  ads text default ''::text,
  lead text default ''::text,
  guest text default ''::text,
  status text not null default 'planned'::text,
  notes text default ''::text,
  "recordDate" text,
  PRIMARY KEY (id)
);

create table if not exists public."pricingPackages" (
  id text not null,
  name text not null,
  blurb text,
  "sortOrder" integer not null default 0,
  lines jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone not null default now(),
  PRIMARY KEY (id)
);

create table if not exists public."pricingQuotes" (
  id text not null,
  title text not null,
  client text,
  event text,
  "showId" text,
  "packageName" text,
  status text not null default 'draft'::text,
  lines jsonb not null default '[]'::jsonb,
  discount numeric not null default 0,
  total numeric not null default 0,
  "totalStd" numeric not null default 0,
  "totalSenior" numeric not null default 0,
  notes text,
  "createdBy" text,
  "createdAt" text,
  "updatedAt" text,
  "archivedAt" text,
  "reviewStatus" text,
  reviewer text,
  "reviewerName" text,
  "reviewRequestedBy" text,
  "reviewRequestedAt" text,
  "reviewNote" text,
  "reviewedBy" text,
  "reviewedAt" text,
  "reviewLog" jsonb not null default '[]'::jsonb,
  PRIMARY KEY (id)
);

create table if not exists public."pricingServices" (
  id text not null,
  name text not null,
  section text not null default 'Other'::text,
  "sortOrder" integer not null default 0,
  team text,
  "stdHours" numeric,
  "seniorHours" numeric,
  "costFloor" numeric,
  price numeric,
  billing text not null default 'per event'::text,
  tiers text[] not null default '{}'::text[],
  notes text,
  active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  PRIMARY KEY (id)
);

create table if not exists public."pricingSettings" (
  id text not null,
  "stdRate" numeric,
  "seniorRate" numeric,
  PRIMARY KEY (id)
);

create table if not exists public."pushSubscriptions" (
  id text not null,
  "userName" text,
  email text,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  tz text,
  "userAgent" text,
  updated_at timestamp with time zone default now(),
  PRIMARY KEY (id)
);

create table if not exists public."recurringTasks" (
  id text not null default (gen_random_uuid())::text,
  client text,
  title text,
  tag text default ''::text,
  division text default ''::text,
  owners text[] not null default '{}'::text[],
  status text not null default 'notstarted'::text,
  notes text default ''::text,
  "dayOfWeek" integer,
  active boolean not null default true,
  type text default ''::text,
  "startWeek" text,
  PRIMARY KEY (id)
);

create table if not exists public.shows (
  id text not null default (gen_random_uuid())::text,
  "weekId" text,
  "eventName" text not null,
  discipline text,
  clients text[] not null default '{}'::text[],
  deliverables text default ''::text,
  postmortem jsonb,
  created_at timestamp with time zone not null default now(),
  "archivedAt" text,
  "archivedBy" text,
  PRIMARY KEY (id)
);

create table if not exists public.shows_reference (
  id text not null,
  event_name text not null,
  level text,
  discipline text not null,
  PRIMARY KEY (id)
);

create table if not exists public.tasks (
  id text not null,
  client text,
  "dateISO" text,
  title text,
  tag text default ''::text,
  division text default ''::text,
  owners text[] not null default '{}'::text[],
  status text not null default 'notstarted'::text,
  notes text default ''::text,
  "weekId" text,
  "showId" text default ''::text,
  "order" integer default 0,
  "calendarSynced" boolean default false,
  "recurringId" text,
  "sourceType" text,
  "sourceId" text,
  created_at timestamp with time zone not null default now(),
  type text default ''::text,
  updated_at timestamp with time zone not null default now(),
  "assignedTo" text[],
  "assignedBy" text,
  "assignedAt" timestamp with time zone,
  attachments text[] default '{}'::text[],
  "deliveryCategory" text,
  PRIMARY KEY (id)
);

create table if not exists public.team (
  id text not null,
  name text not null,
  initials text not null,
  PRIMARY KEY (id)
);

create table if not exists public."teamActivity" (
  id text not null,
  "lastActive" timestamp with time zone not null default now(),
  PRIMARY KEY (id)
);

create table if not exists public.weeks (
  id text not null,
  "eventName" text default ''::text,
  shows jsonb not null default '[]'::jsonb,
  "out" jsonb not null default '[]'::jsonb,
  PRIMARY KEY (id)
);

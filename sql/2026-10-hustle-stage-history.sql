-- Hustle feedback (Oct 2026): stage 2 becomes "Engage", and every stage change is dated.
-- Run in the Supabase SQL Editor (choose "Run and enable RLS" if asked). Safe to run twice.
-- Deploy the Scarlett release first: it understands both "2. Qualify" and "2. Engage" until this has run.

-- 1. Dated stage history, read by the Reporting tab.
alter table public."hustleOpportunities"
  add column if not exists "stageHistory" jsonb not null default '[]'::jsonb;

-- 2. Rename stage 2.
update public."hustleOpportunities" set stage = '2. Engage' where stage = '2. Qualify';

-- 3. Seed one entry per existing deal from its latest stage change (older deals only know their last move,
--    so "at" can be null). New moves are recorded in full from here on.
update public."hustleOpportunities"
set "stageHistory" = jsonb_build_array(jsonb_build_object(
  'stage', stage,
  'at', "stageChangedAt",
  'from', null,
  'seed', true))
where "stageHistory" = '[]'::jsonb;

notify pgrst, 'reload schema';

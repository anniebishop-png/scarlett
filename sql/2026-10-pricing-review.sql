-- Scarlett: quote review / approval for the Pricing section.
-- Schema only (no prices). Safe to run more than once.

alter table public."pricingQuotes"
  add column if not exists "reviewStatus" text,
  add column if not exists "reviewer" text,
  add column if not exists "reviewerName" text,
  add column if not exists "reviewRequestedBy" text,
  add column if not exists "reviewRequestedAt" text,
  add column if not exists "reviewNote" text,
  add column if not exists "reviewedBy" text,
  add column if not exists "reviewedAt" text,
  add column if not exists "reviewLog" jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';

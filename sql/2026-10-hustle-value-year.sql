alter table public."hustleOpportunities"
  add column if not exists "value" numeric,
  add column if not exists "pipelineYear" integer;

update public."hustleOpportunities"
set "pipelineYear" = least(
  greatest(
    coalesce(nullif(split_part("expectedClose", '-', 1), '')::int, extract(year from created_at)::int, extract(year from now())::int),
    extract(year from now())::int),
  extract(year from now())::int + 2)
where "pipelineYear" is null;

notify pgrst, 'reload schema';

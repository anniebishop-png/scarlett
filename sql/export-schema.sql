-- Scarlett: export the live database structure as readable SQL.
-- Run this in the Supabase SQL Editor. It makes no changes. It returns one cell of text (tables, columns, row-level security
-- policies, helper functions and indexes for the public schema). Copy that cell and save it as sql/schema-snapshot.sql
-- in the repo. It contains structure only, no data.
select string_agg(ddl, E'\n\n' order by ord, nm) as schema_sql from (
  select 1 as ord, c.relname::text as nm,
    format(E'create table if not exists public.%I (\n%s\n);', c.relname,
      (select string_agg(format('  %I %s%s%s', a.attname, format_type(a.atttypid, a.atttypmod),
          case when a.attnotnull then ' not null' else '' end,
          case when d.adbin is not null then ' default ' || pg_get_expr(d.adbin, d.adrelid) else '' end), E',\n' order by a.attnum)
         from pg_attribute a
         left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
         where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped)
      || coalesce((select E',\n  ' || string_agg(pg_get_constraintdef(k.oid), E',\n  ')
                   from pg_constraint k where k.conrelid = c.oid and k.contype in ('p', 'u')), '')) as ddl
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
  union all
  select 2, tablename::text, format('alter table public.%I enable row level security;', tablename)
  from pg_tables where schemaname = 'public' and rowsecurity
  union all
  select 3, (tablename || '.' || policyname)::text,
    format('create policy %I on public.%I as %s for %s to %s%s%s;', policyname, tablename, lower(permissive), lower(cmd),
      array_to_string(roles, ', '),
      case when qual is not null then E'\n  using (' || qual || ')' else '' end,
      case when with_check is not null then E'\n  with check (' || with_check || ')' else '' end)
  from pg_policies where schemaname = 'public'
  union all
  select 4, p.proname::text, pg_get_functiondef(p.oid) || ';'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f'
  union all
  select 5, indexname::text, indexdef || ';'
  from pg_indexes where schemaname = 'public'
    and indexname not in (select conname from pg_constraint)
) t;

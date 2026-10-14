-- Scarlett: row-level security policies, exported from the live Supabase project on 2026-10-14.
-- Run sql/schema-snapshot.sql first (tables), then the helper functions is_manager() and my_name() (both in sql/2026-10-hustle-permissions.sql), then this file.
-- Safe to run more than once: each policy is dropped and recreated.
-- In short: every table is locked to @equiratings.com sign-ins (restrictive policy equiratings_only). Most tables are then
-- open to any signed-in teammate. Exceptions: hustleOpportunities (managers, or the owner), the pricing tables (managers;
-- price list and rates editable only by Annie, Geogs and Diarm), clientProfiles delete (managers), changeLog (hustle rows
-- hidden from non-owners), pushSubscriptions (own devices only), appUsers (read only; changed by SQL).

alter table public."appUsers" enable row level security;
alter table public."changeLog" enable row level security;
alter table public."clientOps" enable row level security;
alter table public."clientProfiles" enable row level security;
alter table public.clients enable row level security;
alter table public."contractClients" enable row level security;
alter table public.deliverable_presets enable row level security;
alter table public."deliveryItems" enable row level security;
alter table public.divisions enable row level security;
alter table public."hustleOpportunities" enable row level security;
alter table public."podcastEpisodes" enable row level security;
alter table public."pricingPackages" enable row level security;
alter table public."pricingQuotes" enable row level security;
alter table public."pricingServices" enable row level security;
alter table public."pricingSettings" enable row level security;
alter table public."pushSubscriptions" enable row level security;
alter table public."recurringTasks" enable row level security;
alter table public.shows enable row level security;
alter table public.shows_reference enable row level security;
alter table public.tasks enable row level security;
alter table public.team enable row level security;
alter table public."teamActivity" enable row level security;
alter table public.weeks enable row level security;
drop policy if exists appusers_select on public."appUsers";
create policy appusers_select on public."appUsers" as permissive for select to authenticated
  using (true);

drop policy if exists equiratings_only on public."appUsers";
create policy equiratings_only on public."appUsers" as restrictive for all to authenticated
  using ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) ~~ '%@equiratings.com'::text))
  with check ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) ~~ '%@equiratings.com'::text));

drop policy if exists changelog_insert on public."changeLog";
create policy changelog_insert on public."changeLog" as permissive for insert to authenticated
  with check (true);

drop policy if exists changelog_select on public."changeLog";
create policy changelog_select on public."changeLog" as permissive for select to authenticated
  using (((coll <> 'hustleOpportunities'::text) OR is_manager() OR (lower(COALESCE(email, ''::text)) = lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)))));

drop policy if exists equiratings_only on public."changeLog";
create policy equiratings_only on public."changeLog" as restrictive for all to authenticated
  using ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) ~~ '%@equiratings.com'::text))
  with check ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) ~~ '%@equiratings.com'::text));

drop policy if exists "authenticated read/write" on public."clientOps";
create policy "authenticated read/write" on public."clientOps" as permissive for all to public
  using ((auth.role() = 'authenticated'::text))
  with check ((auth.role() = 'authenticated'::text));

drop policy if exists equiratings_only on public."clientOps";
create policy equiratings_only on public."clientOps" as restrictive for all to authenticated
  using ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) ~~ '%@equiratings.com'::text))
  with check ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) ~~ '%@equiratings.com'::text));

drop policy if exists clients_delete on public."clientProfiles";
create policy clients_delete on public."clientProfiles" as permissive for delete to authenticated
  using (is_manager());

drop policy if exists clients_insert on public."clientProfiles";
create policy clients_insert on public."clientProfiles" as permissive for insert to authenticated
  with check (true);

drop policy if exists clients_read on public."clientProfiles";
create policy clients_read on public."clientProfiles" as permissive for select to authenticated
  using (true);

drop policy if exists clients_update on public."clientProfiles";
create policy clients_update on public."clientProfiles" as permissive for update to authenticated
  using (true)
  with check (true);

drop policy if exists equiratings_only on public."clientProfiles";
create policy equiratings_only on public."clientProfiles" as restrictive for all to authenticated
  using ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) ~~ '%@equiratings.com'::text))
  with check ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) ~~ '%@equiratings.com'::text));

drop policy if exists "authenticated read/write" on public.clients;
create policy "authenticated read/write" on public.clients as permissive for all to public
  using ((auth.role() = 'authenticated'::text))
  with check ((auth.role() = 'authenticated'::text));

drop policy if exists equiratings_only on public.clients;
create policy equiratings_only on public.clients as restrictive for all to authenticated
  using ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) ~~ '%@equiratings.com'::text))
  with check ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) ~~ '%@equiratings.com'::text));

drop policy if exists "authenticated read/write" on public."contractClients";
create policy "authenticated read/write" on public."contractClients" as permissive for all to public
  using ((auth.role() = 'authenticated'::text))
  with check ((auth.role() = 'authenticated'::text));

drop policy if exists equiratings_only on public."contractClients";
create policy equiratings_only on public."contractClients" as restrictive for all to authenticated
  using ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) ~~ '%@equiratings.com'::text))
  with check ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) ~~ '%@equiratings.com'::text));

drop policy if exists "authenticated read/write" on public.deliverable_presets;
create policy "authenticated read/write" on public.deliverable_presets as permissive for all to public
  using ((auth.role() = 'authenticated'::text))
  with check ((auth.role() = 'authenticated'::text));

drop policy if exists equiratings_only on public.deliverable_presets;
create policy equiratings_only on public.deliverable_presets as restrictive for all to authenticated
  using ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) ~~ '%@equiratings.com'::text))
  with check ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) ~~ '%@equiratings.com'::text));

drop policy if exists "authenticated read/write" on public."deliveryItems";
create policy "authenticated read/write" on public."deliveryItems" as permissive for all to public
  using ((auth.role() = 'authenticated'::text))
  with check ((auth.role() = 'authenticated'::text));

drop policy if exists equiratings_only on public."deliveryItems";
create policy equiratings_only on public."deliveryItems" as restrictive for all to authenticated
  using ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) ~~ '%@equiratings.com'::text))
  with check ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) ~~ '%@equiratings.com'::text));

drop policy if exists "authenticated read/write" on public.divisions;
create policy "authenticated read/write" on public.divisions as permissive for all to public
  using ((auth.role() = 'authenticated'::text))
  with check ((auth.role() = 'authenticated'::text));

drop policy if exists equiratings_only on public.divisions;
create policy equiratings_only on public.divisions as restrictive for all to authenticated
  using ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) ~~ '%@equiratings.com'::text))
  with check ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) ~~ '%@equiratings.com'::text));

drop policy if exists equiratings_only on public."hustleOpportunities";
create policy equiratings_only on public."hustleOpportunities" as restrictive for all to authenticated
  using ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) ~~ '%@equiratings.com'::text))
  with check ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) ~~ '%@equiratings.com'::text));

drop policy if exists hustle_delete on public."hustleOpportunities";
create policy hustle_delete on public."hustleOpportunities" as permissive for delete to authenticated
  using ((is_manager() OR (owner = my_name())));

drop policy if exists hustle_insert on public."hustleOpportunities";
create policy hustle_insert on public."hustleOpportunities" as permissive for insert to authenticated
  with check ((is_manager() OR (owner = my_name())));

drop policy if exists hustle_read on public."hustleOpportunities";
create policy hustle_read on public."hustleOpportunities" as permissive for select to authenticated
  using ((is_manager() OR (owner = my_name())));

drop policy if exists hustle_update on public."hustleOpportunities";
create policy hustle_update on public."hustleOpportunities" as permissive for update to authenticated
  using ((is_manager() OR (owner = my_name())))
  with check (true);

drop policy if exists "authenticated read/write" on public."podcastEpisodes";
create policy "authenticated read/write" on public."podcastEpisodes" as permissive for all to public
  using ((auth.role() = 'authenticated'::text))
  with check ((auth.role() = 'authenticated'::text));

drop policy if exists equiratings_only on public."podcastEpisodes";
create policy equiratings_only on public."podcastEpisodes" as restrictive for all to authenticated
  using ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) ~~ '%@equiratings.com'::text))
  with check ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) ~~ '%@equiratings.com'::text));

drop policy if exists equiratings_only on public."pricingPackages";
create policy equiratings_only on public."pricingPackages" as restrictive for all to authenticated
  using ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) ~~ '%@equiratings.com'::text))
  with check ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) ~~ '%@equiratings.com'::text));

drop policy if exists pricing_managers on public."pricingPackages";
create policy pricing_managers on public."pricingPackages" as permissive for all to authenticated
  using (is_manager())
  with check (is_manager());

drop policy if exists equiratings_only on public."pricingQuotes";
create policy equiratings_only on public."pricingQuotes" as restrictive for all to authenticated
  using ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) ~~ '%@equiratings.com'::text))
  with check ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) ~~ '%@equiratings.com'::text));

drop policy if exists pricing_managers on public."pricingQuotes";
create policy pricing_managers on public."pricingQuotes" as permissive for all to authenticated
  using (is_manager())
  with check (is_manager());

drop policy if exists equiratings_only on public."pricingServices";
create policy equiratings_only on public."pricingServices" as restrictive for all to authenticated
  using ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) ~~ '%@equiratings.com'::text))
  with check ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) ~~ '%@equiratings.com'::text));

drop policy if exists pricing_edit on public."pricingServices";
create policy pricing_edit on public."pricingServices" as permissive for all to authenticated
  using ((is_manager() AND (lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) = ANY (ARRAY['annie.bishop@equiratings.com'::text, 'ruairi@equiratings.com'::text, 'diarm@equiratings.com'::text]))))
  with check ((is_manager() AND (lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) = ANY (ARRAY['annie.bishop@equiratings.com'::text, 'ruairi@equiratings.com'::text, 'diarm@equiratings.com'::text]))));

drop policy if exists pricing_read on public."pricingServices";
create policy pricing_read on public."pricingServices" as permissive for select to authenticated
  using (is_manager());

drop policy if exists equiratings_only on public."pricingSettings";
create policy equiratings_only on public."pricingSettings" as restrictive for all to authenticated
  using ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) ~~ '%@equiratings.com'::text))
  with check ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) ~~ '%@equiratings.com'::text));

drop policy if exists pricing_edit on public."pricingSettings";
create policy pricing_edit on public."pricingSettings" as permissive for all to authenticated
  using ((is_manager() AND (lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) = ANY (ARRAY['annie.bishop@equiratings.com'::text, 'ruairi@equiratings.com'::text, 'diarm@equiratings.com'::text]))))
  with check ((is_manager() AND (lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) = ANY (ARRAY['annie.bishop@equiratings.com'::text, 'ruairi@equiratings.com'::text, 'diarm@equiratings.com'::text]))));

drop policy if exists pricing_read on public."pricingSettings";
create policy pricing_read on public."pricingSettings" as permissive for select to authenticated
  using (is_manager());

drop policy if exists equiratings_only on public."pushSubscriptions";
create policy equiratings_only on public."pushSubscriptions" as restrictive for all to authenticated
  using ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) ~~ '%@equiratings.com'::text))
  with check ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) ~~ '%@equiratings.com'::text));

drop policy if exists "own push devices" on public."pushSubscriptions";
create policy "own push devices" on public."pushSubscriptions" as permissive for all to authenticated
  using (((lower(email) = lower((auth.jwt() ->> 'email'::text))) AND (lower((auth.jwt() ->> 'email'::text)) ~~ '%@equiratings.com'::text)))
  with check (((lower(email) = lower((auth.jwt() ->> 'email'::text))) AND (lower((auth.jwt() ->> 'email'::text)) ~~ '%@equiratings.com'::text)));

drop policy if exists "authenticated read/write" on public."recurringTasks";
create policy "authenticated read/write" on public."recurringTasks" as permissive for all to public
  using ((auth.role() = 'authenticated'::text))
  with check ((auth.role() = 'authenticated'::text));

drop policy if exists equiratings_only on public."recurringTasks";
create policy equiratings_only on public."recurringTasks" as restrictive for all to authenticated
  using ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) ~~ '%@equiratings.com'::text))
  with check ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) ~~ '%@equiratings.com'::text));

drop policy if exists "authenticated read/write" on public.shows;
create policy "authenticated read/write" on public.shows as permissive for all to public
  using ((auth.role() = 'authenticated'::text))
  with check ((auth.role() = 'authenticated'::text));

drop policy if exists equiratings_only on public.shows;
create policy equiratings_only on public.shows as restrictive for all to authenticated
  using ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) ~~ '%@equiratings.com'::text))
  with check ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) ~~ '%@equiratings.com'::text));

drop policy if exists "authenticated read/write" on public.shows_reference;
create policy "authenticated read/write" on public.shows_reference as permissive for all to public
  using ((auth.role() = 'authenticated'::text))
  with check ((auth.role() = 'authenticated'::text));

drop policy if exists equiratings_only on public.shows_reference;
create policy equiratings_only on public.shows_reference as restrictive for all to authenticated
  using ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) ~~ '%@equiratings.com'::text))
  with check ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) ~~ '%@equiratings.com'::text));

drop policy if exists "authenticated read/write" on public.tasks;
create policy "authenticated read/write" on public.tasks as permissive for all to public
  using ((auth.role() = 'authenticated'::text))
  with check ((auth.role() = 'authenticated'::text));

drop policy if exists equiratings_only on public.tasks;
create policy equiratings_only on public.tasks as restrictive for all to authenticated
  using ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) ~~ '%@equiratings.com'::text))
  with check ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) ~~ '%@equiratings.com'::text));

drop policy if exists "authenticated read/write" on public.team;
create policy "authenticated read/write" on public.team as permissive for all to public
  using ((auth.role() = 'authenticated'::text))
  with check ((auth.role() = 'authenticated'::text));

drop policy if exists equiratings_only on public.team;
create policy equiratings_only on public.team as restrictive for all to authenticated
  using ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) ~~ '%@equiratings.com'::text))
  with check ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) ~~ '%@equiratings.com'::text));

drop policy if exists "authenticated read/write" on public."teamActivity";
create policy "authenticated read/write" on public."teamActivity" as permissive for all to public
  using ((auth.role() = 'authenticated'::text))
  with check ((auth.role() = 'authenticated'::text));

drop policy if exists equiratings_only on public."teamActivity";
create policy equiratings_only on public."teamActivity" as restrictive for all to authenticated
  using ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) ~~ '%@equiratings.com'::text))
  with check ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) ~~ '%@equiratings.com'::text));

drop policy if exists "authenticated read/write" on public.weeks;
create policy "authenticated read/write" on public.weeks as permissive for all to public
  using ((auth.role() = 'authenticated'::text))
  with check ((auth.role() = 'authenticated'::text));

drop policy if exists equiratings_only on public.weeks;
create policy equiratings_only on public.weeks as restrictive for all to authenticated
  using ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) ~~ '%@equiratings.com'::text))
  with check ((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) ~~ '%@equiratings.com'::text));

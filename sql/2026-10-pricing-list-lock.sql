-- Scarlett: Pricing price list and rates can be changed only by Annie, Geogs and Diarm.
-- Every manager can still read them (the quote builder needs the prices). Quotes and packages are unchanged.

do $$
declare t text; r record;
begin
  foreach t in array array['pricingServices','pricingSettings'] loop
    for r in select policyname from pg_policies
             where schemaname = 'public' and tablename = t and policyname in ('pricing_managers','pricing_read','pricing_edit') loop
      execute format('drop policy %I on public.%I', r.policyname, t);
    end loop;
    execute format('create policy pricing_read on public.%I for select to authenticated using (public.is_manager())', t);
    execute format($f$create policy pricing_edit on public.%I for all to authenticated using (public.is_manager() and lower(coalesce(auth.jwt()->>'email','')) in ('annie.bishop@equiratings.com','ruairi@equiratings.com','diarm@equiratings.com')) with check (public.is_manager() and lower(coalesce(auth.jwt()->>'email','')) in ('annie.bishop@equiratings.com','ruairi@equiratings.com','diarm@equiratings.com'))$f$, t);
  end loop;
end $$;

notify pgrst, 'reload schema';

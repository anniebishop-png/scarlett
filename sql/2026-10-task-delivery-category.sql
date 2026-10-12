alter table public.tasks
  add column if not exists "deliveryCategory" text;

notify pgrst, 'reload schema';

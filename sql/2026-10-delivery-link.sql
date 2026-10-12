alter table public."deliveryItems"
  add column if not exists "link" text;

notify pgrst, 'reload schema';

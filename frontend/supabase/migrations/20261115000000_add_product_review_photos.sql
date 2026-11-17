alter table public.product_reviews
  add column if not exists image_url text,
  add column if not exists image_path text;

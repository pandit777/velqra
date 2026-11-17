drop index if exists public.product_reviews_product_created_at_idx;

create index if not exists product_reviews_product_created_at_idx
  on public.product_reviews (product_id, created_at desc, id desc);

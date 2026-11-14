-- VELQRA complete Supabase schema.
-- Run this once in the Supabase SQL Editor. Existing tables are preserved.

create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  email text not null,
  phone text unique,
  password text not null,
  role text not null default 'user',
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists users_email_lower_unique_idx
  on public.users (lower(email));

create table if not exists public.admins (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password text not null,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists admins_email_lower_unique_idx
  on public.admins (lower(email));

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric(12, 2) not null check (price >= 0),
  original_price numeric(12, 2) not null default 0 check (original_price >= 0),
  discount_percent numeric(5, 2) not null default 0 check (discount_percent between 0 and 100),
  category text not null default 'Face Wash',
  stock integer not null default 0 check (stock >= 0),
  description text not null default '',
  icon text not null default '📦',
  image text not null default '',
  image_url text not null default '',
  images jsonb not null default '[]'::jsonb,
  brand text not null default '',
  weight text,
  color text not null default '',
  size text not null default '',
  material text not null default '',
  warranty text not null default '',
  tags jsonb not null default '[]'::jsonb,
  rating numeric(3, 2) not null default 0 check (rating between 0 and 5),
  reviews_count integer not null default 0 check (reviews_count >= 0),
  popularity integer not null default 0,
  promo_code text not null default '',
  promo_discount numeric(5, 2) not null default 0 check (promo_discount between 0 and 100),
  is_active boolean not null default true,
  video_url text,
  video_type text not null default 'youtube',
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products
  add column if not exists video_url text,
  add column if not exists video_type text not null default 'youtube',
  add column if not exists attributes jsonb not null default '{}'::jsonb;

create index if not exists products_category_idx on public.products (category);
create index if not exists products_created_at_idx on public.products (created_at desc);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users (id) on delete set null,
  user_name text not null default '',
  user_email text not null default '',
  items jsonb not null default '[]'::jsonb,
  total numeric(12, 2) not null check (total >= 0),
  payment_method text not null default 'cod',
  reference_id text,
  delivery jsonb not null default '{}'::jsonb,
  status text not null default 'Pending',
  status_history jsonb not null default '[]'::jsonb,
  attribution jsonb not null default '{}'::jsonb,
  marketing_consent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists orders_reference_id_unique_idx
  on public.orders (reference_id)
  where reference_id is not null;
create index if not exists orders_user_created_at_idx
  on public.orders (user_id, created_at desc);
create index if not exists orders_status_created_at_idx
  on public.orders (status, created_at desc);

create table if not exists public.carts (
  user_id uuid primary key references public.users (id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  total_items integer not null default 0 check (total_items >= 0),
  total_price numeric(12, 2) not null default 0 check (total_price >= 0),
  total_savings numeric(12, 2) not null default 0 check (total_savings >= 0),
  updated_at timestamptz not null default now()
);

-- Keep this relationship aligned with the application's public.users table.
alter table public.carts
  drop constraint if exists carts_user_id_fkey;
alter table public.carts
  add constraint carts_user_id_fkey
  foreign key (user_id)
  references public.users (id)
  on delete cascade
  not valid;

create table if not exists public.registration_otps (
  email text primary key,
  otp text not null,
  expires_at timestamptz not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.registration_otps.email is
  'Legacy column name; the registration flow stores the normalized phone number here.';

create table if not exists public.password_resets (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  otp text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_otps (
  user_id uuid primary key references public.users (id) on delete cascade,
  email text not null default '',
  phone text not null default '',
  otp text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.bank_details (
  user_id uuid primary key references public.users (id) on delete cascade,
  account_holder_name text not null,
  account_number text not null,
  ifsc_code text not null,
  bank_name text not null,
  upi_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  user_name text not null default '',
  user_email text not null default '',
  order_id uuid references public.orders (id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  review_text text not null default '',
  video_url text,
  video_path text,
  is_verified_purchase boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists product_reviews_product_created_at_idx
  on public.product_reviews (product_id, created_at desc);

create table if not exists public.return_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  reason text not null,
  description text not null default '',
  bank_details_snapshot jsonb not null default '{}'::jsonb,
  payment_transaction_id text,
  refund_amount numeric(12, 2) not null default 0 check (refund_amount >= 0),
  status text not null default 'Pending',
  status_history jsonb not null default '[]'::jsonb,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.return_requests
  add column if not exists payment_transaction_id text;

create index if not exists return_requests_user_created_at_idx
  on public.return_requests (user_id, created_at desc);
create index if not exists return_requests_status_created_at_idx
  on public.return_requests (status, created_at desc);

create table if not exists public.return_otps (
  user_id uuid primary key references public.users (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  otp text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Supports databases that already had orders before campaign attribution was added.
alter table public.orders
  add column if not exists attribution jsonb not null default '{}'::jsonb,
  add column if not exists marketing_consent boolean not null default false;

-- The backend uses the Supabase service-role key. Direct clients may only read active products.
alter table public.users enable row level security;
alter table public.admins enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.carts enable row level security;
alter table public.registration_otps enable row level security;
alter table public.password_resets enable row level security;
alter table public.order_otps enable row level security;
alter table public.bank_details enable row level security;
alter table public.product_reviews enable row level security;
alter table public.return_requests enable row level security;
alter table public.return_otps enable row level security;

revoke insert, update, delete on public.products from anon, authenticated;
grant select on public.products to anon, authenticated;

drop policy if exists products_public_read on public.products;
create policy products_public_read
  on public.products
  for select
  to anon, authenticated
  using (is_active = true);

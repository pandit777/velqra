alter table public.carts
  drop constraint if exists carts_user_id_fkey;

alter table public.carts
  add constraint carts_user_id_fkey
  foreign key (user_id)
  references public.users (id)
  on delete cascade
  not valid;

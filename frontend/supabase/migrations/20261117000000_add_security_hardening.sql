-- Additive security hardening migration.
-- This file is NOT executed automatically. Review and apply only in a test database first.

alter table public.orders
  add column if not exists idempotency_key text,
  add column if not exists stock_reserved boolean not null default false;

create unique index if not exists orders_idempotency_key_unique_idx
  on public.orders (idempotency_key)
  where idempotency_key is not null;

create or replace function public.reserve_order_stock(p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_product_id uuid;
  v_qty integer;
begin
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := nullif(v_item->>'product_id', '')::uuid;
    v_qty := (v_item->>'qty')::integer;
    if v_product_id is null or v_qty is null or v_qty < 1 then
      raise exception 'Invalid stock reservation item';
    end if;
    update public.products
      set stock = stock - v_qty,
          updated_at = now()
      where id = v_product_id
        and is_active = true
        and stock >= v_qty;
    if not found then
      raise exception 'Insufficient stock';
    end if;
  end loop;
end;
$$;

revoke execute on function public.reserve_order_stock(jsonb) from anon, authenticated;

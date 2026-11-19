alter table public.orders
  add column if not exists idempotency_key text,
  add column if not exists stock_reserved boolean not null default false;

create unique index if not exists orders_idempotency_key_unique_idx
  on public.orders (idempotency_key)
  where idempotency_key is not null;

create table if not exists public.order_confirmation_tokens (
  id uuid primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.order_confirmation_tokens enable row level security;
revoke all on public.order_confirmation_tokens from anon, authenticated;
grant all on public.order_confirmation_tokens to service_role;

create or replace function public.reserve_order_stock(p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item record;
begin
  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' or
     jsonb_array_length(p_items) = 0 then
    raise exception 'Invalid stock reservation item';
  end if;

  for v_item in
    select product_id, sum(qty)::integer as qty
    from jsonb_to_recordset(p_items) as requested(product_id uuid, qty integer)
    group by product_id
    order by product_id
  loop
    if v_item.product_id is null or v_item.qty is null or v_item.qty < 1 then
      raise exception 'Invalid stock reservation item';
    end if;

    update public.products
      set stock = stock - v_item.qty,
          updated_at = now()
      where id = v_item.product_id
        and is_active = true
        and stock >= v_item.qty;
    if not found then
      raise exception 'Insufficient stock';
    end if;
  end loop;
end;
$$;

create or replace function public.create_order_with_stock(
  p_order jsonb,
  p_stock_items jsonb,
  p_idempotency_key text,
  p_confirmation_token_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders;
  v_user_id uuid;
  v_payment_method text;
  v_inserted_id uuid;
begin
  v_user_id := nullif(p_order->>'user_id', '')::uuid;
  v_payment_method := p_order->>'payment_method';
  if v_user_id is null or p_idempotency_key is null or length(p_idempotency_key) > 128 then
    raise exception 'Invalid order request';
  end if;
  if v_payment_method not in ('cod', 'online') then
    raise exception 'Invalid payment method';
  end if;
  if (v_payment_method = 'cod' and
      (p_confirmation_token_id is null or p_idempotency_key <> p_confirmation_token_id::text)) or
     (v_payment_method = 'online' and p_confirmation_token_id is not null) then
    raise exception 'Invalid order confirmation';
  end if;

  select * into v_order
    from public.orders
    where idempotency_key = p_idempotency_key;
  if found then
    if v_order.user_id is distinct from v_user_id then
      raise exception 'Idempotency key belongs to another user';
    end if;
    return jsonb_build_object('order', to_jsonb(v_order), 'created', false);
  end if;

  begin
    if p_confirmation_token_id is not null then
      update public.order_confirmation_tokens
        set consumed_at = now()
        where id = p_confirmation_token_id
          and user_id = v_user_id
          and expires_at > now()
          and consumed_at is null;
      if not found then
        select * into v_order
          from public.orders
          where idempotency_key = p_idempotency_key;
        if found and v_order.user_id is not distinct from v_user_id then
          return jsonb_build_object('order', to_jsonb(v_order), 'created', false);
        end if;
        raise exception 'Invalid or expired order confirmation';
      end if;
    end if;

    perform public.reserve_order_stock(p_stock_items);

    insert into public.orders (
      user_id, user_name, user_email, items, total, payment_method,
      reference_id, delivery, status, status_history, attribution,
      marketing_consent, idempotency_key, stock_reserved
    ) values (
      v_user_id,
      coalesce(p_order->>'user_name', ''),
      coalesce(p_order->>'user_email', ''),
      coalesce(p_order->'items', '[]'::jsonb),
      (p_order->>'total')::numeric,
      v_payment_method,
      nullif(p_order->>'reference_id', ''),
      coalesce(p_order->'delivery', '{}'::jsonb),
      coalesce(p_order->>'status', 'Pending'),
      coalesce(p_order->'status_history', '[]'::jsonb),
      coalesce(p_order->'attribution', '{}'::jsonb),
      coalesce((p_order->>'marketing_consent')::boolean, false),
      p_idempotency_key,
      true
    )
    returning id into v_inserted_id;
  exception when unique_violation then
    select * into v_order
      from public.orders
      where idempotency_key = p_idempotency_key;
    if found and v_order.user_id is not distinct from v_user_id then
      return jsonb_build_object('order', to_jsonb(v_order), 'created', false);
    end if;
    raise;
  end;

  select * into v_order from public.orders where id = v_inserted_id;
  return jsonb_build_object('order', to_jsonb(v_order), 'created', true);
end;
$$;

create or replace function public.confirm_order_payment(
  p_order_id uuid,
  p_reference_id text,
  p_mihpayid text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders;
  v_history jsonb;
  v_paid boolean;
begin
  select * into v_order
    from public.orders
    where id = p_order_id
    for update;
  if not found then
    raise exception 'Order not found';
  end if;

  if jsonb_typeof(v_order.status_history) = 'array' then
    select exists (
      select 1
        from jsonb_array_elements(v_order.status_history) as entry
        where entry->>'status' = 'Payment Verified'
          and entry->>'updatedBy' = 'PayU'
    ) into v_paid;
  else
    v_paid := false;
  end if;
  if v_paid then
    return jsonb_build_object('order', to_jsonb(v_order), 'updated', false);
  end if;
  if v_order.status <> 'Payment Verification Pending' or
     v_order.reference_id is distinct from p_reference_id then
    return jsonb_build_object('order', to_jsonb(v_order), 'updated', false);
  end if;

  if not v_order.stock_reserved then
    perform public.reserve_order_stock(v_order.items);
  end if;

  v_history := case
    when jsonb_typeof(v_order.status_history) = 'array' then v_order.status_history
    else '[]'::jsonb
  end;
  v_history := v_history || jsonb_build_array(jsonb_build_object(
    'status', 'Payment Verified',
    'timestamp', now(),
    'updatedBy', 'PayU',
    'details', 'PayU ID: ' || coalesce(nullif(p_mihpayid, ''), 'N/A')
  ));

  update public.orders
    set status = 'Payment Verified',
        status_history = v_history,
        stock_reserved = true,
        updated_at = now()
    where id = p_order_id
    returning * into v_order;
  return jsonb_build_object('order', to_jsonb(v_order), 'updated', true);
end;
$$;

create or replace function public.initiate_order_payment(
  p_order_id uuid,
  p_user_id uuid,
  p_reference_id text,
  p_status_history jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders;
begin
  select * into v_order
    from public.orders
    where id = p_order_id
    for update;
  if not found or v_order.user_id is distinct from p_user_id or
     v_order.payment_method <> 'online' or
     v_order.status not in ('Payment Verification Pending', 'Payment Failed') then
    raise exception 'Order cannot start a payment';
  end if;
  if v_order.status = 'Payment Verification Pending' and v_order.reference_id is not null then
    raise exception 'Payment already in progress';
  end if;

  if not v_order.stock_reserved then
    perform public.reserve_order_stock(v_order.items);
  end if;

  update public.orders
    set reference_id = p_reference_id,
        status = 'Payment Verification Pending',
        status_history = case
          when jsonb_typeof(p_status_history) = 'array' then p_status_history
          else status_history
        end,
        stock_reserved = true,
        updated_at = now()
    where id = p_order_id
    returning * into v_order;
  return to_jsonb(v_order);
end;
$$;

create or replace function public.release_order_stock(
  p_order_id uuid,
  p_target_status text,
  p_status_history jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders;
  v_item jsonb;
  v_product_id uuid;
  v_qty integer;
begin
  if p_target_status not in ('Cancelled', 'Payment Failed') then
    raise exception 'Invalid release status';
  end if;

  select * into v_order
    from public.orders
    where id = p_order_id
    for update;
  if not found then
    raise exception 'Order not found';
  end if;
  if v_order.status = p_target_status then
    return to_jsonb(v_order);
  end if;
  if (p_target_status = 'Payment Failed' and
      (v_order.payment_method <> 'online' or v_order.status <> 'Payment Verification Pending')) or
     (p_target_status = 'Cancelled' and
      (v_order.status not in ('Pending', 'Payment Verification Pending', 'Payment Failed', 'Confirmed') or
       (v_order.payment_method = 'online' and
        v_order.status = 'Payment Verification Pending' and
        v_order.reference_id is not null))) then
    return to_jsonb(v_order);
  end if;

  if v_order.stock_reserved then
    for v_item in select * from jsonb_array_elements(v_order.items)
    loop
      v_product_id := nullif(v_item->>'product_id', '')::uuid;
      v_qty := (v_item->>'qty')::integer;
      if v_product_id is null or v_qty is null or v_qty < 1 then
        raise exception 'Invalid reserved order item';
      end if;
      update public.products
        set stock = stock + v_qty,
            updated_at = now()
        where id = v_product_id;
    end loop;
  end if;

  update public.orders
    set status = p_target_status,
        status_history = case
          when jsonb_typeof(p_status_history) = 'array' then p_status_history
          else status_history
        end,
        stock_reserved = false,
        updated_at = now()
    where id = p_order_id
    returning * into v_order;
  return to_jsonb(v_order);
end;
$$;

revoke all on function public.reserve_order_stock(jsonb) from public, anon, authenticated;
revoke all on function public.create_order_with_stock(jsonb, jsonb, text, uuid) from public, anon, authenticated;
revoke all on function public.confirm_order_payment(uuid, text, text) from public, anon, authenticated;
revoke all on function public.initiate_order_payment(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.release_order_stock(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_order_with_stock(jsonb, jsonb, text, uuid) to service_role;
grant execute on function public.confirm_order_payment(uuid, text, text) to service_role;
grant execute on function public.initiate_order_payment(uuid, uuid, text, jsonb) to service_role;
grant execute on function public.release_order_stock(uuid, text, jsonb) to service_role;

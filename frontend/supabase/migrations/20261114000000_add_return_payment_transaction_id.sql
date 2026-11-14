alter table public.return_requests
  add column if not exists payment_transaction_id text;

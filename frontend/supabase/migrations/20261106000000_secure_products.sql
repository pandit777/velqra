alter table public.products enable row level security;

drop policy if exists "products_public_read" on public.products;
drop policy if exists "products_admin_insert" on public.products;
drop policy if exists "products_admin_update" on public.products;
drop policy if exists "products_admin_delete" on public.products;

create policy "products_public_read"
on public.products
for select
to anon, authenticated
using (true);

create policy "products_admin_insert"
on public.products
for insert
to authenticated
with check ((auth.jwt() -> 'app_metadata' ->> 'admin') = 'true');

create policy "products_admin_update"
on public.products
for update
to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'admin') = 'true')
with check ((auth.jwt() -> 'app_metadata' ->> 'admin') = 'true');

create policy "products_admin_delete"
on public.products
for delete
to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'admin') = 'true');

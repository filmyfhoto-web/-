
drop policy if exists "nw-receipts staff read" on storage.objects;
create policy "nw-receipts staff read"
on storage.objects for select
to authenticated
using (
  bucket_id = 'nw-receipts'
  and exists (
    select 1 from public.staff_stores ss
    where ss.user_id = auth.uid()
      and ss.store_id::text = split_part(name, '/', 1)
  )
);

drop policy if exists "nw-receipts staff write" on storage.objects;
create policy "nw-receipts staff write"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'nw-receipts'
  and exists (
    select 1 from public.staff_stores ss
    where ss.user_id = auth.uid()
      and ss.store_id::text = split_part(name, '/', 1)
  )
);

drop policy if exists "nw-receipts staff update" on storage.objects;
create policy "nw-receipts staff update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'nw-receipts'
  and exists (
    select 1 from public.staff_stores ss
    where ss.user_id = auth.uid()
      and ss.store_id::text = split_part(name, '/', 1)
  )
);

drop policy if exists "nw-receipts staff delete" on storage.objects;
create policy "nw-receipts staff delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'nw-receipts'
  and exists (
    select 1 from public.staff_stores ss
    where ss.user_id = auth.uid()
      and ss.store_id::text = split_part(name, '/', 1)
  )
);

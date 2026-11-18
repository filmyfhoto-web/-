-- 1) po_receipt_items: gate cost data behind can_see_cost
drop policy if exists "staff read po_receipt_items" on public.po_receipt_items;
create policy "cost viewers read po_receipt_items"
  on public.po_receipt_items for select to authenticated
  using (public.can_see_cost(auth.uid()));

-- 2) product_variants: hide cost_override column from the Data API
revoke select on public.product_variants from authenticated;
grant select (
  id, product_id, sku, barcode, name, attributes, price, price_override,
  stock, low_stock_threshold, active, archived_at, image_url,
  created_at, updated_at
) on public.product_variants to authenticated;

-- read costs only when allowed
create or replace function public.variant_costs(p_product_id uuid)
returns table(id uuid, cost_override numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_see_cost(auth.uid()) then
    raise exception 'forbidden';
  end if;
  return query
    select v.id, v.cost_override from public.product_variants v
     where v.product_id = p_product_id;
end $$;

create or replace function public.set_variant_cost(p_variant_id uuid, p_cost numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_see_cost(auth.uid()) then
    raise exception 'forbidden';
  end if;
  update public.product_variants set cost_override = p_cost where id = p_variant_id;
end $$;

revoke all on function public.variant_costs(uuid) from public, anon;
revoke all on function public.set_variant_cost(uuid, numeric) from public, anon;
grant execute on function public.variant_costs(uuid) to authenticated;
grant execute on function public.set_variant_cost(uuid, numeric) to authenticated;
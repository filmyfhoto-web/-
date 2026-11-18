create or replace function public.myshop_unmapped_products(p_limit integer default 100)
returns table(product_id uuid, name text, code text, barcode text, stock numeric, status text, updated_at timestamptz)
language sql stable security definer set search_path to 'public' as $$
  select p.id, p.name, p.code, p.barcode, p.stock::numeric, p.status::text, p.updated_at
  from public.products p
  where p.deleted_at is null
    and coalesce(p.active, true)
    and not exists (select 1 from public.myshop_product_mappings m where m.product_id = p.id)
    and public.is_staff_any(auth.uid())
  order by p.updated_at desc
  limit greatest(coalesce(p_limit, 100), 1);
$$;

create or replace function public.myshop_invisible_products(p_limit integer default 100)
returns table(mapping_id uuid, product_id uuid, name text, code text, stock numeric,
              myshop_product_id text, myshop_inventory_id text, sync_status text,
              last_error text, last_stock_synced_at timestamptz, reason text)
language sql stable security definer set search_path to 'public' as $$
  select m.id, p.id, p.name, p.code, coalesce(v.stock, p.stock)::numeric,
         m.myshop_product_id, m.myshop_inventory_id, m.sync_status, m.last_error, m.last_stock_synced_at,
         case
           when m.myshop_inventory_id is null then 'ยังไม่มีคลังสินค้า (inventory) ใน MyShop'
           when m.last_error is not null then 'ซิงก์ล่าสุดมีข้อผิดพลาด'
           when m.last_stock_synced_at is null then 'ยังไม่เคยส่งสต๊อกสำเร็จ'
           when coalesce(v.stock, p.stock, 0) <= 0 then 'สต๊อกเป็น 0 จึงแสดงว่าสินค้าหมด'
           else 'ตรวจสอบการเผยแพร่สินค้าในแอป MyShop'
         end
  from public.myshop_product_mappings m
  left join public.products p on p.id = m.product_id
  left join public.product_variants v on v.id = m.variant_id
  where public.is_staff_any(auth.uid())
    and (
      m.myshop_inventory_id is null
      or m.last_error is not null
      or m.last_stock_synced_at is null
      or coalesce(v.stock, p.stock, 0) <= 0
    )
  order by m.updated_at desc
  limit greatest(coalesce(p_limit, 100), 1);
$$;

revoke all on function public.myshop_unmapped_products(integer) from public, anon;
revoke all on function public.myshop_invisible_products(integer) from public, anon;
grant execute on function public.myshop_unmapped_products(integer) to authenticated, service_role;
grant execute on function public.myshop_invisible_products(integer) to authenticated, service_role;
create or replace function public.orders_guard_customer_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Staff and service_role bypass the guard.
  if auth.uid() is null or public.is_staff(auth.uid()) then
    return new;
  end if;

  -- Non-staff owners may only edit a small set of non-financial fields.
  if new.subtotal is distinct from old.subtotal
     or new.discount is distinct from old.discount
     or new.shipping_fee is distinct from old.shipping_fee
     or new.total is distinct from old.total
     or new.order_no is distinct from old.order_no
     or new.customer_id is distinct from old.customer_id
     or new.organization_id is distinct from old.organization_id
     or new.shop_id is distinct from old.shop_id
     or new.paid_at is distinct from old.paid_at
     or new.receipt_no is distinct from old.receipt_no
     or new.receipt_issued_at is distinct from old.receipt_issued_at
     or new.source is distinct from old.source
     or new.external_order_no is distinct from old.external_order_no
     or new.customer_view_token is distinct from old.customer_view_token
     or new.is_guest is distinct from old.is_guest
     or new.guest_id is distinct from old.guest_id
  then
    raise exception 'ไม่อนุญาตให้แก้ไขยอดเงินหรือข้อมูลสำคัญของออเดอร์' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists orders_guard_customer_updates on public.orders;
create trigger orders_guard_customer_updates
  before update on public.orders
  for each row execute function public.orders_guard_customer_updates();
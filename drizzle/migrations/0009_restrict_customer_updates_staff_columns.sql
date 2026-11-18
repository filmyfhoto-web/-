-- Prevent price/approval tampering: customers may only edit a narrow set of
-- their own descriptive fields; every staff-controlled column is reverted to
-- its previous value on non-staff updates.

create or replace function public.guard_orders_customer_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Staff and server-side (service_role) writes are unrestricted.
  if auth.role() = 'service_role' or public.is_staff(auth.uid()) then
    return new;
  end if;

  -- Revert every staff-controlled column.
  new.id := old.id;
  new.order_no := old.order_no;
  new.organization_id := old.organization_id;
  new.customer_id := old.customer_id;
  new.status := old.status;
  new.subtotal := old.subtotal;
  new.discount := old.discount;
  new.shipping_fee := old.shipping_fee;
  new.total := old.total;
  new.created_at := old.created_at;
  new.deleted_at := old.deleted_at;
  new.cancelled_reason := old.cancelled_reason;
  new.cancelled_by := old.cancelled_by;
  new.cancelled_at := old.cancelled_at;
  new.guest_id := old.guest_id;
  new.is_guest := old.is_guest;
  new.line_link_token := old.line_link_token;
  new.drive_folder_id := old.drive_folder_id;
  new.drive_folder_url := old.drive_folder_url;
  new.drive_synced_at := old.drive_synced_at;
  new.drive_last_error := old.drive_last_error;
  new.drive_store_slug := old.drive_store_slug;
  new.shop_id := old.shop_id;
  new.paid_at := old.paid_at;
  new.receipt_no := old.receipt_no;
  new.receipt_issued_at := old.receipt_issued_at;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_guard_orders_customer_update on public.orders;
create trigger trg_guard_orders_customer_update
  before update on public.orders
  for each row execute function public.guard_orders_customer_update();

create or replace function public.guard_cpo_customer_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' or public.is_staff(auth.uid()) then
    return new;
  end if;

  -- Pricing / approval / document columns are staff-only, always.
  new.id := old.id;
  new.po_number := old.po_number;
  new.user_id := old.user_id;
  new.status := old.status;
  new.review_status := old.review_status;
  new.review_token := old.review_token;
  new.discount := old.discount;
  new.vat_enabled := old.vat_enabled;
  new.vat_rate := old.vat_rate;
  new.vat_amount := old.vat_amount;
  new.wht_enabled := old.wht_enabled;
  new.wht_rate := old.wht_rate;
  new.wht_amount := old.wht_amount;
  new.net_total := old.net_total;
  new.revision_note := old.revision_note;
  new.last_sent_at := old.last_sent_at;
  new.confirmed_at := old.confirmed_at;
  new.documented_at := old.documented_at;
  new.document_no := old.document_no;
  new.document_id := old.document_id;
  new.desk_stage := old.desk_stage;
  new.acknowledged_at := old.acknowledged_at;
  new.acknowledged_by := old.acknowledged_by;
  new.delivery_note_file := old.delivery_note_file;
  new.delivery_note_sent_at := old.delivery_note_sent_at;
  new.delivery_note_sent_by := old.delivery_note_sent_by;
  new.quote_file := old.quote_file;
  new.quote_sent_at := old.quote_sent_at;
  new.quote_sent_by := old.quote_sent_by;
  new.priced_at := old.priced_at;
  new.priced_by := old.priced_by;
  new.created_at := old.created_at;
  new.submitted_at := old.submitted_at;

  -- Once staff have priced or finalised the request, customers cannot edit
  -- the descriptive fields either: freeze the whole row.
  if old.priced_at is not null or coalesce(old.status, '') in ('confirmed', 'documented', 'cancelled') then
    new.customer_name := old.customer_name;
    new.customer_phone := old.customer_phone;
    new.school_or_org := old.school_or_org;
    new.seller_name := old.seller_name;
    new.document_date := old.document_date;
    new.items := old.items;
    new.subtotal := old.subtotal;
    new.note := old.note;
    new.request_quotation := old.request_quotation;
    new.request_delivery_note := old.request_delivery_note;
    new.due_date := old.due_date;
    new.receive_method := old.receive_method;
    new.delivery_note := old.delivery_note;
    new.attachments := old.attachments;
    new.store_slug := old.store_slug;
    new.line_user_id := old.line_user_id;
    new.source := old.source;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_guard_cpo_customer_update on public.customer_purchase_orders;
create trigger trg_guard_cpo_customer_update
  before update on public.customer_purchase_orders
  for each row execute function public.guard_cpo_customer_update();

-- Customers must not delete a submitted purchase order: split the blanket
-- ALL policy into SELECT / INSERT / UPDATE only (staff keep full access).
drop policy if exists "cpo_owner_all" on public.customer_purchase_orders;
create policy "cpo_owner_select" on public.customer_purchase_orders
  for select to authenticated using (auth.uid() = user_id);
create policy "cpo_owner_insert" on public.customer_purchase_orders
  for insert to authenticated with check (auth.uid() = user_id);
create policy "cpo_owner_update" on public.customer_purchase_orders
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
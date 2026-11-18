create or replace function public.notify_staff_new_customer_doc()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text;
  v_title text;
  v_link text;
  v_code text;
begin
  if tg_table_name = 'school_requisitions' then
    v_type := 'new_requisition';
    v_code := 'BR-' || upper(substr(replace(NEW.id::text, '-', ''), 1, 6));
    v_title := 'ใบเขียนเบิกใหม่ ' || v_code;
    v_link := '/admin/customer-purchase-orders?tab=requisitions&focus=' || NEW.id::text;
  else
    v_type := 'new_customer_order';
    v_title := 'ออเดอร์ใหม่ ' || coalesce(NEW.po_number, '');
    v_link := '/admin/customer-purchase-orders?focus=' || NEW.id::text;
  end if;

  insert into public.notifications (type, title, body, ref_id, read, for_staff, link, dedup_key)
  values (v_type, v_title, null, NEW.id, false, true, v_link, v_type || ':' || NEW.id::text)
  on conflict do nothing;

  return NEW;
end;
$$;

drop trigger if exists trg_notify_staff_new_requisition on public.school_requisitions;
create trigger trg_notify_staff_new_requisition
after insert on public.school_requisitions
for each row execute function public.notify_staff_new_customer_doc();

drop trigger if exists trg_notify_staff_new_customer_po on public.customer_purchase_orders;
create trigger trg_notify_staff_new_customer_po
after insert on public.customer_purchase_orders
for each row execute function public.notify_staff_new_customer_doc();

alter table public.school_requisitions replica identity full;
alter table public.customer_purchase_orders replica identity full;
alter table public.customer_excel_intakes replica identity full;

do $$
begin
  begin alter publication supabase_realtime add table public.school_requisitions; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.customer_purchase_orders; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.customer_excel_intakes; exception when duplicate_object then null; end;
end$$;
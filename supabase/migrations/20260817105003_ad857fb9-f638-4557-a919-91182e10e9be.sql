delete from film_order_events where order_id in (select id from film_orders where order_no='OR-2608-0007');
delete from film_order_jobs where order_id in (select id from film_orders where order_no='OR-2608-0007');
delete from film_order_items where order_id in (select id from film_orders where order_no='OR-2608-0007');
delete from film_invoices where invoice_number='JO-26080002';
delete from film_orders where order_no='OR-2608-0007';
delete from film_customers where name='ทดสอบ QA วิซาร์ด';
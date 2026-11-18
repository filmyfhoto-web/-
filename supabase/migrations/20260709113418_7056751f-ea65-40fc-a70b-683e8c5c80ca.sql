
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nw_work_orders TO authenticated;
GRANT ALL ON public.nw_work_orders TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nw_work_order_items TO authenticated;
GRANT ALL ON public.nw_work_order_items TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nw_activity TO authenticated;
GRANT ALL ON public.nw_activity TO service_role;

GRANT ALL ON public.nw_line_webhook_events TO service_role;

GRANT SELECT ON public.rds_stores TO service_role;

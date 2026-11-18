
REVOKE ALL ON FUNCTION public.admin_list_product_views(text,timestamptz,timestamptz,text,int,int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_product_view_stats(timestamptz,timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_customer_view_history(uuid,text,text,int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cleanup_old_product_views() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_product_views(text,timestamptz,timestamptz,text,int,int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_product_view_stats(timestamptz,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_customer_view_history(uuid,text,text,int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_product_views() TO service_role;

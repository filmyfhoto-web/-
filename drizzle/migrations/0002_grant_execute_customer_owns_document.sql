GRANT EXECUTE ON FUNCTION public.customer_owns_document(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_owns_customer_row(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_linked_store_ids(uuid) TO anon, authenticated;
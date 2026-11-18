
REVOKE EXECUTE ON FUNCTION public.assert_my_consent_current() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.customer_get_document_for_download(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_my_consent_current() TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_get_document_for_download(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_consent_versions() TO anon, authenticated;

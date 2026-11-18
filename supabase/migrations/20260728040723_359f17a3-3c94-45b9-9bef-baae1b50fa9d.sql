CREATE OR REPLACE FUNCTION public.admin_email_status(p_emails text[])
RETURNS TABLE (
  recipient_email text,
  template_name text,
  status text,
  error_message text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (l.recipient_email)
         l.recipient_email, l.template_name, l.status, l.error_message, l.created_at
  FROM public.email_send_log l
  WHERE (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'))
    AND l.recipient_email = ANY (SELECT lower(trim(e)) FROM unnest(p_emails) e)
    AND l.status <> 'pending'
  ORDER BY l.recipient_email, l.created_at DESC
$$;

REVOKE ALL ON FUNCTION public.admin_email_status(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_email_status(text[]) TO authenticated;
ALTER TABLE public.film_conversations
  ADD COLUMN IF NOT EXISTS last_read_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_read_by uuid,
  ADD COLUMN IF NOT EXISTS status_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS assignee_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS film_conversations_assignee_idx
  ON public.film_conversations (assignee);

DROP POLICY IF EXISTS "staff write film line attachments" ON storage.objects;
CREATE POLICY "staff write film line attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'film-line-attachments' AND public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "staff update film line attachments" ON storage.objects;
CREATE POLICY "staff update film line attachments"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'film-line-attachments' AND public.is_staff(auth.uid()))
  WITH CHECK (bucket_id = 'film-line-attachments' AND public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "staff delete film line attachments" ON storage.objects;
CREATE POLICY "staff delete film line attachments"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'film-line-attachments' AND public.is_staff(auth.uid()));
CREATE TABLE public.tutorial_video_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_key text NOT NULL,
  step_key text NOT NULL DEFAULT 'open',
  session_id text NOT NULL,
  path text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tutorial_video_views_key_idx ON public.tutorial_video_views (video_key, step_key, created_at DESC);
CREATE UNIQUE INDEX tutorial_video_views_uniq ON public.tutorial_video_views (session_id, video_key, step_key);

GRANT INSERT ON public.tutorial_video_views TO anon, authenticated;
GRANT SELECT ON public.tutorial_video_views TO authenticated;
GRANT ALL ON public.tutorial_video_views TO service_role;

ALTER TABLE public.tutorial_video_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can log a tutorial view"
  ON public.tutorial_video_views FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    length(session_id) BETWEEN 6 AND 64
    AND length(video_key) BETWEEN 1 AND 64
    AND length(step_key) BETWEEN 1 AND 64
  );

CREATE POLICY "staff can read tutorial stats"
  ON public.tutorial_video_views FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));
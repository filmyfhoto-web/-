
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS line_user_id TEXT;

CREATE TABLE public.login_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ip TEXT,
  user_agent TEXT,
  device TEXT,
  country TEXT,
  city TEXT,
  region TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.login_events TO authenticated;
GRANT ALL ON public.login_events TO service_role;

ALTER TABLE public.login_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own login events"
ON public.login_events FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own login events"
ON public.login_events FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Staff can view all login events"
ON public.login_events FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()));

CREATE INDEX idx_login_events_user_time ON public.login_events (user_id, occurred_at DESC);
CREATE INDEX idx_login_events_time ON public.login_events (occurred_at DESC);

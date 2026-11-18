
-- =========================================
-- LINE account links (LIFF binding to customer)
-- =========================================
CREATE TABLE IF NOT EXISTS public.line_account_links (
  line_user_id text PRIMARY KEY,
  phone text NOT NULL,
  display_name text,
  picture_url text,
  customer_id uuid,
  customer_source text CHECK (customer_source IN ('rds','guest','profile')),
  verified_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_line_account_links_phone ON public.line_account_links(phone);
CREATE INDEX IF NOT EXISTS idx_line_account_links_customer ON public.line_account_links(customer_id, customer_source);

GRANT SELECT ON public.line_account_links TO authenticated;
GRANT ALL ON public.line_account_links TO service_role;

ALTER TABLE public.line_account_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read line_account_links" ON public.line_account_links;
CREATE POLICY "staff read line_account_links"
  ON public.line_account_links FOR SELECT
  TO authenticated
  USING (public.is_staff_any(auth.uid()));

DROP TRIGGER IF EXISTS trg_line_account_links_updated ON public.line_account_links;
CREATE TRIGGER trg_line_account_links_updated
  BEFORE UPDATE ON public.line_account_links
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- =========================================
-- OTP codes for LIFF binding (no auth.uid required)
-- =========================================
CREATE TABLE IF NOT EXISTS public.line_link_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id text NOT NULL,
  phone text NOT NULL,
  code char(6) NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_line_link_otps_active
  ON public.line_link_otps(line_user_id, created_at DESC)
  WHERE consumed_at IS NULL;

GRANT ALL ON public.line_link_otps TO service_role;

ALTER TABLE public.line_link_otps ENABLE ROW LEVEL SECURITY;
-- no policies for authenticated: only service_role via edge functions can read/write

-- Scope admin_alert_rule_state writes to the rule's owning admin
DROP POLICY IF EXISTS admin_manage_state ON public.admin_alert_rule_state;
DROP POLICY IF EXISTS admin_read_state ON public.admin_alert_rule_state;

CREATE POLICY admin_read_own_state ON public.admin_alert_rule_state
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    AND EXISTS (
      SELECT 1 FROM public.admin_alert_rules r
      WHERE r.id = admin_alert_rule_state.rule_id
        AND r.admin_user_id = auth.uid()
    )
  );

CREATE POLICY admin_write_own_state ON public.admin_alert_rule_state
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    AND EXISTS (
      SELECT 1 FROM public.admin_alert_rules r
      WHERE r.id = admin_alert_rule_state.rule_id
        AND r.admin_user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    AND EXISTS (
      SELECT 1 FROM public.admin_alert_rules r
      WHERE r.id = admin_alert_rule_state.rule_id
        AND r.admin_user_id = auth.uid()
    )
  );
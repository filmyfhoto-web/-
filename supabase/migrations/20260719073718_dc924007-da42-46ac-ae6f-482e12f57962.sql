CREATE POLICY "staff update line_phone_bindings" ON public.line_phone_bindings FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "staff delete line_phone_bindings" ON public.line_phone_bindings FOR DELETE TO authenticated USING (public.is_staff(auth.uid()));
GRANT UPDATE, DELETE ON public.line_phone_bindings TO authenticated;
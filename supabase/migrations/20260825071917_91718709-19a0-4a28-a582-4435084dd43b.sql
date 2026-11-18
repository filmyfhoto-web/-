-- Hide internal staff identifiers (created_by / approved_by / deleted_by) and
-- other administrative columns from anonymous (public) product reads.
REVOKE SELECT ON public.products FROM anon;

GRANT SELECT (
  id, code, name, category_id, description, unit, image_url,
  stock, low_stock_threshold, standard_price, active,
  created_at, updated_at, status, storage_location, barcode,
  is_watched, weight_grams, has_variants, product_line
) ON public.products TO anon;

-- Public catalog view stays fully readable for anonymous browsing.
GRANT SELECT ON public.products_public TO anon, authenticated;
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Shop tabs used across the stock history page. */
export type ShopKey = "colorlab" | "print" | "pos";

/** Store-name patterns → shop tab (same rules as bill sales). */
export const STORE_NAME_MATCH: Record<"colorlab" | "print", RegExp> = {
  colorlab: /คัลเลอร์แล็ป/,
  print: /การพิมพ์/,
};

export type ImportShopMap = {
  /** rds_stores.id → shop tab */
  storeShop: Record<string, "colorlab" | "print">;
  /** product_shops: products.id → shops it was imported into */
  byProductId: Record<string, Array<"colorlab" | "print">>;
  /** rds_products lookups (the catalog rows created by the import) */
  byBarcode: Record<string, Array<"colorlab" | "print">>;
  bySku: Record<string, Array<"colorlab" | "print">>;
  byName: Record<string, Array<"colorlab" | "print">>;
};

export const EMPTY_IMPORT_MAP: ImportShopMap = {
  storeShop: {},
  byProductId: {},
  byBarcode: {},
  bySku: {},
  byName: {},
};

export function normalizeKey(v: string | null | undefined): string {
  return (v || "").toString().trim().toLowerCase().replace(/\s+/g, " ");
}

function push(
  bucket: Record<string, Array<"colorlab" | "print">>,
  key: string,
  shop: "colorlab" | "print",
) {
  if (!key) return;
  const cur = bucket[key] || [];
  if (!cur.includes(shop)) bucket[key] = [...cur, shop];
  else bucket[key] = cur;
}

export type ProductLike = {
  id: string;
  name?: string | null;
  code?: string | null;
  barcode?: string | null;
  product_line?: string | null;
};

export type ShopResolution = {
  shops: ShopKey[];
  /** where the answer came from — "fallback" means we truly have no source */
  via: "product_shops" | "barcode" | "sku" | "name" | "product_line" | "fallback";
};

/**
 * Resolve which shop tab(s) a product belongs to, preferring "where it was
 * imported" over the manual product_line tag:
 *   product_shops → rds_products by barcode → by sku/code → by name →
 *   product_line → POS walk-in store.
 */
export function resolveProductShops(p: ProductLike, map: ImportShopMap): ShopResolution {
  const direct = map.byProductId[p.id];
  if (direct?.length) return { shops: [...direct], via: "product_shops" };

  const bc = normalizeKey(p.barcode);
  if (bc && map.byBarcode[bc]?.length) return { shops: [...map.byBarcode[bc]], via: "barcode" };

  const sku = normalizeKey(p.code);
  if (sku && map.bySku[sku]?.length) return { shops: [...map.bySku[sku]], via: "sku" };

  const name = normalizeKey(p.name);
  if (name && map.byName[name]?.length) return { shops: [...map.byName[name]], via: "name" };

  if (p.product_line === "colorlab" || p.product_line === "print") {
    return { shops: [p.product_line], via: "product_line" };
  }
  return { shops: ["pos"], via: "fallback" };
}

/** Load the import → shop mapping once (product_shops + rds_products catalog). */
export function useProductShopMap() {
  const [map, setMap] = useState<ImportShopMap>(EMPTY_IMPORT_MAP);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: stores }, { data: links }, { data: catalog }] = await Promise.all([
        supabase.from("rds_stores").select("id, name"),
        supabase.from("product_shops").select("product_id, store_id"),
        supabase.from("rds_products").select("store_id, name, sku, barcode").limit(5000),
      ]);
      if (cancelled) return;

      const storeShop: Record<string, "colorlab" | "print"> = {};
      for (const s of (stores ?? []) as Array<{ id: string; name: string | null }>) {
        (Object.keys(STORE_NAME_MATCH) as Array<"colorlab" | "print">).forEach((k) => {
          if (STORE_NAME_MATCH[k].test(s.name || "")) storeShop[s.id] = k;
        });
      }

      const next: ImportShopMap = { storeShop, byProductId: {}, byBarcode: {}, bySku: {}, byName: {} };
      for (const l of (links ?? []) as Array<{ product_id: string; store_id: string }>) {
        const shop = storeShop[l.store_id];
        if (shop) push(next.byProductId, l.product_id, shop);
      }
      for (const c of (catalog ?? []) as Array<{ store_id: string; name: string | null; sku: string | null; barcode: string | null }>) {
        const shop = storeShop[c.store_id];
        if (!shop) continue;
        push(next.byBarcode, normalizeKey(c.barcode), shop);
        push(next.bySku, normalizeKey(c.sku), shop);
        push(next.byName, normalizeKey(c.name), shop);
      }
      setMap(next);
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  return { map, ready };
}

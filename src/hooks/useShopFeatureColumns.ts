import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { liveChannel } from "@/lib/realtimeChannel";
import {
  DEFAULT_FEATURE_COLUMNS, type FeatureColumnRow, type FeatureItemRow,
} from "@/lib/shopFeatureColumns";

/** เมนูพิเศษ 3 คอลัมน์บนหน้าแรก — แอดมินแก้ได้จาก /admin/shop-home */
export function useShopFeatureColumns() {
  const [columns, setColumns] = useState<FeatureColumnRow[]>(DEFAULT_FEATURE_COLUMNS);
  const [items, setItems] = useState<FeatureItemRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [colRes, itemRes] = await Promise.all([
        (supabase as any).from("shop_feature_columns").select("*").order("sort_order", { ascending: true }),
        (supabase as any).from("shop_feature_items").select("*").order("sort_order", { ascending: true }),
      ]);
      setColumns(colRes.error || !colRes.data?.length ? DEFAULT_FEATURE_COLUMNS : (colRes.data as FeatureColumnRow[]));
      setItems(itemRes.error ? [] : ((itemRes.data as FeatureItemRow[]) ?? []));
    } catch {
      setColumns(DEFAULT_FEATURE_COLUMNS);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const ch = liveChannel("shop-feature-columns-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "shop_feature_columns" }, () => { void load(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "shop_feature_items" }, () => { void load(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  return { columns, items, loading, reload: load };
}

import { useCallback, useEffect, useState } from "react";
import { liveChannel } from "@/lib/realtimeChannel";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_SHORTCUTS, DEFAULT_THEME, normalizeSections, type ServiceShortcutRow, type ShopTheme,
} from "@/lib/shopHomeConfig";

const fallbackRows: ServiceShortcutRow[] = DEFAULT_SHORTCUTS.map((s, i) => ({ ...s, id: `default-${i}` }));

/** เมนูบริการหน้าแรก — ดึงจากฐานข้อมูล + อัปเดตแบบเรียลไทม์ */
export function useServiceShortcuts() {
  const [rows, setRows] = useState<ServiceShortcutRow[]>(fallbackRows);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data, error } = await (supabase as any)
        .from("shop_service_shortcuts")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error || !data?.length) setRows(fallbackRows);
      else setRows(data as ServiceShortcutRow[]);
    } catch {
      setRows(fallbackRows);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const ch = liveChannel("shop-shortcuts-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "shop_service_shortcuts" }, () => { void load(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  return { shortcuts: rows, activeShortcuts: rows.filter((r) => r.is_active), loading, reload: load };
}

/** ธีมหน้าร้าน — สีหลัก สีปุ่ม ความเข้มพื้นหลัง ขนาด/จำนวนไอคอน */
export function useShopTheme() {
  const [theme, setTheme] = useState<ShopTheme>(DEFAULT_THEME);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      // shop_line_id เปิดให้เฉพาะพนักงาน (กันการดูดข้อมูลติดต่อ) — อ่านผ่าน RPC ที่ตรวจสิทธิ์
      const cols = "id,primary_hsl,accent_hsl,gradient_strength,icon_size,icon_columns,font_scale,shop_name,shop_logo_url,sections,updated_at";
      const { data, error } = await (supabase as any)
        .from("shop_theme_settings_public").select(cols).eq("id", 1).maybeSingle();
      const { data: sess } = await supabase.auth.getSession();
      let staffLineId: string | null = null;
      if (sess?.session) {
        const { data: rpcLine } = await (supabase as any).rpc("staff_shop_line_id");
        staffLineId = (rpcLine as string | null) ?? null;
      }
      if (!error && data) {

        const row = data as any;
        setTheme({
          ...DEFAULT_THEME,
          ...row,
          shop_line_id: staffLineId,
          font_scale: Number(row.font_scale) || DEFAULT_THEME.font_scale,
          sections: normalizeSections(row.sections),
        });
      }
    } catch {
      /* ใช้ค่าเริ่มต้น */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const ch = liveChannel("shop-theme-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "shop_theme_settings" }, () => { void load(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  return { theme, loading, reload: load, setThemeLocal: setTheme };
}
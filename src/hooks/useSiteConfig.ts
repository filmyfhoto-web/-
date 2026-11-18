import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_SITE_CONFIG, SITE_SETTINGS_TABLE, SITE_SETTINGS_PUBLIC_VIEW, normalizeSiteConfig, type SiteConfig,
} from "@/lib/siteConfig";

interface SiteConfigState {
  config: SiteConfig;
  /** true = ยังไม่เคยบันทึกจาก editor (หน้า public แสดงค่าเริ่มต้นเดิม) */
  isDefault: boolean;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/**
 * อ่านค่าตั้งค่าหน้าเว็บไซต์สาธารณะ — ล้มเหลวเมื่อไหร่ก็ตกกลับค่าเริ่มต้นเสมอ
 * เพื่อไม่ให้หน้าแรกแตก
 */
export function useSiteConfig(): SiteConfigState {
  const [config, setConfig] = useState<SiteConfig>(DEFAULT_SITE_CONFIG);
  const [isDefault, setIsDefault] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error: err } = await (supabase as any)
        .from(SITE_SETTINGS_PUBLIC_VIEW)
        .select("config")
        .eq("id", 1)
        .maybeSingle();
      if (err) throw err;
      if (data?.config && Object.keys(data.config).length > 0) {
        setConfig(normalizeSiteConfig(data.config));
        setIsDefault(false);
      } else {
        setConfig(DEFAULT_SITE_CONFIG);
        setIsDefault(true);
      }
      setError(null);
    } catch (e) {
      setConfig(DEFAULT_SITE_CONFIG);
      setIsDefault(true);
      setError((e as { message?: string })?.message ?? "โหลดการตั้งค่าไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return { config, isDefault, loading, error, reload: load };
}

/** บันทึกค่า (owner/admin เท่านั้น — บังคับด้วย RLS ฝั่งฐานข้อมูล) */
export async function saveSiteConfig(config: SiteConfig, userId?: string) {
  const { error } = await (supabase as any)
    .from(SITE_SETTINGS_TABLE)
    .upsert({ id: 1, config, updated_by: userId ?? null }, { onConflict: "id" });
  if (error) throw error;
}

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface LineProfileInfo {
  displayName: string | null;
  pictureUrl: string | null;
}

/**
 * แปลง line_user_id → ชื่อ + รูปโปรไฟล์ LINE ของลูกค้า
 * ใช้ในหน้า LINE OA เพื่อให้เห็นชื่อจริงแทนรหัส UID
 */
export function useLineProfileMap(lineUserIds: (string | null | undefined)[]) {
  const ids = useMemo(
    () => Array.from(new Set(lineUserIds.filter((v): v is string => !!v))).sort(),
    [lineUserIds],
  );
  const key = ids.join(",");
  const [map, setMap] = useState<Record<string, LineProfileInfo>>({});

  useEffect(() => {
    if (!ids.length) return;
    let cancelled = false;
    (async () => {
      const db = supabase as any;
      const [links, profiles] = await Promise.all([
        db.from("line_account_links").select("line_user_id,display_name,picture_url").in("line_user_id", ids),
        db.from("profiles").select("line_user_id,line_display_name,line_picture_url").in("line_user_id", ids),
      ]);
      const next: Record<string, LineProfileInfo> = {};
      for (const r of (profiles?.data ?? []) as any[]) {
        if (r.line_user_id) next[r.line_user_id] = { displayName: r.line_display_name ?? null, pictureUrl: r.line_picture_url ?? null };
      }
      for (const r of (links?.data ?? []) as any[]) {
        if (!r.line_user_id) continue;
        const prev = next[r.line_user_id];
        next[r.line_user_id] = {
          displayName: prev?.displayName ?? r.display_name ?? null,
          pictureUrl: prev?.pictureUrl ?? r.picture_url ?? null,
        };
      }
      if (!cancelled) setMap(next);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return map;
}

export default useLineProfileMap;

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** id ผู้ใช้ที่ล็อกอินอยู่ (ตรวจกับเซิร์ฟเวอร์) — ใช้ผูกข้อมูลส่วนตัวกับ RLS */
export function useAuthUserId() {
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data }) => {
      if (alive) setUserId(data.user?.id ?? null);
    });
    return () => { alive = false; };
  }, []);
  return userId;
}

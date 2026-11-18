import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { countPendingWorkItems } from "@/lib/workDocs";

const REFRESH_MS = 30_000;

/** จำนวนงานใน Work Docs ที่ยังไม่ได้รับทราบ จากทุกแหล่งงาน */
export function usePendingWorkCount() {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      setCount(await countPendingWorkItems());
    } catch {
      // เมนูยังใช้งานได้ แม้ query นับจำนวนจะสะดุดชั่วคราว
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), REFRESH_MS);
    const channel = supabase
      .channel(`pending-work-count-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "customer_purchase_orders" }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "school_requisitions" }, () => void refresh())
      .subscribe();

    return () => {
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  return { count, refresh };
}

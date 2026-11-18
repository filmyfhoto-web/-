import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import StaffLayout from "@/components/layout/StaffLayout";
import { Card } from "@/components/ui/card";
import { useRealtimeRefresh } from "@/hooks/useRealtimeTable";

export default function StaffHistory() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  async function load() {
    if (!user) return;
    const { data } = await supabase.from("stock_movements")
      .select("id,product_id,move_type,qty,reason,note,created_at,products(name,code)")
      .eq("created_by", user.id).order("created_at", { ascending: false }).limit(100);
    setRows(data || []);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);
  useRealtimeRefresh(["stock_movements"], () => load());

  return (
    <StaffLayout>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">ประวัติการปรับสต็อกของฉัน</h1>
        <Card className="rounded-2xl divide-y overflow-hidden">
          {rows.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">ยังไม่มีรายการ</div>}
          {rows.map((r) => (
            <div key={r.id} className="p-3 flex items-center justify-between text-sm">
              <div>
                <div className="font-medium">{r.products?.name || r.product_id}</div>
                <div className="text-xs text-muted-foreground">{r.products?.code} · {r.reason}{r.note ? " · " + r.note : ""}</div>
                <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("th-TH")}</div>
              </div>
              <div className={`font-semibold ${r.move_type === "in" ? "text-emerald-600" : r.move_type === "out" ? "text-rose-600" : "text-foreground"}`}>
                {r.move_type === "in" ? "+" : r.move_type === "out" ? "-" : "="}{Number(r.qty)}
              </div>
            </div>
          ))}
        </Card>
      </div>
    </StaffLayout>
  );
}
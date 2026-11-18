import { useEffect, useState } from "react";
import { liveChannel } from "@/lib/realtimeChannel";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import StaffLayout from "@/components/layout/StaffLayout";
import { Card } from "@/components/ui/card";
import { Package, Camera, AlertTriangle, XCircle, ClipboardCheck, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function StaffDashboard() {
  const { user, canEditProduct } = useAuth();
  const [stats, setStats] = useState({ total: 0, todayMine: 0, pendingImg: 0, low: 0, out: 0, myPending: 0 });
  const [recent, setRecent] = useState<any[]>([]);

  const load = async () => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const [tot, mine, pImg, low, out, myP, recentRows] = await Promise.all([
      supabase.from("products").select("id", { count: "exact", head: true }),
      user ? supabase.from("products").select("id", { count: "exact", head: true })
        .eq("created_by", user.id).gte("created_at", today.toISOString()) : Promise.resolve({ count: 0 } as any),
      supabase.from("product_images").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("products").select("id", { count: "exact", head: true }).eq("status", "low_stock"),
      supabase.from("products").select("id", { count: "exact", head: true }).eq("status", "out_of_stock"),
      user ? supabase.from("products").select("id", { count: "exact", head: true })
        .eq("created_by", user.id).eq("status", "pending_review") : Promise.resolve({ count: 0 } as any),
      supabase.from("stock_movements").select("id,product_id,move_type,qty,reason,note,created_at,products(name,code)")
        .order("created_at", { ascending: false }).limit(10),
    ]);
    setStats({
      total: tot.count || 0, todayMine: mine.count || 0, pendingImg: pImg.count || 0,
      low: low.count || 0, out: out.count || 0, myPending: myP.count || 0
    });
    setRecent(recentRows.data || []);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);
  useEffect(() => {
    const ch = liveChannel("staff-dash")
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_movements" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "product_images" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, []);

  const cards = [
    { label: "สินค้าทั้งหมด", value: stats.total, icon: Package, to: "/staff/stock", color: "bg-primary/10 text-primary" },
    { label: "ที่ฉันเพิ่มวันนี้", value: stats.todayMine, icon: Plus, to: "/staff/pending", color: "bg-emerald-500/10 text-emerald-600" },
    { label: "รูปสินค้ารอตรวจ", value: stats.pendingImg, icon: Camera, to: "/staff/photos", color: "bg-blue-500/10 text-blue-600" },
    { label: "ใกล้หมด", value: stats.low, icon: AlertTriangle, to: "/staff/low-stock", color: "bg-amber-500/10 text-amber-600" },
    { label: "หมดสต็อก", value: stats.out, icon: XCircle, to: "/staff/low-stock", color: "bg-rose-500/10 text-rose-600" },
    { label: "ของฉันรอตรวจ", value: stats.myPending, icon: ClipboardCheck, to: "/staff/pending", color: "bg-accent/60 text-primary" },
  ];

  return (
    <StaffLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">หน้าหลักพนักงาน</h1>
            <p className="text-sm text-muted-foreground">ภาพรวมสินค้า สต็อก และรูปภาพ</p>
          </div>
          {canEditProduct && (
            <Link to="/staff/products/new"><Button className="rounded-xl"><Plus className="w-4 h-4 mr-1" />เพิ่มสินค้า</Button></Link>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {cards.map((c) => (
            <Link to={c.to} key={c.label}>
              <Card className="p-4 hover:shadow-card transition-all rounded-2xl">
                <div className={`w-10 h-10 rounded-xl grid place-items-center ${c.color}`}><c.icon className="w-5 h-5" /></div>
                <div className="mt-3 text-2xl font-bold">{c.value}</div>
                <div className="text-xs text-muted-foreground">{c.label}</div>
              </Card>
            </Link>
          ))}
        </div>

        <Card className="rounded-2xl p-4">
          <div className="font-semibold mb-3">การปรับสต็อกล่าสุด</div>
          <div className="divide-y">
            {recent.length === 0 && <div className="text-sm text-muted-foreground py-4 text-center">ยังไม่มีรายการ</div>}
            {recent.map((r) => (
              <div key={r.id} className="py-2 flex items-center justify-between text-sm">
                <div>
                  <div className="font-medium">{r.products?.name || r.product_id}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.products?.code} · {r.reason} · {new Date(r.created_at).toLocaleString("th-TH")}
                  </div>
                </div>
                <div className={`font-semibold ${r.move_type === "in" ? "text-emerald-600" : r.move_type === "out" ? "text-rose-600" : "text-foreground"}`}>
                  {r.move_type === "in" ? "+" : r.move_type === "out" ? "-" : "="}{Number(r.qty)}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </StaffLayout>
  );
}
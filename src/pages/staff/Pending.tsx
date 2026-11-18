import { useEffect, useState } from "react";
import { liveChannel } from "@/lib/realtimeChannel";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import StaffLayout from "@/components/layout/StaffLayout";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default function StaffPending() {
  const { user } = useAuth();
  const [prods, setProds] = useState<any[]>([]);
  const [imgs, setImgs] = useState<any[]>([]);
  const load = async () => {
    if (!user) return;
    const [p, i] = await Promise.all([
      supabase.from("products").select("id,name,code,status,image_url,created_at")
        .eq("created_by", user.id).in("status", ["draft", "pending_review"]).order("created_at", { ascending: false }),
      supabase.from("product_images").select("id,url,status,note,created_at,products(name,code)")
        .eq("uploaded_by", user.id).order("created_at", { ascending: false }).limit(50),
    ]);
    setProds(p.data || []); setImgs(i.data || []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);
  useEffect(() => {
    const ch = liveChannel("staff-pending")
      .on("postgres_changes", { event: "*", schema: "public", table: "product_images" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, []);

  return (
    <StaffLayout>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">รายการของฉันที่รอตรวจสอบ</h1>
        <Tabs defaultValue="products">
          <TabsList><TabsTrigger value="products">สินค้า ({prods.length})</TabsTrigger><TabsTrigger value="images">รูปภาพ ({imgs.length})</TabsTrigger></TabsList>
          <TabsContent value="products" className="space-y-2">
            {prods.length === 0 && <Card className="p-6 text-center text-sm text-muted-foreground rounded-2xl">ยังไม่มีสินค้ารอตรวจ</Card>}
            {prods.map((p) => (
              <Card key={p.id} className="p-3 rounded-2xl flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-muted overflow-hidden">{p.image_url && <img src={p.image_url} alt="รูปสินค้า" className="w-full h-full object-cover" />}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.code} · {new Date(p.created_at).toLocaleString("th-TH")}</div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${p.status === "draft" ? "bg-muted" : "bg-amber-100 text-amber-700"}`}>
                  {p.status === "draft" ? "ร่าง" : "รอตรวจ"}
                </span>
              </Card>
            ))}
          </TabsContent>
          <TabsContent value="images" className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {imgs.length === 0 && <Card className="p-6 text-center text-sm text-muted-foreground rounded-2xl col-span-full">ยังไม่มีรูป</Card>}
            {imgs.map((m) => (
              <div key={m.id}>
                <div className="aspect-square rounded-xl overflow-hidden bg-muted">
                  <img src={m.url} alt="รูปสินค้า" className="w-full h-full object-cover" />
                </div>
                <div className="text-[11px] truncate mt-1">{m.products?.name}</div>
                <div className={`text-[10px] inline-block px-2 py-0.5 rounded-full ${m.status === "approved" ? "bg-emerald-100 text-emerald-700" : m.status === "rejected" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>
                  {m.status === "approved" ? "อนุมัติ" : m.status === "rejected" ? "ถูกปฏิเสธ" : "รอตรวจ"}
                </div>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </StaffLayout>
  );
}
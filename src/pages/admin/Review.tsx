import { useEffect, useState } from "react";
import { liveChannel } from "@/lib/realtimeChannel";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/layout/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Check, X, Star } from "lucide-react";

export default function AdminReview() {
  const [prods, setProds] = useState<any[]>([]);
  const [imgs, setImgs] = useState<any[]>([]);

  const load = async () => {
    const [p, i] = await Promise.all([
      supabase.from("products").select("id,name,code,image_url,description,unit,stock,storage_location,created_at,created_by")
        .eq("status", "pending_review").order("created_at"),
      supabase.from("product_images").select("id,url,note,uploaded_by,created_at,product_id,products(name,code)")
        .eq("status", "pending").order("created_at"),
    ]);
    const uids = Array.from(new Set([
      ...(p.data || []).map((x: any) => x.created_by).filter(Boolean),
      ...(i.data || []).map((x: any) => x.uploaded_by).filter(Boolean),
    ]));
    let profMap: Record<string, any> = {};
    if (uids.length > 0) {
      const { data: profs } = await supabase.from("profiles").select("id,full_name,email").in("id", uids);
      profMap = Object.fromEntries((profs || []).map((u: any) => [u.id, u]));
    }
    setProds((p.data || []).map((x: any) => ({ ...x, profile: profMap[x.created_by] })));
    setImgs((i.data || []).map((x: any) => ({ ...x, profile: profMap[x.uploaded_by] })));
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const ch = liveChannel("admin-review")
      .on("postgres_changes", { event: "*", schema: "public", table: "product_images" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function reviewProduct(id: string, approve: boolean) {
    const { error } = await supabase.rpc("admin_review_product", { p_product_id: id, p_approve: approve, p_note: null });
    if (error) toast.error(error.message); else { toast.success(approve ? "อนุมัติแล้ว" : "ส่งกลับเป็นร่าง"); load(); }
  }
  async function reviewImage(id: string, approve: boolean, setPrimary = false) {
    const { error } = await supabase.rpc("admin_review_image", { p_image_id: id, p_approve: approve, p_set_primary: setPrimary });
    if (error) toast.error(error.message); else { toast.success("บันทึกแล้ว"); load(); }
  }

  return (
    <AdminLayout>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">ตรวจสอบจากพนักงาน</h1>
        <Tabs defaultValue="products">
          <TabsList>
            <TabsTrigger value="products">สินค้ารอตรวจ ({prods.length})</TabsTrigger>
            <TabsTrigger value="images">รูปภาพรอตรวจ ({imgs.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="products" className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {prods.length === 0 && <Card className="p-6 text-center text-sm text-muted-foreground rounded-2xl col-span-full">ไม่มีสินค้ารอตรวจ</Card>}
            {prods.map((p) => (
              <Card key={p.id} className="rounded-2xl p-4 space-y-2">
                <div className="flex gap-3">
                  <div className="w-20 h-20 rounded-xl bg-muted overflow-hidden">{p.image_url && <img src={p.image_url} alt="รูปสินค้า" className="w-full h-full object-cover" />}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.code} · {p.unit} · คงเหลือ {Number(p.stock || 0)}</div>
                    {p.storage_location && <div className="text-xs text-muted-foreground">📍 {p.storage_location}</div>}
                    <div className="text-xs text-muted-foreground mt-1">จาก: {p.profile?.full_name || p.profile?.email || "-"}</div>
                  </div>
                </div>
                {p.description && <div className="text-sm text-muted-foreground">{p.description}</div>}
                <div className="flex gap-2 pt-2">
                  <Button className="flex-1 rounded-xl" onClick={() => reviewProduct(p.id, true)}><Check className="w-4 h-4 mr-1" />อนุมัติ เปิดขาย</Button>
                  <Button variant="outline" className="flex-1 rounded-xl" onClick={() => reviewProduct(p.id, false)}><X className="w-4 h-4 mr-1" />ส่งกลับเป็นร่าง</Button>
                </div>
              </Card>
            ))}
          </TabsContent>
          <TabsContent value="images" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {imgs.length === 0 && <Card className="p-6 text-center text-sm text-muted-foreground rounded-2xl col-span-full">ไม่มีรูปรอตรวจ</Card>}
            {imgs.map((m) => (
              <Card key={m.id} className="rounded-2xl overflow-hidden">
                <div className="aspect-square bg-muted"><img src={m.url} alt="รูปสินค้า" className="w-full h-full object-cover" /></div>
                <div className="p-3 space-y-2">
                  <div className="text-sm font-medium truncate">{m.products?.name}</div>
                  <div className="text-xs text-muted-foreground truncate">โดย {m.profile?.full_name || m.profile?.email || "-"}</div>
                  {m.note && <div className="text-xs">💬 {m.note}</div>}
                  <div className="flex gap-1">
                    <Button size="sm" className="flex-1 rounded-lg" onClick={() => reviewImage(m.id, true)}><Check className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="secondary" className="flex-1 rounded-lg" onClick={() => reviewImage(m.id, true, true)} title="ตั้งเป็นรูปหลัก"><Star className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="outline" className="flex-1 rounded-lg" onClick={() => reviewImage(m.id, false)}><X className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
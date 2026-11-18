import { useEffect, useRef, useState } from "react";
import { liveChannel } from "@/lib/realtimeChannel";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import StaffLayout from "@/components/layout/StaffLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Camera, Upload, Search } from "lucide-react";

export default function StaffPhotos() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [products, setProducts] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<any[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  const search = async () => {
    const term = q.trim();
    const qb = supabase.from("products").select("id,code,name,image_url").order("name").limit(30);
    const { data } = term ? await qb.or(`name.ilike.%${term}%,code.ilike.%${term}%,barcode.eq.${term}`) : await qb;
    setProducts(data || []);
  };

  const loadMine = async () => {
    if (!user) return;
    const { data } = await supabase.from("product_images")
      .select("id,url,status,note,created_at,product_id,products(name,code)")
      .eq("uploaded_by", user.id).order("created_at", { ascending: false }).limit(20);
    setMine(data || []);
  };

  useEffect(() => { search(); loadMine(); /* eslint-disable-next-line */ }, [user?.id]);
  useEffect(() => {
    const ch = liveChannel("staff-photos")
      .on("postgres_changes", { event: "*", schema: "public", table: "product_images" }, () => loadMine())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, []);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setFile(f); setPreview(URL.createObjectURL(f));
  }

  async function submit() {
    if (!selected) { toast.error("กรุณาเลือกสินค้า"); return; }
    if (!file) { toast.error("กรุณาเลือก/ถ่ายรูป"); return; }
    setBusy(true);
    try {
      const path = `${selected.id}/${Date.now()}-${file.name}`;
      const up = await supabase.storage.from("product-images").upload(path, file, { upsert: false });
      if (up.error) throw up.error;
      const { data: pub } = supabase.storage.from("product-images").getPublicUrl(path);
      const { error } = await supabase.rpc("staff_submit_product_image", {
        p_product_id: selected.id, p_url: pub.publicUrl, p_storage_path: path, p_note: note || null,
      });
      if (error) throw error;
      toast.success("ส่งรูปให้แอดมินตรวจแล้ว");
      setFile(null); setPreview(null); setNote(""); setSelected(null);
      loadMine();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  return (
    <StaffLayout>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">อัปโหลดรูปสินค้า</h1>
        <Card className="p-4 rounded-2xl space-y-3">
          <div>
            <Label>เลือกสินค้า</Label>
            <div className="flex gap-2 mt-1">
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ / SKU / บาร์โค้ด" className="rounded-xl" onKeyDown={(e) => e.key === "Enter" && search()} />
              <Button variant="outline" className="rounded-xl" onClick={search}><Search className="w-4 h-4" /></Button>
            </div>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
              {products.map((p) => (
                <button key={p.id} onClick={() => setSelected(p)} className={`text-left p-2 rounded-xl border ${selected?.id === p.id ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 bg-muted rounded-lg overflow-hidden grid place-items-center">
                      {p.image_url ? <img src={p.image_url} alt="รูปสินค้า" className="w-full h-full object-cover" /> : <Camera className="w-4 h-4 text-muted-foreground" />}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{p.name}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{p.code}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {selected && (
            <div className="border-t pt-3 space-y-3">
              <div className="text-sm">สินค้า: <span className="font-semibold">{selected.name}</span></div>
              <div className="flex items-center gap-3">
                <div className="w-28 h-28 rounded-xl bg-muted overflow-hidden grid place-items-center">
                  {preview ? <img src={preview} alt="รูปสินค้า" className="w-full h-full object-cover" /> : <Camera className="w-7 h-7 text-muted-foreground" />}
                </div>
                <div className="flex flex-col gap-2">
                  <Button type="button" variant="outline" className="rounded-xl" onClick={() => camRef.current?.click()}>
                    <Camera className="w-4 h-4 mr-1" /> ถ่ายรูป
                  </Button>
                  <Button type="button" variant="outline" className="rounded-xl" onClick={() => fileRef.current?.click()}>
                    <Upload className="w-4 h-4 mr-1" /> เลือกจากเครื่อง
                  </Button>
                </div>
                <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPick} />
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
              </div>
              <div>
                <Label>หมายเหตุถึงแอดมิน</Label>
                <Input value={note} onChange={(e) => setNote(e.target.value)} className="rounded-xl mt-1" placeholder="เช่น มุมหน้า / รูปแกะกล่อง" />
              </div>
              <Button disabled={busy} className="rounded-xl w-full" onClick={submit}>ส่งให้แอดมินตรวจสอบ</Button>
            </div>
          )}
        </Card>

        <Card className="p-4 rounded-2xl">
          <div className="font-semibold mb-3">รูปที่ฉันส่ง (ล่าสุด)</div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {mine.map((m) => (
              <div key={m.id} className="space-y-1">
                <div className="aspect-square rounded-xl overflow-hidden bg-muted">
                  <img src={m.url} alt="รูปสินค้า" className="w-full h-full object-cover" />
                </div>
                <div className="text-[11px] truncate">{m.products?.name}</div>
                <div className={`text-[10px] inline-block px-2 py-0.5 rounded-full
                  ${m.status === "approved" ? "bg-emerald-100 text-emerald-700"
                    : m.status === "rejected" ? "bg-rose-100 text-rose-700"
                      : "bg-amber-100 text-amber-700"}`}>
                  {m.status === "approved" ? "อนุมัติ" : m.status === "rejected" ? "ถูกปฏิเสธ" : "รอตรวจ"}
                </div>
              </div>
            ))}
            {mine.length === 0 && <div className="text-sm text-muted-foreground col-span-full text-center py-4">ยังไม่มีรูป</div>}
          </div>
        </Card>
      </div>
    </StaffLayout>
  );
}
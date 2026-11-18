import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tags, Plus, Trash2, Search } from "lucide-react";
import { toast } from "sonner";

type Prod = { id: string; name: string; standard_price: number; unit: string | null };
type Tier = { id: string; product_id: string; min_qty: number; unit_price: number };

export default function PosPricing() {
  const [products, setProducts] = useState<Prod[]>([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [minQty, setMinQty] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, standard_price, unit")
        .eq("active", true)
        .is("deleted_at", null)
        .order("name", { ascending: true })
        .limit(500);
      setProducts((data ?? []) as any as Prod[]);
    })();
  }, []);

  useEffect(() => {
    if (!selected) { setTiers([]); return; }
    (async () => {
      const { data } = await supabase
        .from("product_wholesale_tiers")
        .select("id, product_id, min_qty, unit_price")
        .eq("product_id", selected)
        .order("min_qty", { ascending: true });
      setTiers((data ?? []) as any as Tier[]);
    })();
  }, [selected]);

  const filtered = useMemo(
    () => products.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase())),
    [products, q],
  );

  const current = products.find((p) => p.id === selected);

  async function addTier() {
    if (!selected) return;
    const mq = Number(minQty);
    const up = Number(unitPrice);
    if (!mq || mq <= 0 || !isFinite(up) || up < 0) {
      toast.error("กรอกจำนวนขั้นต่ำและราคาที่ถูกต้อง");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("product_wholesale_tiers")
      .upsert({ product_id: selected, min_qty: mq, unit_price: up }, { onConflict: "product_id,min_qty" });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("บันทึกเกณฑ์ราคาแล้ว");
    setMinQty(""); setUnitPrice("");
    const { data } = await supabase
      .from("product_wholesale_tiers")
      .select("id, product_id, min_qty, unit_price")
      .eq("product_id", selected)
      .order("min_qty", { ascending: true });
    setTiers((data ?? []) as any as Tier[]);
  }

  async function removeTier(id: string) {
    if (!confirm("ลบเกณฑ์นี้?")) return;
    const { error } = await supabase.from("product_wholesale_tiers").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setTiers((t) => t.filter((x) => x.id !== id));
  }

  return (
    <div className="p-3 md:p-5 max-w-[1400px] mx-auto space-y-3">
      <div className="flex items-center gap-2">
        <Tags className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold">ราคาขายส่ง</h2>
        <span className="text-xs text-muted-foreground ml-1">
          เมื่อขายถึงจำนวนที่กำหนด ระบบจะคิดราคาต่อหน่วยตามเกณฑ์อัตโนมัติ
        </span>
      </div>

      <div className="grid md:grid-cols-[380px_1fr] gap-3">
        <Card className="p-3 space-y-2">
          <div className="flex items-center gap-1">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input placeholder="ค้นหาสินค้า" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="max-h-[70vh] overflow-y-auto divide-y border rounded">
            {filtered.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">ไม่พบสินค้า</div>
            ) : filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelected(p.id)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-accent/50 ${selected === p.id ? "bg-primary/10" : ""}`}
              >
                <div className="font-medium truncate">{p.name}</div>
                <div className="text-xs text-muted-foreground">
                  ฿{Number(p.standard_price).toLocaleString()} / {p.unit || "หน่วย"}
                </div>
              </button>
            ))}
          </div>
        </Card>

        <Card className="p-3">
          {!current ? (
            <div className="p-8 text-center text-sm text-muted-foreground">เลือกสินค้าเพื่อจัดการราคาขายส่ง</div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-baseline justify-between border-b pb-2">
                <div>
                  <div className="font-bold">{current.name}</div>
                  <div className="text-xs text-muted-foreground">
                    ราคามาตรฐาน ฿{Number(current.standard_price).toLocaleString()} / {current.unit || "หน่วย"}
                  </div>
                </div>
                <Badge variant="secondary">{tiers.length} เกณฑ์</Badge>
              </div>

              <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                <div>
                  <label className="text-xs text-muted-foreground">จำนวนขั้นต่ำ ({current.unit || "หน่วย"})</label>
                  <Input type="number" min={1} step="1" value={minQty} onChange={(e) => setMinQty(e.target.value)} placeholder="เช่น 10" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">ราคา/หน่วย (บาท)</label>
                  <Input type="number" min={0} step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder="เช่น 4.50" />
                </div>
                <Button onClick={addTier} disabled={busy}>
                  <Plus className="h-4 w-4 mr-1" /> เพิ่ม
                </Button>
              </div>

              <div className="border rounded overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs">
                    <tr>
                      <th className="text-left px-3 py-2">ซื้อครบ</th>
                      <th className="text-right px-3 py-2">ราคา/หน่วย</th>
                      <th className="text-right px-3 py-2">ส่วนลด/หน่วย</th>
                      <th className="px-3 py-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {tiers.length === 0 ? (
                      <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">ยังไม่มีเกณฑ์ราคา</td></tr>
                    ) : tiers.map((t) => {
                      const save = Number(current.standard_price) - Number(t.unit_price);
                      return (
                        <tr key={t.id} className="border-t">
                          <td className="px-3 py-2">≥ {Number(t.min_qty)} {current.unit || "หน่วย"}</td>
                          <td className="px-3 py-2 text-right font-bold text-emerald-700">฿{Number(t.unit_price).toFixed(2)}</td>
                          <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                            {save > 0 ? `ประหยัด ฿${save.toFixed(2)}` : "-"}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Button size="sm" variant="ghost" onClick={() => removeTier(t.id)} className="text-rose-600">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
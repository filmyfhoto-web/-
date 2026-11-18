import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/film-shop/lib/supabase";
import { useUserRole } from "@/film-shop/hooks/useUserRole";
import { ListChecks, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface QuickEntryRow {
  id: string;
  label: string;
  tx_type: string;
  category: string | null;
  default_amount: number | null;
  sort_order: number;
  is_active: boolean;
}

/**
 * ตั้งรายการปุ่มลัดของการ์ด "งานวันนี้" ในแชทม่วงจดให้
 * — เจ้าของ/แอดมินเพิ่มเองได้ว่าจะให้มีปุ่มอะไรบ้าง
 */
export function NattaQuickEntriesCard() {
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [rows, setRows] = useState<QuickEntryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [label, setLabel] = useState("");
  const [txType, setTxType] = useState<"income" | "expense">("income");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("film_natta_quick_entries")
      .select("id,label,tx_type,category,default_amount,sort_order,is_active")
      .order("sort_order", { ascending: true });
    setLoading(false);
    if (error) { toast.error("โหลดรายการลัดไม่สำเร็จ"); return; }
    setRows((data ?? []) as QuickEntryRow[]);
  }, []);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  if (roleLoading || !isAdmin) return null;

  const add = async () => {
    const name = label.trim();
    if (!name) { toast.error("ใส่ชื่อรายการก่อนนะคะ"); return; }
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("film_natta_quick_entries").insert({
      label: name,
      tx_type: txType,
      category: category.trim() || null,
      default_amount: amount.trim() ? Number(amount) : null,
      sort_order: rows.length,
      is_active: true,
      created_by: auth.user?.id ?? null,
    });
    setSaving(false);
    if (error) { toast.error("บันทึกไม่สำเร็จ: " + error.message); return; }
    toast.success("เพิ่มปุ่มลัดแล้ว");
    setLabel(""); setCategory(""); setAmount("");
    load();
  };

  const toggle = async (row: QuickEntryRow, active: boolean) => {
    const { error } = await supabase.from("film_natta_quick_entries").update({ is_active: active }).eq("id", row.id);
    if (error) { toast.error("แก้ไขไม่สำเร็จ"); return; }
    load();
  };

  const remove = async (row: QuickEntryRow) => {
    const { error } = await supabase.from("film_natta_quick_entries").delete().eq("id", row.id);
    if (error) { toast.error("ลบไม่สำเร็จ"); return; }
    load();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListChecks className="w-5 h-5 text-primary" /> ปุ่มลัด “งานวันนี้” ของม่วงจดให้
        </CardTitle>
        <CardDescription>
          พิมพ์ “งานวันนี้” ในแชท จะได้การ์ดปุ่มลัดตามรายการนี้ กดปุ่มแล้วพิมพ์แค่ยอดเงินก็บันทึกได้เลย
          (เพิ่มหมายเหตุต่อท้ายได้ เช่น “ขายรูป 360 หมายเหตุ ลูกค้าโอนแล้ว”)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-[1fr_130px_1fr_120px_auto]">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ชื่อรายการ เช่น ขายรูป" />
          <Select value={txType} onValueChange={(v) => setTxType(v as "income" | "expense")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="income">รายรับ</SelectItem>
              <SelectItem value="expense">รายจ่าย</SelectItem>
            </SelectContent>
          </Select>
          <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="หมวด (ไม่บังคับ)" />
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="ยอดตั้งต้น"
            inputMode="decimal"
          />
          <Button onClick={add} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
            เพิ่ม
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">กำลังโหลด…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            ยังไม่ได้ตั้งเอง — ตอนนี้ใช้ชุดเริ่มต้น (ขายรูป / งานป้าย / ขายสินค้า / ซื้อกระดาษ / ค่าส่ง)
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                <div className="min-w-[160px] flex-1">
                  <div className="font-medium">{r.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.category || "หมวดอัตโนมัติ"}
                    {r.default_amount ? ` · ตั้งต้น ${Number(r.default_amount).toLocaleString("th-TH")} บาท` : ""}
                  </div>
                </div>
                <Badge variant={r.tx_type === "income" ? "default" : "secondary"}>
                  {r.tx_type === "income" ? "รายรับ" : "รายจ่าย"}
                </Badge>
                <Switch checked={r.is_active} onCheckedChange={(v) => toggle(r, v)} />
                <Button variant="ghost" size="sm" onClick={() => remove(r)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default NattaQuickEntriesCard;

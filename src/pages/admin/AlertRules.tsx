import { useEffect, useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BellRing, Plus, Trash2, Pencil, Zap } from "lucide-react";
import { toast } from "sonner";

type EventType = "view" | "chat" | "order" | "new_customer" | "high_value_order" | "keyword";

const EVENT_LABEL: Record<EventType, string> = {
  view: "ลูกค้าเข้าดูสินค้า",
  chat: "ลูกค้าทัก LINE",
  order: "มีออเดอร์ใหม่",
  new_customer: "ลูกค้าใหม่ทักครั้งแรก",
  high_value_order: "ออเดอร์ยอดสูง (≥ min_amount)",
  keyword: "ข้อความ LINE มีคีย์เวิร์ด",
};

type Rule = {
  id: string;
  admin_user_id: string;
  label: string;
  event_type: EventType;
  enabled: boolean;
  min_amount: number | null;
  keyword: string | null;
  channels: string[];
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  cooldown_seconds: number;
};

const EMPTY: Omit<Rule, "id" | "admin_user_id"> = {
  label: "",
  event_type: "chat",
  enabled: true,
  min_amount: null,
  keyword: null,
  channels: ["line", "desktop"],
  quiet_hours_start: null,
  quiet_hours_end: null,
  cooldown_seconds: 60,
};

const PRESETS: Array<{ label: string; patch: Partial<Rule> }> = [
  { label: "ลูกค้าใหม่ทัก LINE (แจ้งทันที)", patch: { event_type: "new_customer", cooldown_seconds: 0 } },
  { label: "ออเดอร์ยอด ≥ 5,000฿", patch: { event_type: "high_value_order", min_amount: 5000 } },
  { label: "ลูกค้าพิมพ์คำว่า “ราคา”", patch: { event_type: "keyword", keyword: "ราคา" } },
  { label: "ออเดอร์ใหม่ทุกออเดอร์", patch: { event_type: "order", cooldown_seconds: 0 } },
];

export default function AdminAlertRules() {
  const { user } = useAuth();
  const [rules, setRules] = useState<Rule[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState<any>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from("admin_alert_rules" as any).select("*").order("created_at", { ascending: true });
    setRules(((data ?? []) as any) as Rule[]);
  }
  useEffect(() => { load(); }, []);

  function openNew(patch?: Partial<Rule>) {
    setEditingId(null);
    setDraft({ ...EMPTY, label: patch?.label || "", ...patch });
    setEditOpen(true);
  }

  function openEdit(r: Rule) {
    setEditingId(r.id);
    setDraft({ ...r });
    setEditOpen(true);
  }

  async function save() {
    if (!user?.id) return;
    if (!draft.label?.trim()) { toast.error("กรุณาใส่ชื่อกฎ"); return; }
    const payload: any = {
      admin_user_id: user.id,
      label: draft.label.trim(),
      event_type: draft.event_type,
      enabled: draft.enabled,
      min_amount: draft.min_amount ? Number(draft.min_amount) : null,
      keyword: draft.keyword?.trim() || null,
      channels: draft.channels?.length ? draft.channels : ["line"],
      quiet_hours_start: draft.quiet_hours_start || null,
      quiet_hours_end: draft.quiet_hours_end || null,
      cooldown_seconds: Number(draft.cooldown_seconds ?? 60),
    };
    if (editingId) {
      const { error } = await supabase.from("admin_alert_rules" as any).update(payload).eq("id", editingId);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from("admin_alert_rules" as any).insert(payload);
      if (error) { toast.error(error.message); return; }
    }
    setEditOpen(false);
    toast.success("บันทึกกฎแล้ว");
    load();
  }

  async function remove(id: string) {
    if (!confirm("ลบกฎนี้?")) return;
    await supabase.from("admin_alert_rules" as any).delete().eq("id", id);
    load();
  }

  async function toggle(r: Rule) {
    await supabase.from("admin_alert_rules" as any).update({ enabled: !r.enabled }).eq("id", r.id);
    load();
  }

  function toggleChannel(name: string) {
    setDraft((d: any) => {
      const set = new Set<string>(d.channels || []);
      if (set.has(name)) set.delete(name); else set.add(name);
      return { ...d, channels: Array.from(set) };
    });
  }

  return (
    <AdminLayout>
      <div className="p-4 max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BellRing className="w-6 h-6 text-primary" /> กฎแจ้งเตือน
            </h1>
            <p className="text-sm text-muted-foreground">ตั้งกฎให้ระบบยิงแจ้งเตือนคุณอัตโนมัติเมื่อมีเหตุการณ์สำคัญ</p>
          </div>
          <Button onClick={() => openNew()}><Plus className="w-4 h-4 mr-1" /> เพิ่มกฎ</Button>
        </div>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Zap className="w-4 h-4" /> เทมเพลตกฎ (คลิกเพื่อสร้าง)</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <Button key={p.label} size="sm" variant="outline" onClick={() => openNew({ label: p.label, ...p.patch })}>
                {p.label}
              </Button>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-2">
          {rules.length === 0 && (
            <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">ยังไม่มีกฎ · กด “เพิ่มกฎ” หรือเลือกเทมเพลตด้านบน</CardContent></Card>
          )}
          {rules.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-3 flex items-center justify-between gap-2 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Switch checked={r.enabled} onCheckedChange={() => toggle(r)} />
                    <span className="font-semibold truncate">{r.label}</span>
                    <Badge variant="outline" className="text-[10px]">{EVENT_LABEL[r.event_type]}</Badge>
                    {r.channels.map((c) => <Badge key={c} className="text-[10px]" variant="secondary">{c}</Badge>)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {r.min_amount ? `ยอด ≥ ${Number(r.min_amount).toLocaleString()}฿ · ` : ""}
                    {r.keyword ? `คีย์เวิร์ด "${r.keyword}" · ` : ""}
                    Cooldown {r.cooldown_seconds}s
                    {r.quiet_hours_start && r.quiet_hours_end ? ` · เงียบ ${r.quiet_hours_start}–${r.quiet_hours_end}` : ""}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(r)}><Pencil className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove(r.id)}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{editingId ? "แก้ไขกฎ" : "เพิ่มกฎแจ้งเตือน"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>ชื่อกฎ</Label>
                <Input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
              </div>
              <div>
                <Label>ประเภทเหตุการณ์</Label>
                <Select value={draft.event_type} onValueChange={(v) => setDraft({ ...draft, event_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(EVENT_LABEL) as EventType[]).map((k) => (
                      <SelectItem key={k} value={k}>{EVENT_LABEL[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(draft.event_type === "high_value_order") && (
                <div>
                  <Label>ยอดขั้นต่ำ (บาท)</Label>
                  <Input type="number" value={draft.min_amount ?? ""} onChange={(e) => setDraft({ ...draft, min_amount: e.target.value })} />
                </div>
              )}
              {(draft.event_type === "keyword") && (
                <div>
                  <Label>คีย์เวิร์ด</Label>
                  <Input value={draft.keyword ?? ""} onChange={(e) => setDraft({ ...draft, keyword: e.target.value })} placeholder="เช่น ราคา" />
                </div>
              )}
              <div>
                <Label>ช่องทางแจ้ง</Label>
                <div className="flex gap-4 mt-1 text-sm">
                  {["line", "desktop", "inapp"].map((c) => (
                    <label key={c} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={(draft.channels || []).includes(c)} onChange={() => toggleChannel(c)} />
                      {c === "line" ? "LINE" : c === "desktop" ? "Desktop" : "ในระบบ"}
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>เงียบตั้งแต่</Label>
                  <Input type="time" value={draft.quiet_hours_start ?? ""} onChange={(e) => setDraft({ ...draft, quiet_hours_start: e.target.value || null })} />
                </div>
                <div>
                  <Label>ถึง</Label>
                  <Input type="time" value={draft.quiet_hours_end ?? ""} onChange={(e) => setDraft({ ...draft, quiet_hours_end: e.target.value || null })} />
                </div>
              </div>
              <div>
                <Label>Cooldown (วินาที)</Label>
                <Input type="number" value={draft.cooldown_seconds} onChange={(e) => setDraft({ ...draft, cooldown_seconds: e.target.value })} />
                <p className="text-[11px] text-muted-foreground mt-1">ป้องกัน spam — ยิงกฎเดิมซ้ำได้อีกครั้งหลังผ่านไปกี่วินาที</p>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={draft.enabled} onCheckedChange={(v) => setDraft({ ...draft, enabled: v })} />
                <Label className="cursor-pointer">เปิดใช้งาน</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditOpen(false)}>ยกเลิก</Button>
              <Button onClick={save}>บันทึก</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/film-shop/lib/supabase";
import { useUserRole } from "@/film-shop/hooks/useUserRole";
import { ShieldCheck, Loader2, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";

interface ManagerRow {
  id: string;
  line_user_id: string;
  display_name: string | null;
  note: string | null;
  is_active: boolean;
  created_at: string;
}

const maskId = (s: string) => (s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s);

/**
 * เจ้าของร้านตั้ง "ผู้จัดการ Film Shop" เองได้จากหน้านี้
 * — ใครอยู่ในรายชื่อนี้ (และเปิดใช้งาน) จะสั่งงานม่วงจดให้ใน LINE ได้ทันที
 *   โดยไม่ต้องไปตั้งสิทธิ์ในฐานข้อมูล
 */
export function FilmManagersCard() {
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [rows, setRows] = useState<ManagerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lineId, setLineId] = useState("");
  const [name, setName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("film_shop_managers")
      .select("id,line_user_id,display_name,note,is_active,created_at")
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) { toast.error("โหลดรายชื่อไม่สำเร็จ"); return; }
    setRows((data ?? []) as ManagerRow[]);
  }, []);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  if (roleLoading || !isAdmin) return null;

  const add = async () => {
    const uid = lineId.trim();
    if (!/^U[0-9a-f]{32}$/i.test(uid)) {
      toast.error("LINE User ID ต้องขึ้นต้นด้วย U และยาว 33 ตัวอักษร");
      return;
    }
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("film_shop_managers").upsert({
      line_user_id: uid,
      display_name: name.trim() || null,
      is_active: true,
      created_by: auth.user?.id ?? null,
    }, { onConflict: "line_user_id" });
    setSaving(false);
    if (error) { toast.error("บันทึกไม่สำเร็จ: " + error.message); return; }
    toast.success("เพิ่มผู้จัดการแล้ว");
    setLineId(""); setName("");
    load();
  };

  const toggle = async (row: ManagerRow, active: boolean) => {
    const { error } = await supabase.from("film_shop_managers").update({ is_active: active }).eq("id", row.id);
    if (error) { toast.error("แก้ไขไม่สำเร็จ"); return; }
    load();
  };

  const remove = async (row: ManagerRow) => {
    const { error } = await supabase.from("film_shop_managers").delete().eq("id", row.id);
    if (error) { toast.error("ลบไม่สำเร็จ"); return; }
    toast.success("ลบแล้ว");
    load();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" /> ผู้จัดการ Film Shop (สิทธิ์คุยกับม่วงจดให้)
        </CardTitle>
        <CardDescription>
          ใส่ LINE User ID ของคนที่ให้บันทึกรายรับ-รายจ่ายผ่านแชทได้ — เจ้าของตั้งเองได้ทันที ไม่ต้องแก้สิทธิ์ในฐานข้อมูล
          (ดู User ID ได้จากข้อความ “ไอดีของฉัน” ในแชทม่วงจดให้ หรือหน้าเชื่อมบัญชี LINE ด้านล่าง)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-[1fr_200px_auto]">
          <Input
            value={lineId}
            onChange={(e) => setLineId(e.target.value)}
            placeholder="LINE User ID (Uxxxxxxxx...)"
            className="font-mono text-sm"
          />
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อเรียก (ไม่บังคับ)" />
          <Button onClick={add} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <UserPlus className="w-4 h-4 mr-1" />}
            เพิ่มผู้จัดการ
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">กำลังโหลด…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">ยังไม่มีรายชื่อ — เจ้าของ/แอดมินในระบบยังใช้งานได้ตามปกติ</p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                <div className="min-w-[180px] flex-1">
                  <div className="font-medium">{r.display_name || "ไม่ระบุชื่อ"}</div>
                  <div className="font-mono text-xs text-muted-foreground">{maskId(r.line_user_id)}</div>
                </div>
                <Badge variant={r.is_active ? "default" : "secondary"}>
                  {r.is_active ? "ใช้งานอยู่" : "ปิดใช้งาน"}
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

export default FilmManagersCard;

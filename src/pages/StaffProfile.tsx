import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import AdminLayout from "@/components/layout/AdminLayout";
import StaffLayout from "@/components/layout/StaffLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { KeyRound, Loader2, LogOut, Save, UserCircle2 } from "lucide-react";
import { readOrderAlertPrefs, writeOrderAlertPrefs, type OrderAlertPrefs } from "@/lib/orderAlertPrefs";
import { LANDING_OPTIONS, getDefaultLanding, setDefaultLanding, type LandingValue } from "@/lib/staffLanding";

const ROLE_LABEL: Record<string, string> = {
  owner: "เจ้าของร้าน",
  admin: "แอดมิน",
  stock_staff: "พนักงานสต็อก",
  photo_staff: "พนักงานถ่ายรูป",
  customer: "ลูกค้า",
};

export default function StaffProfile() {
  const { user, profile, roles, isStaff, refresh, signOut } = useAuth();
  const nav = useNavigate();
  const Layout = isStaff ? AdminLayout : StaffLayout;

  const [form, setForm] = useState({ full_name: "", phone: "" });
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [prefs, setPrefs] = useState<OrderAlertPrefs | null>(null);
  const [landing, setLanding] = useState<LandingValue>("auto");

  useEffect(() => {
    setForm({ full_name: profile?.full_name ?? "", phone: profile?.phone ?? "" });
  }, [profile?.full_name, profile?.phone]);

  useEffect(() => {
    setPrefs(readOrderAlertPrefs());
    setLanding(getDefaultLanding());
  }, []);

  async function saveProfile() {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: form.full_name.trim() || null, phone: form.phone.trim() || null })
      .eq("id", user.id);
    setSaving(false);
    if (error) { toast.error(friendlyError(error, "บันทึกไม่สำเร็จ")); return; }
    toast.success("บันทึกข้อมูลบัญชีแล้ว");
    refresh();
  }

  async function changePassword() {
    if (pw.length < 8) { toast.error("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร"); return; }
    if (pw !== pw2) { toast.error("รหัสผ่านทั้งสองช่องไม่ตรงกัน"); return; }
    setPwSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setPwSaving(false);
    if (error) { toast.error(friendlyError(error, "เปลี่ยนรหัสผ่านไม่สำเร็จ")); return; }
    setPw(""); setPw2("");
    toast.success("เปลี่ยนรหัสผ่านเรียบร้อยแล้ว");
  }

  function updatePref(patch: Partial<OrderAlertPrefs>) {
    setPrefs(writeOrderAlertPrefs(patch));
  }

  return (
    <Layout>
      <div className="max-w-2xl space-y-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <UserCircle2 className="w-6 h-6 text-primary" /> โปรไฟล์ของฉัน
        </h1>

        <section className="bg-card rounded-2xl border border-border shadow-card p-6 space-y-4" data-testid="profile-account">
          <h2 className="font-bold">ข้อมูลบัญชี</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="pf-name">ชื่อ-สกุล</Label>
              <Input id="pf-name" className="rounded-xl mt-1" value={form.full_name}
                onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="pf-phone">เบอร์โทร</Label>
              <Input id="pf-phone" className="rounded-xl mt-1" value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <Label>อีเมล</Label>
              <Input className="rounded-xl mt-1" value={profile?.email || user?.email || ""} readOnly disabled />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={saveProfile} disabled={saving} className="rounded-xl">
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              บันทึกข้อมูล
            </Button>
            <div className="flex flex-wrap gap-1">
              {roles.length === 0 && <Badge variant="outline">ยังไม่มีบทบาท</Badge>}
              {roles.map((r) => <Badge key={r} variant="secondary">{ROLE_LABEL[r] || r}</Badge>)}
            </div>
          </div>
        </section>

        <section className="bg-card rounded-2xl border border-border shadow-card p-6 space-y-4" data-testid="profile-password">
          <h2 className="font-bold flex items-center gap-2"><KeyRound className="w-4 h-4" /> เปลี่ยนรหัสผ่าน</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="pf-pw">รหัสผ่านใหม่</Label>
              <Input id="pf-pw" type="password" autoComplete="new-password" className="rounded-xl mt-1"
                value={pw} onChange={(e) => setPw(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="pf-pw2">ยืนยันรหัสผ่านใหม่</Label>
              <Input id="pf-pw2" type="password" autoComplete="new-password" className="rounded-xl mt-1"
                value={pw2} onChange={(e) => setPw2(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">ต้องมีอย่างน้อย 8 ตัวอักษร</p>
          <Button onClick={changePassword} disabled={pwSaving} variant="outline" className="rounded-xl">
            {pwSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <KeyRound className="w-4 h-4 mr-2" />}
            เปลี่ยนรหัสผ่าน
          </Button>
        </section>

        <section className="bg-card rounded-2xl border border-border shadow-card p-6 space-y-4" data-testid="profile-prefs">
          <h2 className="font-bold">ตั้งค่าเบื้องต้นของบัญชี</h2>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">แจ้งเตือนออเดอร์ใหม่แบบป๊อปอัป</div>
              <div className="text-xs text-muted-foreground">แสดงข้อความเด้งเมื่อมีออเดอร์ใหม่เข้ามา</div>
            </div>
            <Switch checked={!!prefs?.toast} onCheckedChange={(v) => updatePref({ toast: v })} aria-label="ป๊อปอัปแจ้งเตือน" />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">เสียงแจ้งเตือน</div>
              <div className="text-xs text-muted-foreground">เล่นเสียงเมื่อมีออเดอร์ใหม่</div>
            </div>
            <Switch checked={!!prefs?.sound} onCheckedChange={(v) => updatePref({ sound: v })} aria-label="เสียงแจ้งเตือน" />
          </div>
          <div>
            <Label>หน้าเริ่มต้นหลังเข้าสู่ระบบ</Label>
            <Select value={landing} onValueChange={(v) => { setLanding(v as LandingValue); setDefaultLanding(v as LandingValue); toast.success("บันทึกหน้าเริ่มต้นแล้ว"); }}>
              <SelectTrigger className="rounded-xl mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LANDING_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="pt-2 border-t border-border">
            <Button variant="outline" className="rounded-xl text-destructive"
              onClick={async () => { await signOut(); nav("/staff"); }}>
              <LogOut className="w-4 h-4 mr-2" /> ออกจากระบบ
            </Button>
          </div>
        </section>
      </div>
    </Layout>
  );
}
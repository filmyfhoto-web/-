import AdminLayout from "@/components/layout/AdminLayout";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Bell, MessageCircle, Loader2, Volume2, ShoppingCart, Inbox, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import {
  readOrderAlertPrefs,
  writeOrderAlertPrefs,
  purgeLegacyOrderAlertPrefs,
  type OrderAlertPrefs,
} from "@/lib/orderAlertPrefs";
import { playOrderBeep } from "@/hooks/useNewOrderAlerts";

export default function AdminNotificationSettings() {
  const [s, setS] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [adminTesting, setAdminTesting] = useState(false);
  const [adminTestResult, setAdminTestResult] = useState<{ ok: boolean; skipped?: boolean; reason?: string; detail?: string } | null>(null);
  const [prefs, setPrefs] = useState<OrderAlertPrefs>(() => readOrderAlertPrefs());

  function updatePrefs(patch: Partial<OrderAlertPrefs>) {
    setPrefs(writeOrderAlertPrefs(patch));
  }

  // One-time cleanup for workstations that still carry the removed
  // browser-side auto-resend switch in localStorage.
  useEffect(() => { purgeLegacyOrderAlertPrefs(); }, []);

  useEffect(() => {
    supabase.from("settings").select("*").eq("id", 1).maybeSingle()
      .then(({ data }) => setS(data || { id: 1, notify_signup_inapp: true, notify_signup_line: true }));
  }, []);

  async function save() {
    setSaving(true);
    const { error } = await supabase.from("settings").upsert({
      id: 1,
      notify_signup_inapp: !!s.notify_signup_inapp,
      notify_signup_line: !!s.notify_signup_line,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("บันทึกการตั้งค่าแล้ว");
  }

  async function sendTest() {
    setTesting(true);
    try {
      const { data: org } = await supabase.from("organizations").select("id").limit(1).maybeSingle();
      if (!org?.id) { toast.error("ยังไม่มีหน่วยงานสำหรับทดสอบ"); return; }
      const { data, error } = await supabase.functions.invoke("notify-new-signup", {
        body: { org_id: org.id, kind: "test" },
      });
      if (error) throw error;
      if ((data as any)?.line?.skipped) toast.warning(`ข้าม LINE: ${(data as any).line.reason}`);
      else if ((data as any)?.line?.ok) toast.success("ส่งทดสอบ LINE แล้ว");
      else toast.error("ส่ง LINE ไม่สำเร็จ ตรวจ Logs");
    } catch (e: any) {
      toast.error(e?.message || "ทดสอบไม่สำเร็จ");
    } finally { setTesting(false); }
  }

  async function sendAdminTest() {
    setAdminTesting(true);
    setAdminTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("line-notify", { body: { kind: "admin_test" } });
      if (error) throw error;
      const admin = (data as any)?.results?.admin;
      if (admin?.ok) {
        setAdminTestResult({ ok: true, detail: admin?.deduped ? "ส่งซ้ำถูกข้าม (idempotency)" : "ส่งสำเร็จ" });
        toast.success("ส่งทดสอบถึงแอดมินแล้ว");
      } else if (admin?.skipped) {
        setAdminTestResult({ ok: false, skipped: true, reason: admin?.reason || "ไม่ทราบเหตุผล" });
        toast.warning(`ข้าม: ${admin?.reason || "ไม่ทราบเหตุผล"}`);
      } else {
        setAdminTestResult({ ok: false, detail: `LINE ตอบกลับ ${admin?.status || ""} ${admin?.body || ""}`.trim() });
        toast.error("ส่ง LINE ถึงแอดมินไม่สำเร็จ");
      }
    } catch (e: any) {
      setAdminTestResult({ ok: false, detail: e?.message || "ไม่ทราบข้อผิดพลาด" });
      toast.error(e?.message || "ทดสอบไม่สำเร็จ");
    } finally { setAdminTesting(false); }
  }

  if (!s) return <AdminLayout><div className="text-center py-12 text-muted-foreground">กำลังโหลด...</div></AdminLayout>;

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold mb-1 flex items-center gap-2"><Bell className="w-6 h-6 text-primary" /> ตั้งค่าการแจ้งเตือน</h1>
      <p className="text-sm text-muted-foreground mb-5">เลือกช่องทางที่ระบบจะแจ้งแอดมินเมื่อมีคำขอเข้าร่วม / สมัครหน่วยงานใหม่</p>

      <div className="bg-card rounded-2xl border border-border shadow-card p-6 max-w-2xl space-y-5">
        <section className="space-y-3">
          <div className="text-sm font-semibold text-muted-foreground">คำขอเข้าร่วม / สมัครหน่วยงานใหม่</div>

          <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border">
            <div>
              <Label className="flex items-center gap-2"><Bell className="w-4 h-4" /> แจ้งเตือนในแอป (กระดิ่ง)</Label>
              <p className="text-xs text-muted-foreground mt-1">แสดงในศูนย์แจ้งเตือนของแอดมินทันทีที่มีลูกค้าสมัคร</p>
            </div>
            <Switch checked={!!s.notify_signup_inapp}
              onCheckedChange={(v) => setS({ ...s, notify_signup_inapp: v })} />
          </div>

          <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border">
            <div>
              <Label className="flex items-center gap-2"><MessageCircle className="w-4 h-4" /> ส่งข้อความ LINE ถึงแอดมิน</Label>
              <p className="text-xs text-muted-foreground mt-1">ใช้ LINE Official Account ส่งให้ <code>LINE_ADMIN_USER_ID</code> พร้อมลิงก์ไปหน้าอนุมัติ</p>
            </div>
            <Switch checked={!!s.notify_signup_line}
              onCheckedChange={(v) => setS({ ...s, notify_signup_line: v })} />
          </div>
        </section>

        <section className="space-y-3 pt-2 border-t border-border">
          <div className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <ShoppingCart className="w-4 h-4" /> แจ้งเตือนคำสั่งซื้อใหม่ (ตั้งค่าเฉพาะเครื่องนี้)
          </div>

          <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border">
            <div>
              <Label className="flex items-center gap-2"><Bell className="w-4 h-4" /> แสดงป๊อปอัปเมื่อมีออเดอร์ใหม่</Label>
              <p className="text-xs text-muted-foreground mt-1">แจ้งเตือนมุมจอทันทีที่ลูกค้าส่งคำสั่งซื้อ</p>
            </div>
            <Switch
              data-testid="pref-order-toast"
              checked={prefs.toast}
              onCheckedChange={(v) => updatePrefs({ toast: v })}
            />
          </div>

          <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border">
            <div>
              <Label className="flex items-center gap-2"><Volume2 className="w-4 h-4" /> เล่นเสียงเตือน</Label>
              <p className="text-xs text-muted-foreground mt-1">ใช้ค่าเดียวกับปุ่มเปิด/ปิดเสียงในหน้าแจ้งเตือนคำสั่งซื้อ</p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="rounded-xl" onClick={() => { if (!playOrderBeep()) toast.warning("เสียงถูกปิดอยู่ หรือเบราว์เซอร์บล็อกเสียง"); }}>
                ทดสอบเสียง
              </Button>
              <Switch
                data-testid="pref-order-sound"
                checked={prefs.sound}
                onCheckedChange={(v) => updatePrefs({ sound: v })}
              />
            </div>
          </div>

          <div
            data-testid="delivery-server-side-note"
            className="flex items-start justify-between gap-4 p-4 rounded-xl border border-border bg-muted/30"
          >
            <div>
              <Label className="flex items-center gap-2"><MessageCircle className="w-4 h-4" /> การส่ง LINE</Label>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                ระบบส่งข้อความจากเซิร์ฟเวอร์ให้อัตโนมัติ (ทุก 1 นาที) และกันส่งซ้ำให้แล้ว
                จึงไม่มีสวิตช์ “ส่งซ้ำอัตโนมัติ” ต่อเครื่องอีกต่อไป
                ดูสถานะคิว ข้อความที่ค้าง และสั่งส่งซ้ำได้ที่ศูนย์แจ้งเตือน
              </p>
            </div>
            <Button asChild variant="outline" size="sm" className="rounded-xl shrink-0">
              <Link to="/admin/notification-center" data-testid="link-notification-center">
                <Inbox className="w-4 h-4 mr-1.5" /> ศูนย์แจ้งเตือน <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Link>
            </Button>
          </div>
        </section>

        <section className="space-y-3 pt-2 border-t border-border">
          <div className="text-sm font-semibold text-muted-foreground">ตรวจสอบการส่ง LINE ถึงแอดมิน</div>
          <p className="text-xs text-muted-foreground">
            กดเพื่อส่งข้อความทดสอบไปยัง <code>LINE_ADMIN_USER_ID</code> โดยไม่ต้องรอคำขอเข้าร่วมใหม่
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={sendAdminTest} disabled={adminTesting} variant="outline" className="rounded-xl">
              {adminTesting && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              ส่งทดสอบ LINE ถึงแอดมิน
            </Button>
            {adminTestResult && (
              <span className={`text-xs ${adminTestResult.ok ? "text-success" : "text-destructive"}`}>
                {adminTestResult.ok ? "✅ " : "❌ "}
                {adminTestResult.skipped ? `ข้าม: ${adminTestResult.reason}` : adminTestResult.detail}
              </span>
            )}
          </div>
        </section>

        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={save} disabled={saving} className="rounded-xl bg-gradient-primary text-primary-foreground">
            {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} บันทึก
          </Button>
          <Button onClick={sendTest} disabled={testing} variant="outline" className="rounded-xl">
            {testing && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} ส่งทดสอบ LINE (ผ่านคำขอเข้าร่วม)
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
}
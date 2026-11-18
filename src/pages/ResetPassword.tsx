import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import SeoHead from "@/components/SeoHead";
import { friendlyError } from "@/lib/errors";

export default function ResetPassword() {
  const nav = useNavigate();
  const [ready, setReady] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Supabase places recovery info in URL hash; the JS client reads it and sets a session
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    // also accept if already signed in via existing session
    supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true); });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) { toast.error("รหัสผ่านอย่างน้อย 8 ตัวอักษร"); return; }
    if (pw !== pw2) { toast.error("รหัสผ่านไม่ตรงกัน"); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setLoading(false);
    if (error) { toast.error(friendlyError(error, "ตั้งรหัสผ่านใหม่ไม่สำเร็จ")); return; }
    toast.success("ตั้งรหัสผ่านใหม่สำเร็จ");
    nav("/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-gradient-soft grid place-items-center p-4">
      <SeoHead title="ตั้งรหัสผ่านใหม่" description="ตั้งรหัสผ่านใหม่หลังจากคลิกลิงก์รีเซ็ต" path="/reset-password" />
      <div className="w-full max-w-md">
        <div className="bg-card rounded-3xl p-8 shadow-card border border-border">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-11 h-11 rounded-xl bg-primary grid place-items-center text-primary-foreground">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold leading-tight">ตั้งรหัสผ่านใหม่</h1>
              <p className="text-xs text-muted-foreground">กรอกรหัสผ่านใหม่ที่จะใช้สำหรับเข้าสู่ระบบ</p>
            </div>
          </div>
          {!ready ? (
            <div className="text-sm text-muted-foreground space-y-3">
              <p>กำลังตรวจสอบลิงก์รีเซ็ต... ถ้าหน้านี้ไม่ตอบสนอง โปรดเปิดลิงก์จากอีเมลอีกครั้ง</p>
              <Link to="/forgot-password" className="text-primary underline">ขอลิงก์ใหม่</Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <Label>รหัสผ่านใหม่</Label>
                <Input type="password" required value={pw} onChange={(e) => setPw(e.target.value)} className="rounded-xl mt-1" />
              </div>
              <div>
                <Label>ยืนยันรหัสผ่านใหม่</Label>
                <Input type="password" required value={pw2} onChange={(e) => setPw2(e.target.value)} className="rounded-xl mt-1" />
              </div>
              <Button type="submit" disabled={loading} className="w-full h-11 rounded-xl bg-primary text-primary-foreground">
                {loading ? "กำลังบันทึก..." : "บันทึกรหัสผ่านใหม่"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
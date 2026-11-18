import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { LogIn, Loader2 } from "lucide-react";
import { resolveLanding } from "@/lib/staffLanding";
import { readLoginContext, resolvePostLoginTarget } from "@/lib/posLoginContext";
import { fetchLoginRole } from "@/lib/fetchLoginRole";

/**
 * ฟอร์มเข้าสู่ระบบพนักงาน/แอดมินแบบสั้นที่สุด: อีเมล + รหัสผ่าน → ยืนยัน → เข้าหน้างานทันที
 * (owner/admin → /admin/home, พนักงานอื่น → /pos)
 */
export default function StaffPasswordLogin() {
  const nav = useNavigate();
  const [email, setEmail] = useState(() => localStorage.getItem("lov.lastEmail") || "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      setLoading(false);
      toast.error(friendlyError(error, "เข้าสู่ระบบไม่สำเร็จ"));
      return;
    }
    localStorage.setItem("lov.lastEmail", email.trim());
    supabase.functions.invoke("log-login").catch(() => {});
    const uid = data.user?.id;
    const fresh = await fetchLoginRole(uid);
    const isAdmin = !!fresh.isOwner || !!fresh.isAdmin;
    const isStaffAny = !!fresh.isStaffAny;
    const active = fresh.active;
    setLoading(false);
    if (!isStaffAny) {
      await supabase.auth.signOut();
      toast.error("บัญชีนี้ยังไม่ได้รับสิทธิ์พนักงาน — ติดต่อผู้ดูแลระบบเพื่อขอเชิญเข้าใช้งาน");
      return;
    }
    if (!active) {
      await supabase.auth.signOut();
      toast.error("บัญชีพนักงานนี้ถูกปิดการใช้งาน — ติดต่อเจ้าของร้าน");
      return;
    }
    toast.success("เข้าสู่ระบบสำเร็จ");
    // Keep the POS PWA context (?app=pos&next=/pos/register) through login.
    const ctx = readLoginContext(window.location.search);
    nav(ctx.app || ctx.next ? resolvePostLoginTarget(ctx, fresh) : resolveLanding(isAdmin), { replace: true });
  }

  return (
    <Card className="p-5 sm:p-6" data-testid="staff-password-login">
      <h2 className="font-semibold text-base">เข้าสู่ระบบพนักงาน / แอดมิน</h2>
      <p className="text-xs text-muted-foreground mt-0.5 mb-4">
        กรอกอีเมลและรหัสผ่าน แล้วกดยืนยัน — ระบบจะพาเข้าหน้างานของคุณทันที
      </p>
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="staff-email">อีเมล</Label>
          <Input
            id="staff-email"
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-xl mt-1 h-11"
          />
        </div>
        <div>
          <Label htmlFor="staff-password">รหัสผ่าน</Label>
          <Input
            id="staff-password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-xl mt-1 h-11"
          />
        </div>
        <Button type="submit" disabled={loading} className="w-full h-12 rounded-xl text-base" data-testid="staff-password-submit">
          {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> กำลังเข้าสู่ระบบ...</> : <><LogIn className="w-4 h-4 mr-2" /> ยืนยันเข้าสู่ระบบ</>}
        </Button>
        <div className="text-center">
          <Link to="/forgot-password" className="text-xs text-primary underline underline-offset-2" data-testid="staff-forgot-password">
            ลืมรหัสผ่าน?
          </Link>
        </div>
      </form>
    </Card>
  );
}

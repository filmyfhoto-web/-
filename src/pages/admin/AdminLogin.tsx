import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import SignedInPanel from "@/components/auth/SignedInPanel";
import { resolveRoleHome } from "@/lib/roleHome";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SeoHead from "@/components/SeoHead";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { fetchLoginRole } from "@/lib/fetchLoginRole";
import { ShieldCheck, Loader2, LogIn, Users } from "lucide-react";

/**
 * ประตูเข้าสำหรับ "แอดมิน/เจ้าของร้าน" โดยเฉพาะ — แยกลิงก์กับพนักงานชัดเจน
 * แอดมิน: /admin/login   พนักงาน: /staff/login
 * บัญชีที่ไม่ใช่ owner/admin จะถูกออกจากระบบและแนะนำให้ไปหน้าพนักงาน
 */
export default function AdminLogin() {
  const nav = useNavigate();
  const { user, loading: authLoading, isOwner, isAdmin, isStaffAny } = useAuth();
  const [email, setEmail] = useState(() => localStorage.getItem("lov.lastEmail") || "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setBusy(false);
      toast.error(friendlyError(error, "เข้าสู่ระบบไม่สำเร็จ"));
      return;
    }
    const fresh = await fetchLoginRole(data.user?.id);
    setBusy(false);
    if (!fresh.active) {
      await supabase.auth.signOut();
      toast.error("บัญชีนี้ถูกปิดการใช้งาน — ติดต่อเจ้าของร้าน");
      return;
    }
    if (!fresh.isOwner && !fresh.isAdmin) {
      await supabase.auth.signOut();
      toast.error("บัญชีนี้ไม่ใช่แอดมิน", { description: "ถ้าคุณเป็นพนักงาน กรุณาเข้าที่หน้าพนักงาน" });
      nav("/staff/login", { replace: true });
      return;
    }
    localStorage.setItem("lov.lastEmail", email.trim());
    supabase.functions.invoke("log-login").catch(() => {});
    toast.success("เข้าสู่ระบบแอดมินสำเร็จ");
    nav(
      resolveRoleHome({
        signedIn: true,
        isOwner: fresh.isOwner,
        isAdmin: fresh.isAdmin,
        isStaffAny: fresh.isStaffAny,
      }),
      { replace: true },
    );
  }

  if (!authLoading && user) {
    return (
      <main className="min-h-[100dvh] grid place-items-center px-5 py-10 bg-gradient-to-b from-muted/40 to-background">
        <SeoHead
          title="เข้าสู่ระบบแอดมิน — ร้านนัฐภรณ์"
          description="ประตูเข้าสำหรับผู้ดูแลระบบและเจ้าของร้านโดยเฉพาะ แยกจากหน้าเข้าสู่ระบบพนักงาน"
          path="/admin/login"
        />
        <SignedInPanel
          email={user.email}
          uid={user.id}
          target={resolveRoleHome({ signedIn: true, isOwner, isAdmin, isStaffAny, isCustomer: true })}
        />
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] grid place-items-center px-5 py-10 bg-gradient-to-b from-muted/40 to-background">
      <SeoHead
        title="เข้าสู่ระบบแอดมิน — ร้านนัฐภรณ์"
        description="ประตูเข้าสำหรับผู้ดูแลระบบและเจ้าของร้านโดยเฉพาะ แยกจากหน้าเข้าสู่ระบบพนักงาน"
        path="/admin/login"
      />
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-2xl border bg-card p-6 space-y-4 shadow-sm" data-testid="admin-login">
        <header className="text-center space-y-1">
          <div className="mx-auto w-11 h-11 rounded-2xl bg-primary/10 text-primary grid place-items-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h1 className="text-xl font-bold">เข้าสู่ระบบแอดมิน</h1>
          <p className="text-xs text-muted-foreground">เฉพาะเจ้าของร้าน/ผู้ดูแลระบบเท่านั้น</p>
        </header>

        <div className="space-y-1.5">
          <Label htmlFor="admin-email">อีเมลแอดมิน</Label>
          <Input id="admin-email" type="email" required autoComplete="username" value={email}
            onChange={(e) => setEmail(e.target.value)} className="rounded-xl h-11" />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="admin-password">รหัสผ่าน</Label>
            <Link to="/forgot-password" className="text-xs text-primary hover:underline">ลืมรหัสผ่าน?</Link>
          </div>
          <Input id="admin-password" type="password" required autoComplete="current-password" value={password}
            onChange={(e) => setPassword(e.target.value)} className="rounded-xl h-11" />
        </div>

        <Button type="submit" disabled={busy} className="w-full h-11 rounded-xl" data-testid="admin-login-submit">
          {busy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> กำลังเข้าสู่ระบบ...</> : <><LogIn className="w-4 h-4 mr-2" /> เข้าสู่ระบบแอดมิน</>}
        </Button>

        <div className="pt-2 border-t text-center">
          <p className="text-xs text-muted-foreground mb-2">ไม่ใช่แอดมิน?</p>
          <Link
            to="/staff/login"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            data-testid="admin-login-to-staff"
          >
            <Users className="w-4 h-4" /> ไปหน้าเข้าสู่ระบบพนักงาน →
          </Link>
        </div>
      </form>
    </main>
  );
}

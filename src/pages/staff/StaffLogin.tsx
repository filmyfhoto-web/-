import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2, LogIn, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SeoHead from "@/components/SeoHead";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { resolveRoleHome } from "@/lib/roleHome";
import { readLoginContext, resolvePostLoginTarget, magicLinkRedirect } from "@/lib/posLoginContext";
import { fetchLoginRole } from "@/lib/fetchLoginRole";
import SignedInPanel from "@/components/auth/SignedInPanel";
import { logDeepLinkResolved } from "@/lib/deepLinkLog";

/**
 * Staff sign-in. Uses the existing Supabase auth only:
 * email + password, or a passwordless magic link. No shared shop PIN.
 */
export default function StaffLogin() {
  const { user, loading, isOwner, isAdmin, isStaffAny, hasPerm } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const ctx = useMemo(() => readLoginContext(location.search), [location.search]);
  const role = { isOwner, isAdmin, isStaffAny, canPos: hasPerm("pos"), canStock: hasPerm("stock") };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => { setError(null); }, [email, password]);

  // ผลการนำพากลับของเซสชันที่มีอยู่แล้ว (บันทึกไว้ตรวจปัญหา deep link)
  const rawNext = useMemo(() => new URLSearchParams(location.search || "").get("next"), [location.search]);
  const signedInTarget = user
    ? (ctx.app || ctx.next ? resolvePostLoginTarget(ctx, role) : resolveRoleHome({ signedIn: true, isOwner, isAdmin, isStaffAny }))
    : null;
  useEffect(() => {
    if (!signedInTarget) return;
    logDeepLinkResolved({ requested: rawNext, target: signedInTarget, stage: "existing_session" });
  }, [signedInTarget, rawNext]);

  if (loading) {
    return <main className="min-h-[100dvh] grid place-items-center text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin" /></main>;
  }
  if (user) {
    // An existing session still has to be evaluated against the real role —
    // the POS icon does not grant POS access.
    const to = signedInTarget!;
    return (
      <main className="min-h-[100dvh] grid place-items-center px-5 py-10 bg-gradient-to-b from-slate-50 to-white">
        <SeoHead title="พนักงานเข้าสู่ระบบ" description="เข้าสู่ระบบสำหรับพนักงานร้าน" path="/staff/login" />
        <SignedInPanel email={user.email} uid={user.id} target={to} />
      </main>
    );
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const { data, error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (err) { setBusy(false); setError("อีเมลหรือรหัสผ่านไม่ถูกต้อง กรุณาลองใหม่"); return; }
    // Evaluate the *real* role before routing — the installed icon is only a hint.
    const fresh = await fetchLoginRole(data.user?.id);
    setBusy(false);
    const target = ctx.app || ctx.next
        ? resolvePostLoginTarget(ctx, fresh)
        : resolveRoleHome({
            signedIn: true,
            isOwner: fresh.isOwner,
            isAdmin: fresh.isAdmin,
            isStaffAny: fresh.isStaffAny,
          });
    logDeepLinkResolved({ requested: rawNext, target, stage: "after_signin" });
    nav(target, { replace: true });
  }

  async function magicLink() {
    if (!email.trim()) { setError("กรุณากรอกอีเมลก่อน"); return; }
    setBusy(true); setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: magicLinkRedirect(window.location.origin, ctx), shouldCreateUser: false },
    });
    setBusy(false);
    if (err) { setError("ส่งลิงก์เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่หรือใช้รหัสผ่าน"); return; }
    setSent(true);
  }

  return (
    <main className="min-h-[100dvh] grid place-items-center px-5 py-10 bg-gradient-to-b from-slate-50 to-white">
      <SeoHead title="พนักงานเข้าสู่ระบบ" description="เข้าสู่ระบบสำหรับพนักงานร้าน" path="/staff/login" />
      <form onSubmit={signIn} className="w-full max-w-sm rounded-2xl border bg-card p-6 space-y-4 shadow-sm">
        <header className="text-center space-y-1">
          <h1 className="text-xl font-bold">พนักงานเข้าสู่ระบบ</h1>
          <p className="text-xs text-muted-foreground">ใช้อีเมลที่เจ้าของกิจการสร้างให้</p>
        </header>

        <div className="space-y-1.5">
          <Label htmlFor="staff-email">อีเมล</Label>
          <Input id="staff-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required className="rounded-xl" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="staff-password">รหัสผ่าน</Label>
          <Input id="staff-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-xl" />
        </div>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {sent && <p className="text-sm text-emerald-600">ส่งลิงก์เข้าสู่ระบบไปที่อีเมลแล้ว กรุณาเปิดอีเมลเพื่อเข้าใช้งาน</p>}

        <Button type="submit" disabled={busy} className="w-full rounded-xl h-11" data-testid="staff-signin">
          {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LogIn className="w-4 h-4 mr-2" />} เข้าสู่ระบบ
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={magicLink} className="w-full rounded-xl h-11">
          <Mail className="w-4 h-4 mr-2" /> ส่งลิงก์เข้าสู่ระบบทางอีเมล
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          ลืมรหัสผ่าน? ติดต่อเจ้าของกิจการเพื่อตั้งรหัสใหม่
        </p>
        <div className="pt-2 border-t text-center">
          <a href="/admin/login" className="text-sm font-medium text-primary hover:underline" data-testid="staff-login-to-admin">
            เป็นแอดมิน? ไปหน้าเข้าสู่ระบบแอดมิน →
          </a>
        </div>
      </form>
    </main>
  );
}
import { useEffect, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, ShieldCheck, Sparkles, TrendingUp, ClipboardList, MessageCircle } from "lucide-react";
import SeoHead from "@/components/SeoHead";
import { friendlyError } from "@/lib/errors";
import logoAsset from "@/assets/nattaporn-logo.jpg.asset.json";
import { getHostMode } from "@/lib/hostMode";
import SignedInPanel from "@/components/auth/SignedInPanel";
import { resolveRoleHome } from "@/lib/roleHome";
import { lineErrorMessage, resetLineRetryCount, startLineLogin } from "@/lib/lineOauth";
import { sanitizeNext } from "@/lib/lineSession";


export default function Login() {
  const nav = useNavigate();
  const loc = useLocation();
  // ใช้ตัวกรองกลางตัวเดียวกับ LINE flow — ป้องกัน open-redirect และรองรับ query/hash ครบ
  const nextParam = sanitizeNext(new URLSearchParams(loc.search).get("next"));

  const { user, isStaff, loading: authLoading } = useAuth();
  const [email, setEmail] = useState(() => localStorage.getItem("lov.lastEmail") || "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [lineLoading, setLineLoading] = useState(false);
  const [lineError, setLineError] = useState("");

  /** ปุ่มหลักของลูกค้า — เข้าสู่ระบบด้วย LINE แล้วกลับมาที่หน้าเดิม (next) */
  async function onLineLogin() {
    setLineError("");
    setLineLoading(true);
    resetLineRetryCount();
    try {
      const next = sanitizeNext(nextParam || "") || "/shop";
      const authorizeUrl = await startLineLogin(next);
      window.location.assign(authorizeUrl);
    } catch (e) {
      setLineError(lineErrorMessage(String((e as Error)?.message || e)));
      setShowEmail(true);
      setLineLoading(false);
    }
  }

  const onAdminHost = getHostMode() === "admin";
  const adminParam = new URLSearchParams(loc.search).get("admin");
  const appParam = new URLSearchParams(loc.search).get("app");
  const onAdminLoginPath = loc.pathname.startsWith("/admin-login");
  // On the admin host, default to the admin login form so it "just works".
  // Allow ?admin=0 to opt back into the customer form for edge cases.
  const isAdminFlow =
    adminParam === "1" ||
    appParam === "admin" ||
    (onAdminHost && adminParam !== "0") ||
    (onAdminLoginPath && adminParam !== "0");

  // ถ้าเข้าหน้านี้ทั้งที่ล็อกอินอยู่แล้ว จะไม่เด้งอัตโนมัติ
  // แต่แสดงแผงให้ "ไปต่อตามบทบาท" หรือ "ออกจากระบบ" ชัดเจน (ดูด้านล่าง)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { toast.error(friendlyError(error, "เข้าสู่ระบบไม่สำเร็จ")); return; }
    // Admin-only allow-list check: only enforced on the ?admin=1 flow so that
    // non-admin staff (stock_staff/photo_staff) and existing email-based
    // customers can still sign in via the regular customer login. Role-based
    // route guards downstream handle authorization for staff/admin surfaces.
    if (isAdminFlow) {
      try {
        const { data: allowed, error: allowErr } = await supabase.rpc("is_admin_email", {
          _email: email.trim().toLowerCase(),
        });
        if (allowErr) throw allowErr;
        let ok = !!allowed;
        if (!ok && data.user?.id) {
          // พนักงาน (stock/photo) ที่ไม่ได้อยู่ใน allow-list แอดมิน ก็ควรเข้าลิงก์นี้ได้
          const { data: rows } = await supabase
            .from("user_roles").select("role").eq("user_id", data.user.id);
          ok = (rows ?? []).some((r: any) =>
            ["owner", "admin", "stock_staff", "photo_staff"].includes(r.role));
        }
        if (!ok) {
          await supabase.auth.signOut();
          toast.error("อีเมลนี้ไม่ได้รับสิทธิ์เข้าระบบพนักงาน/แอดมิน");
          return;
        }
      } catch (e: any) {
        await supabase.auth.signOut();
        toast.error(e?.message || "ตรวจสอบสิทธิ์ไม่สำเร็จ");
        return;
      }
    }
    // Keep the session and email on this device. Installed mobile PWAs emit
    // pagehide whenever they are backgrounded; clearing auth there caused the
    // home-screen app to ask for login again on every launch.
    localStorage.setItem("lov.lastEmail", email);
    localStorage.removeItem("lov.remember");
    // ลงทะเบียนเหตุการณ์เข้าสู่ระบบ (ไม่บล็อกหากล้มเหลว)
    supabase.functions.invoke("log-login").catch(() => {});
    const uid = data.user?.id;
    let rs: string[] = [];
    if (uid) {
      const { data: rows } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      rs = (rows ?? []).map((r: any) => r.role);
    }
    const isStaffAdmin = rs.some((r) => r === "admin" || r === "owner");
    const isStaffAny = isStaffAdmin || rs.some((r) => r === "stock_staff" || r === "photo_staff");
    // ปลายทางตามบทบาทจริงเสมอ (แหล่งเดียวคือ resolveRoleHome)
    const roleHome = resolveRoleHome({
      signedIn: true,
      isOwner: isStaffAdmin,
      isAdmin: isStaffAdmin,
      isStaffAny,
      isCustomer: true,
    });
    const dest = isAdminFlow
      ? roleHome
      : (nextParam || (isStaffAny ? roleHome : ((loc.state as any)?.from || roleHome)));
    nav(dest, { replace: true });
  }

  if (!authLoading && user) {
    return (
      <div className="min-h-screen bg-gradient-soft grid place-items-center p-4">
        <SeoHead
          title="เข้าสู่ระบบ — ร้านนัฐภรณ์ เชียงกลาง"
          description="เข้าสู่ระบบเพื่อใช้งานระบบร้านนัฐภรณ์ เชียงกลาง"
          path="/login"
        />
        <SignedInPanel email={user.email} uid={user.id} target={nextParam ?? undefined} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-soft grid place-items-center p-4 relative overflow-hidden">
      <SeoHead
        title="อัปเดตสินค้าและบริการ — ร้านนัฐภรณ์ เชียงกลาง"
        description="อัปเดตสินค้าและบริการแบบเรียลไทม์จากร้านนัฐภรณ์ เชียงกลาง เข้าสู่ระบบเพื่อสั่งซื้อและขอใบเสนอราคา"
        path="/login"
      />
      <div className="pointer-events-none absolute -top-32 -right-32 w-96 h-96 rounded-full bg-accent/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative w-full max-w-md">
        <Link to="/" className="inline-flex items-center text-sm text-muted-foreground mb-4 hover:text-foreground">
          <ArrowLeft className="w-4 h-4 mr-1" /> กลับหน้าหลัก
        </Link>

        {/* Store logo — top center */}
        <div className={`flex justify-center ${isAdminFlow ? "mb-3" : "mb-5"}`}>
          <div className="relative">
            <div className="absolute inset-0 -m-3 rounded-full bg-primary/10 blur-2xl" aria-hidden />
            <img
              src={logoAsset.url}
              alt="โลโก้ร้านนัฐภรณ์ เชียงกลาง"
              className={`relative rounded-full object-cover shadow-card ring-2 ring-primary/20 ${isAdminFlow ? "w-20 h-20" : "w-32 h-32 sm:w-36 sm:h-36"}`}
              loading="eager"
              decoding="async"
            />
          </div>
        </div>

        {/* Welcome / update copy — ฝั่งพนักงาน/แอดมินตัดข้อความการตลาดออกให้สั้น */}
        {isAdminFlow && (
          <h1 className="sr-only">เข้าสู่ระบบพนักงาน / แอดมิน — ร้านนัฐภรณ์ เชียงกลาง</h1>
        )}
        {!isAdminFlow && (
        <div className="text-center mb-5 space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-[11px] font-medium">
            <Sparkles className="w-3 h-3" /> อัปเดตแบบเรียลไทม์
          </div>
          <h1 className="text-xl sm:text-2xl font-bold leading-tight text-foreground">
            เข้าสู่ระบบ — ร้านนัฐภรณ์ เชียงกลาง
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            เข้าสู่ระบบเพื่ออัปเดตสินค้าและบริการของทางร้านแบบเรียลไทม์
          </p>
        </div>
        )}

        {/* Notice cards — price fluctuation + login rationale + quick quote */}
        {!isAdminFlow && (
        <div className="grid gap-2 mb-5">
          <div className="rounded-2xl border border-border bg-card/70 backdrop-blur p-3 flex gap-2.5 shadow-sm">
            <TrendingUp className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-foreground leading-relaxed">
              ช่วงนี้สินค้ามีการปรับราคา <span className="font-semibold">ขึ้น–ลง</span> ตามภาวะเศรษฐกิจและต้นทุนสินค้า
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card/70 backdrop-blur p-3 flex gap-2.5 shadow-sm">
            <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-foreground leading-relaxed">
              ทางร้านขออภัยที่ต้องให้เข้าสู่ระบบก่อน เพื่อให้การสั่งซื้อ การขอใบเสนอราคา และการประสานงานกับร้านถูกต้อง ไม่ผิดพลาด
            </p>
          </div>
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3 flex gap-2.5 shadow-sm">
            <ClipboardList className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-foreground leading-relaxed">
              หากต้องการความรวดเร็ว สามารถเลือกสินค้าที่ต้องการ แล้วส่งรายการให้ทางร้านตรวจสอบและใส่ราคาให้ได้ทันที
            </p>
          </div>
        </div>
        )}

        <div className="bg-card rounded-3xl p-6 sm:p-7 shadow-card border border-border">
          {!isAdminFlow && (
            <div className="mb-5">
              <h2 className="font-bold leading-tight text-base">เข้าสู่ระบบลูกค้า / หน่วยงาน</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                แนะนำให้ใช้ LINE — ระบบจะผูกประวัติคำสั่งซื้อและแจ้งสถานะให้ทาง LINE อัตโนมัติ
              </p>
              <Button
                type="button"
                onClick={onLineLogin}
                disabled={lineLoading}
                data-testid="login-line-primary"
                className="mt-4 w-full h-12 rounded-xl bg-[#06C755] text-white hover:bg-[#06C755]/90 shadow-soft text-base font-bold"
              >
                <MessageCircle className="w-5 h-5 mr-2" />
                {lineLoading ? "กำลังเปิด LINE..." : "เข้าสู่ระบบด้วย LINE"}
              </Button>
              {lineError && (
                <p role="alert" className="mt-2 text-xs text-destructive">{lineError}</p>
              )}
              <div className="mt-5 flex items-center gap-3">
                <span className="h-px flex-1 bg-border" aria-hidden />
                <span className="text-[11px] text-muted-foreground">หรือใช้อีเมล</span>
                <span className="h-px flex-1 bg-border" aria-hidden />
              </div>
              {!showEmail && (
                <button
                  type="button"
                  onClick={() => setShowEmail(true)}
                  data-testid="login-email-toggle"
                  className="mt-3 w-full text-xs text-muted-foreground hover:text-primary underline"
                >
                  เข้าสู่ระบบด้วยอีเมลและรหัสผ่าน
                </button>
              )}
            </div>
          )}
          {isAdminFlow && (
            <div className="mb-4">
              <h2 className="font-bold leading-tight text-base">เข้าสู่ระบบพนักงาน / แอดมิน</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                กรอกอีเมลและรหัสผ่าน แล้วกดยืนยัน — ระบบจะพาเข้าหน้างานของคุณทันที
              </p>
            </div>
          )}
          {(isAdminFlow || showEmail) && (

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label>อีเมล</Label>
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-xl mt-1" />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label>รหัสผ่าน</Label>
                <Link to="/forgot-password" className="text-xs text-primary hover:underline">ลืมรหัสผ่าน?</Link>
              </div>
              <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-xl mt-1" />
            </div>
            <Button type="submit" disabled={loading} className="w-full h-11 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 shadow-soft">
              {loading ? "กำลังเข้าสู่ระบบ..." : (isAdminFlow ? "ยืนยันเข้าสู่ระบบ" : "เข้าสู่ระบบ")}
            </Button>
          </form>
          )}

          <p className="mt-3 text-[11px] text-center text-muted-foreground leading-relaxed">
            การเข้าสู่ระบบถือว่ายอมรับ{" "}
            <Link to="/terms-of-use" className="underline hover:text-primary">เงื่อนไขการใช้งาน</Link>{" "}
            และ{" "}
            <Link to="/privacy-policy" className="underline hover:text-primary">นโยบายความเป็นส่วนตัว</Link>
          </p>
          {!isAdminFlow && (
            <p className="mt-4 text-sm text-center text-muted-foreground">
              ยังไม่มีบัญชี? <Link to="/signup" className="text-primary font-medium">สมัครสมาชิก/หน่วยงาน</Link>
            </p>
          )}
          {!onAdminHost && (
            <p className="mt-3 text-center">
              {isAdminFlow ? (
                <Link to="/login" className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1">
                  ← เข้าสู่ระบบลูกค้า
                </Link>
              ) : (
                <span className="inline-flex items-center gap-3">
                  <Link to="/admin/login" className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> เข้าสู่ระบบแอดมิน →
                  </Link>
                  <Link to="/staff/login" className="text-xs text-muted-foreground hover:text-primary">
                    เข้าสู่ระบบพนักงาน →
                  </Link>
                </span>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
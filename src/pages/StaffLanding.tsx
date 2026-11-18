import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LogIn, ShoppingCart, Boxes, LayoutDashboard, LogOut, Clock, ShieldAlert, Loader2, Copy, ExternalLink, PlugZap, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import SeoHead from "@/components/SeoHead";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import StaffPasswordLogin from "@/components/StaffPasswordLogin";
import { readLoginContext, resolvePostLoginTarget } from "@/lib/posLoginContext";

import {
  LINE_LOGIN_CHANNEL_ID as LOGIN_CHANNEL_ID,
  LINE_CONSOLE_URL,
  staffRedirectUri,
  describeLineAuthError,
  buildLineAuthorizeUrl,
  newProbeState,
  isProbeState,
  PROBE_RESULT_KEY,
  PROBE_CHANNEL,
} from "@/lib/lineCallbacks";
const OAUTH_STATE_KEY = "staff_line_oauth_state";

function newState() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function redirectUri() {
  return staffRedirectUri();
}

function startLineLogin() {
  const state = newState();
  sessionStorage.setItem(OAUTH_STATE_KEY, state);
  window.location.href = buildLineAuthorizeUrl({ redirectUri: redirectUri(), state });
}

type ProbeStatus = "idle" | "running" | "pass" | "fail";

/** Broadcast a successful probe back to the tab that opened this popup. */
function reportProbeSuccess() {
  const payload = JSON.stringify({ ok: true, at: Date.now() });
  try { localStorage.setItem(PROBE_RESULT_KEY, payload); } catch { /* ignore */ }
  try {
    const ch = new BroadcastChannel(PROBE_CHANNEL);
    ch.postMessage({ ok: true });
    ch.close();
  } catch { /* ignore */ }
}

export default function StaffLanding() {
  const nav = useNavigate();
  const { user, roles, isOwner, isAdmin, isStaffAny, hasPerm, signOut, loading: authLoading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ display_name?: string; picture_url?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [probe, setProbe] = useState<ProbeStatus>("idle");
  const [probeClosed, setProbeClosed] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Handle OAuth callback: ?code=...&state=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const errParam = params.get("error");

    // Probe round-trip: LINE accepted this domain's callback URL. Report the
    // result to the opener and close — never create a binding or a session.
    if (isProbeState(state) && (code || errParam)) {
      if (!errParam) reportProbeSuccess();
      window.history.replaceState({}, "", "/staff");
      setProbe(errParam ? "fail" : "pass");
      try { window.close(); } catch { /* ignore */ }
      return;
    }

    if (errParam) {
      setError(describeLineAuthError(errParam, params.get("error_description")));
      window.history.replaceState({}, "", "/staff");
      return;
    }
    if (!code || !state) return;

    const savedState = sessionStorage.getItem(OAUTH_STATE_KEY);
    if (savedState !== state) {
      setError("state ไม่ตรง กรุณาลองใหม่");
      window.history.replaceState({}, "", "/staff");
      return;
    }
    sessionStorage.removeItem(OAUTH_STATE_KEY);

    (async () => {
      setBusy(true);
      try {
        const { data, error: fnErr } = await supabase.functions.invoke("staff-line-login", {
          body: { code, redirect_uri: redirectUri() },
        });
        window.history.replaceState({}, "", "/staff");
        if (fnErr) throw fnErr;
        const res = data as any;
        if (res?.ok === false) throw new Error(res.detail || res.error);
        if (res?.status === "pending") {
          setPending({ display_name: res.display_name, picture_url: res.picture_url });
          return;
        }
        if (res?.status === "revoked") {
          setError("สิทธิ์เข้าใช้ระบบของคุณถูกเพิกถอน กรุณาติดต่อเจ้าของกิจการ");
          return;
        }
        if (res?.status === "not_staff") {
          setError("บัญชี LINE นี้ยังไม่ได้รับสิทธิ์พนักงาน กรุณาให้เจ้าของกิจการอนุมัติ");
          return;
        }
        if (res?.status !== "approved" || !res.token_hash) {
          throw new Error("unexpected response");
        }
        const { data: verifyData, error: verifyErr } = await supabase.auth.verifyOtp({
          type: "magiclink",
          token_hash: res.token_hash,
        });
        if (verifyErr) throw verifyErr;
        if (!verifyData.session || !verifyData.user) throw new Error("session_failed");
        toast.success("เข้าสู่ระบบสำเร็จ");
      } catch (e: any) {
        setError(e?.message || "เข้าสู่ระบบไม่สำเร็จ");
      } finally {
        setBusy(false);
      }
    })();
  }, []);

  // Once we have a staff session, land on the right workspace.
  useEffect(() => {
    if (authLoading || busy || !user) return;
    if (!isStaffAny) {
      toast.error("บัญชีนี้ไม่ใช่พนักงาน");
      signOut();
      return;
    }
    // A launch context (installed POS/staff icon) means the user already told
    // us where they wanted to go — honour it, capped by their real role.
    const ctx = readLoginContext(window.location.search);
    if (ctx.app || ctx.next) {
      nav(resolvePostLoginTarget(ctx, {
        isOwner, isAdmin, isStaffAny, canPos: hasPerm("pos"), canStock: hasPerm("stock"),
      }), { replace: true });
      return;
    }
    // Otherwise don't auto-navigate — show the shortcut hub so the user can pick.
  }, [authLoading, busy, user, isStaffAny, isOwner, isAdmin, hasPerm, nav, signOut]);

  const signedInAsStaff = !!user && isStaffAny;

  /** Open LINE's authorize page in a popup and watch for the round-trip. */
  function runCallbackProbe() {
    setProbe("running");
    setProbeClosed(false);
    const url = buildLineAuthorizeUrl({ redirectUri: redirectUri(), state: newProbeState() });
    try { localStorage.removeItem(PROBE_RESULT_KEY); } catch { /* ignore */ }

    const win = window.open(url, "line_callback_probe", "width=480,height=720");
    if (!win) {
      setProbe("fail");
      setProbeClosed(true);
      toast.error("เบราว์เซอร์บล็อกป๊อปอัป — กรุณาอนุญาตป๊อปอัปแล้วลองอีกครั้ง");
      return;
    }

    let done = false;
    let ch: BroadcastChannel | null = null;
    const finish = (status: ProbeStatus) => {
      if (done) return;
      done = true;
      clearInterval(iv);
      clearTimeout(to);
      try { ch?.close(); } catch { /* ignore */ }
      window.removeEventListener("storage", onStorage);
      setProbe(status);
      if (status === "pass") {
        toast.success("Callback URL ใช้งานได้แล้ว");
        try { win.close(); } catch { /* ignore */ }
      }
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key === PROBE_RESULT_KEY && e.newValue) finish("pass");
    };
    window.addEventListener("storage", onStorage);
    try {
      ch = new BroadcastChannel(PROBE_CHANNEL);
      ch.onmessage = (e) => { if ((e.data as any)?.ok) finish("pass"); };
    } catch { /* ignore */ }

    const iv = window.setInterval(() => {
      // Same-origin means LINE redirected back → callback URL is registered.
      try {
        if (win.location.href && win.location.origin === window.location.origin) {
          finish("pass");
          return;
        }
      } catch { /* cross-origin: still on access.line.me */ }
      try { localStorage.getItem(PROBE_RESULT_KEY) && finish("pass"); } catch { /* ignore */ }
      if (win.closed) { setProbeClosed(true); finish("fail"); }
    }, 700);

    const to = window.setTimeout(() => finish("fail"), 25_000);
  }

  const probeCard = (
    <Card className="p-4 space-y-3" data-testid="staff-callback-probe">
      <div className="flex items-start gap-3">
        <PlugZap className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="min-w-0">
          <div className="font-semibold text-sm">ทดสอบ Callback URL ของโดเมนนี้</div>
          <p className="text-xs text-muted-foreground mt-0.5">
            ตรวจว่า <code className="font-mono break-all">{redirectUri()}</code> ถูกลงทะเบียนใน
            LINE Developers Console (ช่อง {LOGIN_CHANNEL_ID}) แล้วหรือยัง — ระบบจะเปิดหน้าต่าง LINE
            ชั่วคราวและไม่สร้างบัญชีหรือเข้าสู่ระบบให้
          </p>
        </div>
      </div>

      {probe === "pass" && (
        <div className="flex items-center gap-2 text-sm text-success bg-success/10 rounded-lg p-2" data-testid="probe-pass">
          <CheckCircle2 className="w-4 h-4" /> Callback URL ใช้งานได้แล้ว — เข้าสู่ระบบด้วย LINE ได้เลย
        </div>
      )}
      {probe === "fail" && (
        <div className="space-y-2 text-sm bg-destructive/5 border border-destructive/30 rounded-lg p-2" data-testid="probe-fail">
          <div className="flex items-center gap-2 text-destructive">
            <XCircle className="w-4 h-4" />
            {probeClosed ? "ยังไม่พบการเด้งกลับ (หน้าต่างถูกปิด)" : "ยังไม่พบการเด้งกลับภายในเวลาที่กำหนด"}
          </div>
          <p className="text-xs text-foreground/80">
            ให้เจ้าของกิจการเพิ่ม URL ด้านล่างใน LINE Developers Console → LINE Login → Callback URL
            แล้วกดทดสอบอีกครั้ง
          </p>
          <code className="block text-xs font-mono break-all bg-muted rounded px-2 py-1">{redirectUri()}</code>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(redirectUri());
                  toast.success("คัดลอกแล้ว");
                } catch { toast.error("คัดลอกไม่ได้"); }
              }}
            >
              <Copy className="w-3 h-3 mr-1" /> คัดลอก URL
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <a href={LINE_CONSOLE_URL} target="_blank" rel="noreferrer">
                <ExternalLink className="w-3 h-3 mr-1" /> เปิด LINE Console
              </a>
            </Button>
          </div>
        </div>
      )}

      <Button
        variant="outline"
        size="sm"
        className="w-full"
        disabled={probe === "running"}
        onClick={runCallbackProbe}
        data-testid="probe-run"
      >
        {probe === "running" ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> กำลังทดสอบ...</>
        ) : (
          <><PlugZap className="w-4 h-4 mr-2" /> ทดสอบ Callback URL</>
        )}
      </Button>
    </Card>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SeoHead title="สำหรับพนักงาน · Natta Porn" description="เข้าสู่ระบบพนักงานด้วย LINE" path="/staff" />
      <div className="mx-auto max-w-2xl px-4 py-10 space-y-6">
        <header className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">สำหรับพนักงาน</h1>
          <p className="text-muted-foreground">กรอกอีเมลและรหัสผ่าน แล้วกดยืนยันเพื่อเข้าหน้างานได้ทันที</p>
        </header>

        {busy && (
          <Card className="p-6 text-center flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" /> กำลังตรวจสอบบัญชี...
          </Card>
        )}

        {!busy && error && (
          <Card className="p-5 border-destructive/40 bg-destructive/5" data-testid="staff-error">
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-destructive">เข้าสู่ระบบไม่สำเร็จ</div>
                <p className="text-sm mt-1 text-foreground/80">{error}</p>
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setError(null)}>ลองใหม่</Button>
            </div>
            <div className="mt-4 border-t pt-3 space-y-2">
              <div className="text-xs font-semibold">Callback URL ของโดเมนนี้ (สำหรับเจ้าของกิจการ)</div>
              <code className="block text-xs font-mono break-all bg-muted rounded px-2 py-1">
                {redirectUri()}
              </code>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(redirectUri());
                      toast.success("คัดลอกแล้ว");
                    } catch {
                      toast.error("คัดลอกไม่ได้");
                    }
                  }}
                >
                  <Copy className="w-3 h-3 mr-1" /> คัดลอก
                </Button>
                <Button size="sm" variant="ghost" asChild>
                  <a href={LINE_CONSOLE_URL} target="_blank" rel="noreferrer">
                    <ExternalLink className="w-3 h-3 mr-1" /> เปิด LINE Console (ช่อง {LOGIN_CHANNEL_ID})
                  </a>
                </Button>
              </div>
            </div>
          </Card>
        )}

        {!busy && !signedInAsStaff && !pending && showAdvanced && probeCard}

        {!busy && !error && pending && (
          <Card className="p-6 space-y-3" data-testid="staff-pending">
            <div className="flex items-center gap-3">
              {pending.picture_url && (
                <img src={pending.picture_url} alt="" className="w-12 h-12 rounded-full" />
              )}
              <div>
                <div className="font-semibold">{pending.display_name || "บัญชี LINE"}</div>
                <div className="text-xs text-muted-foreground">รหัสบัญชีถูกส่งไปให้เจ้าของกิจการแล้ว</div>
              </div>
            </div>
            <div className="flex items-start gap-2 text-sm bg-accent rounded-lg p-3">
              <Clock className="w-4 h-4 mt-0.5 text-primary shrink-0" />
              <p>
                <b>รอเจ้าของกิจการอนุมัติ</b> — กรุณาแจ้งเจ้าของว่าคุณเพิ่งกดล็อกอินด้วยบัญชี LINE นี้
                หลังจากอนุมัติแล้ว คุณจึงจะเข้าสู่ระบบได้
              </p>
            </div>
          </Card>
        )}

        {!busy && !error && !pending && !signedInAsStaff && (
          <>
            <StaffPasswordLogin />
            <div className="text-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAdvanced((v) => !v)}
                data-testid="staff-advanced-toggle"
              >
                {showAdvanced ? "ซ่อนตัวเลือกอื่น" : "ตัวเลือกอื่น (เข้าสู่ระบบด้วย LINE)"}
              </Button>
            </div>
            {showAdvanced && (
              <Card className="p-6 space-y-4 text-center">
                <p className="text-sm text-muted-foreground">
                  เฉพาะบัญชี LINE ที่เจ้าของกิจการอนุมัติแล้วเท่านั้นจึงจะเข้าสู่ระบบได้
                </p>
                <Button
                  onClick={startLineLogin}
                  className="w-full h-12 bg-[#06C755] hover:bg-[#05a648] text-white font-semibold"
                  data-testid="staff-line-login"
                >
                  <LogIn className="w-5 h-5 mr-2" /> เข้าสู่ระบบด้วย LINE
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  ยังไม่มีสิทธิ์? กดล็อกอินหนึ่งครั้งเพื่อขออนุมัติจากเจ้าของกิจการ
                </p>
              </Card>
            )}
          </>
        )}

        {!busy && signedInAsStaff && (
          <>
            <Card className="p-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground">ล็อกอินในนาม</div>
                <div className="font-semibold">{user!.email}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  บทบาท: {roles.join(", ") || "-"}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={signOut}>
                <LogOut className="w-4 h-4 mr-1" /> ออกจากระบบ
              </Button>
            </Card>

            <section className="grid grid-cols-2 gap-3" data-testid="staff-shortcuts">
              <Link to="/pos" data-testid="shortcut-/pos">
                <Card className="h-full p-4 border-2 border-primary/20 hover:border-primary transition-all">
                  <ShoppingCart className="w-8 h-8 text-primary mb-2" />
                  <div className="font-semibold">POS ขายหน้าร้าน</div>
                  <div className="text-xs text-muted-foreground mt-1">สแกน / ขาย / พิมพ์ใบเสร็จ</div>
                </Card>
              </Link>
              <Link to="/pos/staff" data-testid="shortcut-/pos/staff">
                <Card className="h-full p-4 border-2 border-primary/20 hover:border-primary transition-all">
                  <Boxes className="w-8 h-8 text-primary mb-2" />
                  <div className="font-semibold">Staff Hub</div>
                  <div className="text-xs text-muted-foreground mt-1">สต๊อก / เพิ่มสินค้า / ถ่ายรูป</div>
                </Card>
              </Link>
              {(isOwner || isAdmin) && (
                <Link to="/admin/home" data-testid="shortcut-/admin/home" className="col-span-2">
                  <Card className="h-full p-4 border-2 border-primary/20 hover:border-primary transition-all">
                    <LayoutDashboard className="w-8 h-8 text-primary mb-2" />
                    <div className="font-semibold">หน้าหลักแอดมิน</div>
                    <div className="text-xs text-muted-foreground mt-1">ภาพรวม รายงาน จัดการระบบ</div>
                  </Card>
                </Link>
              )}
              {isOwner && (
                <Link to="/admin/staff-line" data-testid="shortcut-/admin/staff-line" className="col-span-2">
                  <Card className="h-full p-4 border-2 border-primary/30 bg-primary/5">
                    <ShieldAlert className="w-8 h-8 text-primary mb-2" />
                    <div className="font-semibold">อนุมัติพนักงาน LINE</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      จัดการคำขอเข้าใช้งานของพนักงานใหม่
                    </div>
                  </Card>
                </Link>
              )}
            </section>

            <div className="text-center">
              <Button variant="ghost" size="sm" onClick={() => nav("/pos")}>ไปหน้า POS →</Button>
            </div>
          </>
        )}

        <footer className="text-center text-xs text-muted-foreground pt-4">
          ลิงก์นี้สำหรับพนักงานเท่านั้น · การเข้าสู่ระบบต้องได้รับอนุมัติจากเจ้าของกิจการ
        </footer>
      </div>
    </div>
  );
}
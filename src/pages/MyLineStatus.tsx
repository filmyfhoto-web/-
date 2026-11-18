import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, XCircle, AlertTriangle, Loader2, RefreshCw, LogOut, MessageCircle, ChevronLeft, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import SeoHead from "@/components/SeoHead";
import { readIdToken, clearIdToken, clearCustomerSession, relativeTimeTH } from "@/lib/lineSession";
import { friendStatusLabel, type FriendStatus, maskLineUserId } from "@/lib/lineFriend";

type LookupResult = {
  bound: boolean;
  phone?: string | null;
  display_name?: string | null;
  customer_name?: string | null;
  customer_source?: string | null;
  friend_confirmed?: boolean;
  friend_status?: FriendStatus;
  verified_at?: string | null;
};

function readLiffProfile(): { userId?: string; displayName?: string; pictureUrl?: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem("liff_profile");
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

type Tone = "pending" | "ok" | "warn" | "err";
function toneClasses(t: Tone) {
  if (t === "ok") return { bar: "bg-emerald-500", chip: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: <CheckCircle2 className="w-5 h-5 text-emerald-600" /> };
  if (t === "warn") return { bar: "bg-amber-500", chip: "bg-amber-100 text-amber-800 border-amber-200", icon: <XCircle className="w-5 h-5 text-amber-600" /> };
  if (t === "err") return { bar: "bg-rose-500", chip: "bg-rose-100 text-rose-800 border-rose-200", icon: <AlertTriangle className="w-5 h-5 text-rose-600" /> };
  return { bar: "bg-slate-300", chip: "bg-slate-100 text-slate-700 border-slate-200", icon: <HelpCircle className="w-5 h-5 text-slate-400" /> };
}

function StatusCard({
  step, title, subtitle, tone, children,
}: { step: number; title: string; subtitle?: string; tone: Tone; children?: React.ReactNode }) {
  const t = toneClasses(tone);
  return (
    <div className="relative bg-white/85 backdrop-blur border border-[hsl(28_60%_88%)] rounded-2xl p-4 shadow-sm">
      <div className={`absolute left-0 top-3 bottom-3 w-1 rounded-r-full ${t.bar}`} />
      <div className="flex items-start gap-3 pl-2">
        <div className="w-8 h-8 rounded-full bg-white border border-[hsl(28_60%_88%)] grid place-items-center shrink-0">
          {t.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">ขั้นที่ {step}</div>
          <div className="font-semibold text-foreground">{title}</div>
          {subtitle ? <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div> : null}
          {children ? <div className="mt-2">{children}</div> : null}
        </div>
      </div>
    </div>
  );
}

export default function MyLineStatus() {
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [errorKind, setErrorKind] = useState<null | "network" | "unauthorized">(null);
  const [addFriendUrl, setAddFriendUrl] = useState<string | null>(null);

  const profile = useMemo(() => readLiffProfile(), []);
  const idToken = useMemo(() => readIdToken(), []);

  const runLookup = useCallback(async () => {
    setChecking(true);
    setErrorKind(null);
    try {
      const id_token = readIdToken();
      if (!id_token) {
        const { data: s } = await supabase.auth.getSession();
        if (!s?.session) {
          setResult({ bound: false, friend_status: "unknown" });
          return;
        }
      }
      const body = id_token ? { id_token } : {};
      const { data, error } = await supabase.functions.invoke("line-link-lookup", { body });
      if (error) {
        const status = (error as any)?.context?.response?.status ?? (error as any)?.status ?? null;
        if (status === 401 || status === 403) {
          if (id_token) clearIdToken();
          setErrorKind("unauthorized");
          setResult({ bound: false, friend_status: "unknown" });
          return;
        }
        setErrorKind("network");
        return;
      }
      setResult((data || { bound: false }) as LookupResult);
    } catch {
      setErrorKind("network");
    } finally {
      setChecking(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void runLookup();
    // load add-friend url in parallel
    (async () => {
      try {
        const { data } = await supabase.rpc("get_public_settings");
        const row: any = Array.isArray(data) ? data[0] : data;
        setAddFriendUrl(row?.line_add_friend_url || row?.line_url || null);
      } catch { /* ignore */ }
    })();
  }, [runLookup]);

  const hasLineLogin = !!(idToken || profile?.userId);
  const bound = !!result?.bound;
  const friendStatus: FriendStatus = (result?.friend_status as FriendStatus) || "unknown";
  const friendConfirmed = result?.friend_confirmed === true;

  // Auto-refresh every 30s after bind succeeds, until friendship is confirmed.
  // Pauses when tab is hidden to avoid unnecessary calls.
  useEffect(() => {
    if (!bound || friendConfirmed) return;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void runLookup();
    };
    const id = window.setInterval(tick, 30_000);
    const onVis = () => {
      if (document.visibilityState === "visible") void runLookup();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [bound, friendConfirmed, runLookup]);

  const loginTone: Tone = hasLineLogin ? "ok" : "pending";
  const bindTone: Tone = bound ? "ok" : (hasLineLogin ? "warn" : "pending");
  const friendTone: Tone =
    !bound ? "pending" :
    friendConfirmed ? "ok" :
    friendStatus === "not_friend" ? "warn" :
    friendStatus === "config_missing" ? "err" : "err";

  const allGood = hasLineLogin && bound && friendConfirmed;

  return (
    <main className="min-h-screen px-5 py-6 relative overflow-hidden bg-gradient-to-b from-[hsl(30_80%_97%)] via-[hsl(35_60%_96%)] to-white">
      <SeoHead
        title="สถานะการเข้าสู่ระบบและเพิ่มเพื่อน LINE ของฉัน"
        description="ดูสถานะการเข้าสู่ระบบ LINE การผูกกับร้าน และการเพิ่มเพื่อน OA"
        path="/me/line-status"
      />
      <div className="pointer-events-none absolute -top-32 -right-24 w-96 h-96 rounded-full bg-[hsl(28_95%_60%_/_0.18)] blur-3xl" />

      <div className="relative max-w-md mx-auto">
        <div className="mb-3 flex items-center justify-between">
          <Link to="/shop" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="w-4 h-4" /> ย้อนกลับ
          </Link>
          {hasLineLogin ? (
            <button
              onClick={() => { clearCustomerSession(); window.location.assign("/"); }}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              type="button"
            >
              <LogOut className="w-3.5 h-3.5" /> ออกจากระบบ
            </button>
          ) : null}
        </div>

        <div className="text-center mb-5">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">สถานะการเชื่อมต่อ LINE ของฉัน</h1>
          <p className="text-sm text-muted-foreground mt-1">
            ตรวจการเข้าสู่ระบบ LINE การผูกกับร้าน และการเพิ่มเพื่อน OA
          </p>
        </div>

        {loading ? (
          <div className="text-center py-10 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> กำลังตรวจสอบ...
          </div>
        ) : (
          <div className="space-y-3">
            <StatusCard
              step={1}
              title="เข้าสู่ระบบ LINE"
              tone={loginTone}
              subtitle={hasLineLogin
                ? (profile?.displayName ? `${profile.displayName}` : "เข้าสู่ระบบแล้ว")
                : "ยังไม่ได้เข้าสู่ระบบ LINE"}
            >
              {profile?.userId ? (
                <div className="text-[11px] text-slate-500 font-mono" title={profile.userId}>
                  {maskLineUserId(profile.userId)}
                </div>
              ) : null}
            </StatusCard>

            <StatusCard
              step={2}
              title="ผูกกับร้าน"
              tone={bindTone}
              subtitle={bound
                ? `ผูกแล้ว${result?.customer_name ? ` · ${result.customer_name}` : ""}${result?.phone ? ` · ${result.phone}` : ""}`
                : (hasLineLogin ? "ยังไม่พบการผูกกับร้าน — โปรดกดเข้าสู่ระบบใหม่" : "รอการเข้าสู่ระบบ")}
            >
              {result?.verified_at ? (
                <div className="text-[11px] text-muted-foreground">ยืนยันเมื่อ {relativeTimeTH(result.verified_at)}</div>
              ) : null}
            </StatusCard>

            <StatusCard
              step={3}
              title="เพิ่มเพื่อน LINE ของร้าน"
              tone={friendTone}
              subtitle={
                !bound ? "รอการผูกกับร้าน" :
                friendConfirmed ? "ยืนยันแล้วว่าเป็นเพื่อนกับ OA" :
                friendStatus === "not_friend" ? "ยังไม่ได้เพิ่มเพื่อน — โปรดกดปุ่มด้านล่าง" :
                friendStatus === "config_missing" ? "ระบบยังไม่พร้อมตรวจสถานะเพื่อน — กรุณาติดต่อร้าน" :
                "ตรวจสถานะเพื่อนไม่ได้ในขณะนี้"
              }
            >
              <div className="text-[11px] text-muted-foreground">สถานะ: {friendStatusLabel(friendStatus)}</div>
            </StatusCard>
          </div>
        )}

        {errorKind === "network" ? (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 text-rose-800 px-3 py-2 text-xs">
            <AlertTriangle className="w-4 h-4" />
            เชื่อมต่อไม่สำเร็จ กรุณาตรวจสัญญาณอินเทอร์เน็ตแล้วลองใหม่
          </div>
        ) : null}

        <div className="mt-4 grid gap-2">
          <Button
            onClick={() => void runLookup()}
            disabled={checking}
            variant="outline"
            className="w-full h-12 rounded-xl text-base font-semibold"
          >
            {checking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            ลองใหม่ / ตรวจสอบอีกครั้ง
          </Button>

          {bound && !friendConfirmed ? (
            addFriendUrl ? (
              <a
                href={addFriendUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full h-12 rounded-xl bg-[#06C755] hover:bg-[#05b34c] text-white text-base font-bold shadow-md"
              >
                <MessageCircle className="w-5 h-5" /> เปิดลิงก์เพิ่มเพื่อน OA
              </a>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-muted/40 px-3 py-3 text-xs text-muted-foreground text-center">
                ยังไม่ได้ตั้งค่าลิงก์เพิ่มเพื่อน — กรุณาติดต่อร้าน
              </div>
            )
          ) : null}

          {!hasLineLogin || errorKind === "unauthorized" ? (
            <Button asChild className="w-full h-12 rounded-xl text-base font-bold">
              <Link to="/shop">
                <MessageCircle className="w-5 h-5 mr-2" /> กลับหน้าร้าน
              </Link>
            </Button>
          ) : null}

          {allGood ? (
            <Button asChild className="w-full h-12 rounded-xl text-base font-semibold">
              <Link to="/shop">ไปที่หน้าสินค้า</Link>
            </Button>
          ) : null}
        </div>

        <p className="text-[11px] text-center text-muted-foreground mt-5">
          หากยังพบปัญหา โปรดติดต่อร้านผ่าน LINE โดยตรง
        </p>
      </div>
    </main>
  );
}
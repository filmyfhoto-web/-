import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertTriangle, BellRing, CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import InstallAppCard from "@/components/InstallAppCard";
import { PWA_APPS, applyPwaManifest, type PwaApp } from "@/lib/pwaManifest";
import { enablePush, getPushState, pushSupported, type PushState } from "@/film-shop/lib/webPush";
import { toast } from "sonner";

const MESSAGES: Record<string, string> = {
  invalid_token: "ลิงก์ไม่ถูกต้อง (โปรดใช้ลิงก์จริงจากหน้า “ลิงก์แชร์ FS” ไม่ใช่ตัวอย่าง <token>)",
  not_found: "ไม่พบลิงก์นี้ในระบบ",
  revoked: "ลิงก์นี้ถูกยกเลิกแล้ว",
  expired: "ลิงก์นี้หมดอายุแล้ว",
  user_missing: "บัญชีปลายทางของลิงก์ถูกลบไปแล้ว",
  generate_failed: "สร้างเซสชันไม่สำเร็จ",
  lookup_failed: "ตรวจสอบลิงก์ไม่สำเร็จ",
  unexpected: "เกิดข้อผิดพลาดที่ไม่คาดคิด",
};

const APPS: PwaApp[] = ["admin", "staff", "pos", "receipts", "film-shop", "customer"];

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

/**
 * เปิดเว็บแอปจากลิงก์แชร์ได้ทันทีโดยไม่ต้องล็อกอิน
 * รองรับ `?app=admin` เพื่อให้ติดตั้งเป็นเว็บแอป “ผู้ดูแลระบบ” และเปิดแจ้งเตือนในแอปได้เลย
 */
export default function FsShareEntry() {
  const { token = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [push, setPush] = useState<PushState>("off");
  const ran = useRef(false);

  const app: PwaApp = useMemo(() => {
    const q = params.get("app");
    return (APPS as string[]).includes(q ?? "") ? (q as PwaApp) : "admin";
  }, [params]);

  const target = `${PWA_APPS[app].startPath}?app=${app}`;

  // ให้หน้านี้ประกาศ manifest ของแอปปลายทาง — กด “ติดตั้ง” จากลิงก์แชร์ได้ทันที
  useEffect(() => { applyPwaManifest(app); }, [app]);

  const go = useCallback(() => navigate(target, { replace: true }), [navigate, target]);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      const clean = decodeURIComponent(token).trim();
      if (!clean || clean.startsWith("<")) { setError(MESSAGES.invalid_token); return; }
      try {
        const { data, error: fnErr } = await supabase.functions.invoke("fs-share-open", {
          body: { token: clean },
        });
        const code = (data as any)?.error;
        if (fnErr || code) {
          setError(MESSAGES[code] ?? "เปิดลิงก์ไม่สำเร็จ");
          return;
        }
        const { error: otpErr } = await supabase.auth.verifyOtp({
          type: "magiclink",
          token_hash: (data as any).token_hash,
        });
        if (otpErr) {
          setError("เข้าสู่ระบบด้วยลิงก์ไม่สำเร็จ: " + otpErr.message);
          return;
        }
        if (pushSupported()) setPush(await getPushState());
        setReady(true);
        // ติดตั้งแล้ว (เปิดจากไอคอนหน้าจอโฮม) → เข้าใช้งานทันที
        if (isStandalone()) navigate(target, { replace: true });
      } catch (e: any) {
        setError(e?.message ?? "เปิดลิงก์ไม่สำเร็จ");
      }
    })();
  }, [token, navigate, target]);

  async function turnOnPush() {
    try {
      const s = await enablePush({ app });
      setPush(s);
      if (s === "on") toast.success("เปิดแจ้งเตือนในแอปแล้ว");
      else if (s === "denied") toast.error("เบราว์เซอร์ปิดสิทธิ์แจ้งเตือนไว้");
      else toast.error("เปิดแจ้งเตือนไม่สำเร็จ");
    } catch (e: any) {
      toast.error(e?.message ?? "เปิดแจ้งเตือนไม่สำเร็จ");
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="text-center space-y-4 max-w-sm w-full">
        {error ? (
          <>
            <AlertTriangle className="w-8 h-8 mx-auto text-destructive" />
            <h1 className="text-lg font-semibold">เปิดลิงก์ไม่สำเร็จ</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" onClick={() => navigate("/login")}>เข้าสู่ระบบตามปกติ</Button>
          </>
        ) : ready ? (
          <>
            <CheckCircle2 className="w-8 h-8 mx-auto text-primary" />
            <h1 className="text-lg font-semibold">พร้อมใช้งาน — {PWA_APPS[app].label}</h1>
            <p className="text-sm text-muted-foreground">
              ติดตั้งเป็นเว็บแอปบนหน้าจอโฮม และเปิดแจ้งเตือนในแอป แล้วเริ่มใช้งานได้เลย
            </p>
            <div className="flex flex-col gap-2">
              <InstallAppCard app={app} className="text-left" />
              <Button
                variant={push === "on" ? "secondary" : "outline"}
                className="rounded-xl"
                onClick={turnOnPush}
                disabled={push === "on" || !pushSupported()}
                data-testid="fs-share-enable-push"
              >
                <BellRing className="w-4 h-4 mr-1" />
                {push === "on" ? "เปิดแจ้งเตือนแล้ว" : "เปิดแจ้งเตือนในแอป"}
              </Button>
              <Button className="rounded-xl" onClick={go} data-testid="fs-share-continue">
                เข้าใช้งานเลย <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </>
        ) : (
          <>
            <Loader2 className="w-8 h-8 mx-auto animate-spin text-primary" />
            <h1 className="text-lg font-semibold">กำลังเปิดเว็บแอป…</h1>
            <p className="text-sm text-muted-foreground">กำลังตรวจสอบลิงก์แชร์ กรุณารอสักครู่</p>
          </>
        )}
      </div>
    </main>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Download, CheckCircle2, XCircle, HelpCircle, Smartphone } from "lucide-react";
import { toast } from "sonner";
import InstallGuideDialog, { isInAppBrowser, detectPlatform } from "@/components/InstallGuideDialog";
import { PWA_APPS, isInstallableApp, currentPwaApp, type PwaApp } from "@/lib/pwaManifest";
import { logPwa, markInstallPromptSeen } from "@/lib/pwaDiagnostics";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type InstallStatus = "installed" | "ready" | "manual" | "blocked";

function standalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

/** เหตุผลที่ติดตั้งไม่ได้ (ถ้ามี) — ใช้บอกผู้ใช้ให้แก้ได้เอง */
export function installBlockReason(ua: string, secure: boolean, installable: boolean): string | null {
  if (!installable) return "หน้านี้ไม่ได้เปิดให้ติดตั้งเป็นเว็บแอป";
  if (!secure) return "ต้องเปิดผ่าน https จึงจะติดตั้งได้";
  if (isInAppBrowser(ua)) return "เบราว์เซอร์ในแอป LINE/Facebook ติดตั้งไม่ได้ ให้กด ⋯ แล้วเลือก “เปิดในเบราว์เซอร์”";
  return null;
}

const STATUS_TEXT: Record<InstallStatus, string> = {
  installed: "ติดตั้งแล้ว",
  ready: "พร้อมติดตั้ง",
  manual: "ติดตั้งด้วยตนเอง",
  blocked: "ติดตั้งไม่ได้",
};

/**
 * การ์ดติดตั้งเว็บแอป พร้อมสถานะ “ติดตั้งแล้ว / ติดตั้งไม่ได้”
 * และปุ่มติดตั้งที่กดได้ทันที (Chrome/Android/Desktop) หรือคำแนะนำทีละขั้น (iOS)
 */
export default function InstallAppCard({
  app,
  className,
}: {
  app?: PwaApp;
  className?: string;
}) {
  const resolved: PwaApp = app ?? currentPwaApp();
  const cfg = PWA_APPS[resolved];
  const installable = isInstallableApp(resolved);
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const secure = typeof window === "undefined" ? true : window.isSecureContext !== false;

  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState<boolean>(standalone());
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    if (!installable) return;
    const onBIP = (e: Event) => {
      e.preventDefault();
      markInstallPromptSeen();
      logPwa("info", "beforeinstallprompt", resolved);
      setDeferred(e as BIPEvent);
    };
    const onInstalled = () => {
      logPwa("info", "appinstalled", resolved);
      setInstalled(true);
      setDeferred(null);
      toast.success(`ติดตั้ง${cfg.label}แล้ว`);
    };
    window.addEventListener("beforeinstallprompt", onBIP as any);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP as any);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [resolved, installable, cfg.label]);

  const blocked = useMemo(() => installBlockReason(ua, secure, installable), [ua, secure, installable]);

  const status: InstallStatus = installed
    ? "installed"
    : blocked
      ? "blocked"
      : deferred
        ? "ready"
        : "manual";

  const hint =
    status === "installed"
      ? "เปิดใช้งานได้จากไอคอนบนหน้าจอโฮมได้เลย"
      : status === "ready"
        ? "กด “ติดตั้งเว็บแอป” แล้วยืนยันในกล่องของเบราว์เซอร์"
        : status === "blocked"
          ? blocked!
          : detectPlatform(ua) === "ios"
            ? "บน iPhone ให้กดปุ่มแชร์ใน Safari แล้วเลือก “เพิ่มที่หน้าจอโฮม”"
            : "เบราว์เซอร์ยังไม่เสนอให้ติดตั้ง — กด “วิธีติดตั้ง” เพื่อทำตามขั้นตอน";

  const doInstall = useCallback(async () => {
    if (deferred) {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      logPwa(outcome === "accepted" ? "info" : "warn", `install_${outcome}`, resolved);
      if (outcome === "accepted") {
        setDeferred(null);
        setInstalled(true);
      } else {
        toast.message("ยังไม่ได้ติดตั้ง — กดใหม่ได้ทุกเมื่อ");
      }
      return;
    }
    setGuideOpen(true);
  }, [deferred, resolved]);

  return (
    <Card className={className} data-testid="install-app-card">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Smartphone className="w-5 h-5 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="font-semibold truncate">ติดตั้ง{cfg.label}</p>
              <p className="text-xs text-muted-foreground">{cfg.startPath}</p>
            </div>
          </div>
          <Badge
            variant={status === "installed" ? "default" : status === "blocked" ? "destructive" : "secondary"}
            className="shrink-0"
            data-testid="install-app-status"
          >
            {status === "installed" ? (
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
            ) : status === "blocked" ? (
              <XCircle className="w-3.5 h-3.5 mr-1" />
            ) : (
              <Download className="w-3.5 h-3.5 mr-1" />
            )}
            {STATUS_TEXT[status]}
          </Badge>
        </div>

        <p className="text-sm text-muted-foreground">{hint}</p>

        <div className="flex flex-wrap gap-2">
          <Button
            className="rounded-xl"
            onClick={doInstall}
            disabled={status === "installed" || status === "blocked"}
            data-testid="install-app-button"
          >
            <Download className="w-4 h-4 mr-1" />
            {status === "installed" ? "ติดตั้งแล้ว" : "ติดตั้งเว็บแอป"}
          </Button>
          <Button variant="outline" className="rounded-xl" onClick={() => setGuideOpen(true)} data-testid="install-app-guide">
            <HelpCircle className="w-4 h-4 mr-1" />
            วิธีติดตั้ง
          </Button>
        </div>

        <InstallGuideDialog
          open={guideOpen}
          onOpenChange={setGuideOpen}
          url={typeof window !== "undefined" ? window.location.href : ""}
          label={cfg.label}
          deferredPrompt={deferred}
          onInstalled={() => setInstalled(true)}
        />
      </CardContent>
    </Card>
  );
}

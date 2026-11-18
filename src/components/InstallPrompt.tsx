import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Download, Share } from "lucide-react";
import { currentPwaApp, PWA_APPS, isInstallableApp } from "@/lib/pwaManifest";
import { logPwa, markInstallPromptSeen, checkPwaHealth, isStandaloneDisplay } from "@/lib/pwaDiagnostics";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as any).standalone === true
  );
}

function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream;
}

/** LINE / Facebook in-app browsers can't install — user must open in Safari/Chrome. */
function isInAppBrowser() {
  if (typeof navigator === "undefined") return false;
  return /\bLine\/|FBAN|FBAV|Instagram|Messenger/i.test(navigator.userAgent);
}

export default function InstallPrompt({ compact = false }: { compact?: boolean }) {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState<boolean>(isStandalone());
  const [showIOS, setShowIOS] = useState(false);
  const app = currentPwaApp();
  const appLabel = PWA_APPS[app].label;
  const installable = isInstallableApp(app);

  useEffect(() => {
    // Customer storefront is not installable: never listen, never prompt.
    if (!installable) return;
    let promptFired = false;
    const onBIP = (e: Event) => {
      e.preventDefault();
      promptFired = true;
      markInstallPromptSeen();
      logPwa("info", "beforeinstallprompt", app);
      setDeferred(e as BIPEvent);
    };
    const onInstalled = () => {
      logPwa("info", "appinstalled", app);
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onBIP as any);
    window.addEventListener("appinstalled", onInstalled);

    // If the browser never offers an install prompt, find out why once.
    const timer = window.setTimeout(() => {
      if (promptFired || isStandaloneDisplay()) return;
      void checkPwaHealth().then((h) => {
        if (!h.blockers.length) {
          logPwa("warn", "no_install_prompt", "เบราว์เซอร์ไม่เสนอให้ติดตั้ง (อาจติดตั้งแล้ว หรือ iOS/Safari)");
        }
      });
    }, 4000);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onBIP as any);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [app, installable]);

  if (!installable) return null;
  if (installed) return null;

  // Android/Desktop Chrome path
  if (deferred) {
    return (
      <Button
        size={compact ? "sm" : "default"}
        variant="outline"
        className="rounded-xl"
        onClick={async () => {
          await deferred.prompt();
          const choice = await deferred.userChoice;
          logPwa(choice.outcome === "accepted" ? "info" : "warn", `install_${choice.outcome}`, app);
          if (choice.outcome === "accepted") setDeferred(null);
        }}
      >
        <Download className="w-4 h-4 mr-1" />
        {compact ? "ติดตั้ง" : `ติดตั้ง${appLabel}`}
      </Button>
    );
  }

  // Everything else (iOS Safari, LINE in-app browser, desktop browsers that
  // haven't fired beforeinstallprompt yet) → manual instructions.
  return (
      <>
        <Button size={compact ? "sm" : "default"} variant="outline" className="rounded-xl" onClick={() => setShowIOS(true)}>
          <Download className="w-4 h-4 mr-1" />
          {compact ? "ติดตั้ง" : `ติดตั้ง${appLabel}`}
        </Button>
        <Dialog open={showIOS} onOpenChange={setShowIOS}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Share className="w-5 h-5" /> ติดตั้ง{appLabel}</DialogTitle>
              <DialogDescription>
                เปิดหน้า <b>{PWA_APPS[app].startPath}</b> ด้วย Safari (iPhone) หรือ Chrome (Android) แล้วทำตามขั้นตอน
              </DialogDescription>
            </DialogHeader>
            <ol className="space-y-2 text-sm leading-relaxed list-decimal pl-5">
              {isInAppBrowser() && (
                <li>ถ้าเปิดจากแอป LINE ให้กด <b>⋯</b> มุมขวาบน แล้วเลือก <b>“เปิดในเบราว์เซอร์”</b> ก่อน</li>
              )}
              {isIOS() ? (
                <>
                  <li>กดปุ่ม <b>แชร์</b> (รูปสี่เหลี่ยมมีลูกศรขึ้น) ที่ด้านล่างของ Safari</li>
                  <li>เลื่อนหา <b>“เพิ่มที่หน้าจอโฮม”</b> (Add to Home Screen)</li>
                  <li>กด <b>เพิ่ม</b> มุมบนขวา ไอคอนจะไปอยู่ที่หน้าโฮมเหมือนแอปจริง</li>
                </>
              ) : (
                <>
                  <li>กดเมนู <b>⋮</b> มุมขวาบนของ Chrome</li>
                  <li>เลือก <b>“ติดตั้งแอป”</b> หรือ <b>“เพิ่มลงในหน้าจอหลัก”</b></li>
                  <li>กด <b>ติดตั้ง</b> ไอคอนจะไปอยู่ที่หน้าโฮมเหมือนแอปจริง</li>
                </>
              )}
              <li className="text-muted-foreground">แอปลูกค้า / พนักงาน / แอดมิน ติดตั้งแยกกันได้ ต้องเปิดจากลิงก์ของแต่ละส่วน</li>
            </ol>
          </DialogContent>
        </Dialog>
      </>
  );
}

/** Small green dot indicating Realtime is connected. */
export function LiveDot({ live, label = "Live" }: { live: boolean; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
      <span className={`relative inline-block w-2 h-2 rounded-full ${live ? "bg-emerald-500" : "bg-muted-foreground/40"}`}>
        {live && <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-60" />}
      </span>
      {label}
    </span>
  );
}
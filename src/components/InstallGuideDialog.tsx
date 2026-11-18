import { useEffect, useMemo, useState } from "react";
import { Apple, Chrome, Copy, ExternalLink, Info, Share, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { copyToClipboard } from "@/lib/productLink";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export type Platform = "ios" | "android" | "desktop";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** Which install guide fits this user agent. */
export function detectPlatform(ua: string): Platform {
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  return "desktop";
}

/** LINE / Facebook in-app browsers cannot install a web app. */
export function isInAppBrowser(ua: string): boolean {
  return /\bLine\/|FBAN|FBAV|Instagram|Messenger/i.test(ua);
}

export const INSTALL_STEPS: Record<Platform, string[]> = {
  ios: [
    "เปิดลิงก์นี้ด้วย Safari (ไม่ใช่ในแอป LINE)",
    "แตะปุ่มแชร์ที่แถบล่างของ Safari",
    "เลื่อนหาแล้วเลือก “เพิ่มไปยังหน้าจอโฮม”",
    "ตั้งชื่อทางลัด แล้วแตะ “เพิ่ม” — จะได้ไอคอนแยกของแอปนี้",
  ],
  android: [
    "เปิดลิงก์นี้ด้วย Chrome (ไม่ใช่ในแอป LINE)",
    "แตะเมนู ⋮ มุมขวาบน",
    "เลือก “ติดตั้งแอป” หรือ “เพิ่มไปยังหน้าจอหลัก”",
    "ยืนยัน “ติดตั้ง” — จะได้ไอคอนแยกของแอปนี้",
  ],
  desktop: [
    "เปิดลิงก์นี้ด้วย Chrome หรือ Edge",
    "กดไอคอนติดตั้ง (⊕) ที่ท้ายแถบที่อยู่เว็บ",
    "เลือก “ติดตั้ง” เพื่อเปิดเป็นหน้าต่างแอปแยก",
  ],
};

const TAB_LABEL: Record<Platform, string> = { ios: "iPhone / iPad", android: "Android", desktop: "คอมพิวเตอร์" };

/**
 * Short, actionable “เพิ่มในหน้าจอหลัก” guide per platform, with a real
 * one-tap install when Chrome has offered `beforeinstallprompt`.
 */
export default function InstallGuideDialog({
  open,
  onOpenChange,
  url,
  label,
  deferredPrompt,
  onInstalled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  label: string;
  deferredPrompt?: BIPEvent | null;
  onInstalled?: () => void;
}) {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const detected = useMemo(() => detectPlatform(ua), [ua]);
  const [tab, setTab] = useState<Platform>(detected);
  useEffect(() => { if (open) setTab(detected); }, [open, detected]);
  const inApp = isInAppBrowser(ua);

  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      toast.success(`บันทึก${label}เป็นเว็บแอปแล้ว`);
      onInstalled?.();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="install-guide">
        <DialogHeader>
          <DialogTitle>บันทึก “{label}” เป็นเว็บแอป</DialogTitle>
          <DialogDescription>
            แต่ละลิงก์จะติดตั้งเป็นแอปแยกไอคอนกัน ทำตามขั้นตอนของอุปกรณ์ที่ใช้
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md bg-muted/50 p-2 text-[11px] break-all font-mono">{url}</div>

        {inApp && (
          <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>กำลังเปิดในเบราว์เซอร์ของแอปอื่น (เช่น LINE) — ให้กด “เปิดในเบราว์เซอร์” ก่อน แล้วค่อยติดตั้ง</span>
          </div>
        )}

        <div className="flex gap-1" role="tablist">
          {(["ios", "android", "desktop"] as Platform[]).map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={tab === p}
              onClick={() => setTab(p)}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                tab === p ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
              )}
            >
              {p === "ios" ? <Apple className="w-3.5 h-3.5" /> : p === "android" ? <Smartphone className="w-3.5 h-3.5" /> : <Chrome className="w-3.5 h-3.5" />}
              {TAB_LABEL[p]}
            </button>
          ))}
        </div>

        <ol className="list-decimal pl-5 space-y-1 text-sm text-muted-foreground" data-testid={`steps-${tab}`}>
          {INSTALL_STEPS[tab].map((s) => (
            <li key={s}>
              {s}
              {tab === "ios" && s.includes("แชร์") ? <Share className="inline ml-1 w-3.5 h-3.5" /> : null}
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap gap-2">
          {deferredPrompt && (
            <button
              type="button"
              onClick={install}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              ติดตั้งเลย
            </button>
          )}
          <button
            type="button"
            onClick={async () => {
              const ok = await copyToClipboard(url);
              ok ? toast.success("คัดลอกลิงก์แล้ว") : toast.error("คัดลอกไม่สำเร็จ");
            }}
            className="inline-flex items-center gap-1 rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80"
          >
            <Copy className="w-3.5 h-3.5" /> คัดลอกลิงก์
          </button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80"
          >
            <ExternalLink className="w-3.5 h-3.5" /> เปิดในเบราว์เซอร์
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
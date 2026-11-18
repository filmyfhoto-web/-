import { useEffect, useMemo, useState } from "react";
import SeoHead from "@/components/SeoHead";
import InstallAppCard from "@/components/InstallAppCard";
import IosInstallSteps from "@/components/IosInstallSteps";
import DesktopInstallSteps from "@/components/DesktopInstallSteps";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Apple, CheckCircle2, Chrome, Copy, Download, ExternalLink, Loader2, Monitor, Share2 } from "lucide-react";
import { toast } from "sonner";
import { copyToClipboard } from "@/lib/productLink";
import { applyPwaManifest } from "@/lib/pwaManifest";
import { usePwaInstalled } from "@/hooks/usePwaInstalled";
import { INSTALL_STEPS, detectPlatform, isInAppBrowser, type Platform } from "@/components/InstallGuideDialog";
import { workspaceUrl } from "@/lib/hostMode";

const CARDS: { key: Platform; title: string; icon: typeof Apple }[] = [
  { key: "ios", title: "iPhone / iPad (Safari)", icon: Apple },
  { key: "android", title: "Android (Chrome)", icon: Chrome },
  { key: "desktop", title: "คอมพิวเตอร์ (Chrome / Edge)", icon: Monitor },
];

/** หน้าเปิดสาธารณะสำหรับติดตั้ง “เว็บแอปแอดมิน” ได้จากทุกอุปกรณ์ */
export default function InstallAdminApp() {
  const [url, setUrl] = useState("");
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const mine = useMemo(() => detectPlatform(ua), [ua]);
  const inApp = useMemo(() => isInAppBrowser(ua), [ua]);
  const install = usePwaInstalled();

  useEffect(() => {
    // หน้านี้ไม่ได้อยู่ใต้ /admin จึงต้องชี้ manifest ไปที่แอปแอดมินเอง
    applyPwaManifest("admin");
    // Never share a preview/Lovable URL: it asks the recipient to sign in to
    // Lovable and cannot be installed as the real production app.
    setUrl(workspaceUrl("admin", "/launch"));
  }, []);

  return (
    <main className="min-h-screen bg-background">
      <SeoHead
        title="ติดตั้งเว็บแอปแอดมิน"
        description="ติดตั้งแอปผู้ดูแลระบบร้านนัฐภรณ์ลงหน้าจอโฮมได้ทุกอุปกรณ์ ทั้ง iPhone, Android และคอมพิวเตอร์"
        path="/install/admin"
      />
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold">ติดตั้งเว็บแอปแอดมิน</h1>
          <p className="text-sm text-muted-foreground">
            เปิดลิงก์นี้บนอุปกรณ์ที่ต้องการติดตั้ง แล้วกดปุ่มด้านล่าง — ใช้ได้ทั้ง iPhone, Android และคอมพิวเตอร์
          </p>
        </header>

        {inApp && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
            คุณกำลังเปิดจากเบราว์เซอร์ในแอป (LINE/Facebook) ซึ่งติดตั้งไม่ได้ — กด <b>⋯</b> มุมขวาบน แล้วเลือก
            <b> “เปิดในเบราว์เซอร์”</b> ก่อน
          </div>
        )}

        <InstallAppCard app="admin" />

        <div
          className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${
            install.installed ? "border-emerald-500/40 bg-emerald-500/10" : "bg-muted/40"
          }`}
          data-testid="pwa-live-status"
          aria-live="polite"
        >
          {install.installed ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          ) : (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
          )}
          <span className="min-w-0">
            {install.installed
              ? install.standalone
                ? "ติดตั้งแล้ว — กำลังใช้งานจากไอคอนแอป"
                : "ติดตั้งแล้วบนอุปกรณ์นี้ — เปิดจากไอคอนแอปได้เลย"
              : "ยังไม่พบการติดตั้ง — หน้านี้จะอัปเดตสถานะให้อัตโนมัติเมื่อคุณติดตั้งเสร็จ"}
            <span className="block text-xs text-muted-foreground">
              ตรวจล่าสุด {new Date(install.checkedAt).toLocaleTimeString("th-TH")}
            </span>
          </span>
        </div>

        {mine === "ios" && <IosInstallSteps />}
        {mine === "desktop" && <DesktopInstallSteps />}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">ลิงก์สำหรับติดตั้ง</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <code className="block break-all rounded-lg bg-muted px-3 py-2 text-xs">{url}</code>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={async () => {
                  const ok = await copyToClipboard(url);
                  ok ? toast.success("คัดลอกลิงก์แล้ว") : toast.error("คัดลอกไม่สำเร็จ");
                }}
              >
                <Copy className="w-4 h-4 mr-1" /> คัดลอกลิงก์
              </Button>
              <Button variant="outline" className="rounded-xl" asChild>
                <a href={url} target="_blank" rel="noreferrer">
                  <ExternalLink className="w-4 h-4 mr-1" /> เปิดแอปแอดมิน
                </a>
              </Button>
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={async () => {
                  const data = {
                    title: "ติดตั้งเว็บแอปแอดมิน",
                    text: "เปิดลิงก์นี้บนมือถือหรือคอมพิวเตอร์ แล้วกดติดตั้งเว็บแอปแอดมิน",
                    url,
                  };
                  if (navigator.share) {
                    try {
                      await navigator.share(data);
                      return;
                     } catch (error) {
                       // AbortError means the user intentionally closed the
                       // share sheet. Other iOS/in-app-browser failures should
                       // still fall back to copying the usable public URL.
                       if (error instanceof DOMException && error.name === "AbortError") return;
                    }
                  }
                  const ok = await copyToClipboard(url);
                  ok ? toast.success("อุปกรณ์นี้ยังแชร์ตรงไม่ได้ — คัดลอกลิงก์ให้แล้ว") : toast.error("แชร์ไม่สำเร็จ");
                }}
                data-testid="share-install-link"
              >
                <Share2 className="w-4 h-4 mr-1" /> แชร์ลิงก์ให้ทีมงาน
              </Button>
              <Button variant="outline" className="rounded-xl" asChild>
                <a
                  href={`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(url)}`}
                  target="_blank"
                  rel="noreferrer"
                  download="qr-install-admin.png"
                  data-testid="download-install-qr"
                >
                  <Download className="w-4 h-4 mr-1" /> ดาวน์โหลด QR
                </a>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              ส่ง QR หรือลิงก์นี้ให้ทีมงานสแกน แล้วกดติดตั้งได้เองทุกอุปกรณ์
            </p>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(url)}`}
              alt="คิวอาร์โค้ดลิงก์ติดตั้งเว็บแอปแอดมิน"
              width={180}
              height={180}
              loading="lazy"
              className="rounded-lg border bg-card p-2"
            />
          </CardContent>
        </Card>

        <section className="grid gap-4 sm:grid-cols-2">
          {CARDS.map(({ key, title, icon: Icon }) => (
            <Card key={key} className={key === mine ? "border-primary" : undefined}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Icon className="w-4 h-4 text-primary" />
                  {title}
                  {key === mine && <span className="text-[11px] font-normal text-muted-foreground">(อุปกรณ์นี้)</span>}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="list-decimal pl-5 space-y-1 text-sm text-muted-foreground">
                  {INSTALL_STEPS[key].map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ))}
        </section>
      </div>
    </main>
  );
}

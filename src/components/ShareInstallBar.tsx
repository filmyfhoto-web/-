import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Share2, Copy, Download } from "lucide-react";
import InstallPrompt from "@/components/InstallPrompt";
import InstallGuideDialog from "@/components/InstallGuideDialog";

/**
 * แถบ “แชร์ / บันทึกเป็นเว็บแอพ”
 * - แชร์: ใช้ Web Share API ของมือถือ ถ้าไม่รองรับจะคัดลอกลิงก์แทน
 * - บันทึกเป็นเว็บแอพ: ใช้ปุ่มติดตั้ง (Chrome) หรือคู่มือ Add to Home Screen (iOS)
 */
export default function ShareInstallBar({
  url,
  title = "ร้านนัฐภรณ์",
  text = "เปิดเว็บแอพร้านนัฐภรณ์",
  className = "",
}: { url?: string; title?: string; text?: string; className?: string }) {
  const [guideOpen, setGuideOpen] = useState(false);
  const link = url ?? (typeof window !== "undefined" ? window.location.href : "");

  async function share() {
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title, text, url: link });
        return;
      }
    } catch {
      return; // ผู้ใช้กดยกเลิก — ไม่ต้องแจ้งอะไร
    }
    await copy();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("คัดลอกลิงก์แล้ว");
    } catch {
      toast.error("คัดลอกลิงก์ไม่สำเร็จ");
    }
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`} data-testid="share-install-bar">
      <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={share} data-testid="share-app">
        <Share2 className="w-4 h-4 mr-1" /> แชร์
      </Button>
      <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={copy} data-testid="copy-app-link">
        <Copy className="w-4 h-4 mr-1" /> คัดลอกลิงก์
      </Button>
      <Button type="button" size="sm" className="rounded-xl" onClick={() => setGuideOpen(true)} data-testid="save-webapp">
        <Download className="w-4 h-4 mr-1" /> บันทึกเป็นเว็บแอพ
      </Button>
      <InstallPrompt compact />
      <InstallGuideDialog open={guideOpen} onOpenChange={setGuideOpen} url={link} label={title} />
    </div>
  );
}

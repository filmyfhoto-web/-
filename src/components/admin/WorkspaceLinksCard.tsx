import { Link, useNavigate } from "react-router-dom";
import { Copy, ExternalLink, LayoutDashboard, ShoppingCart, Users, Receipt } from "lucide-react";
import { toast } from "sonner";
import { PUBLIC_ORIGIN } from "@/lib/hostMode";
import type { PwaApp } from "@/lib/pwaManifest";
import { useAuth } from "@/contexts/AuthContext";

type LinkItem = {
  label: string;
  desc: string;
  /** in-app route (always works in this build) */
  to: string;
  app: PwaApp;
  icon: typeof Users;
  /** ใครเห็นลิงก์นี้ได้ — ตรงกับ guard ของ route จริง */
  access: "everyone" | "staff" | "admin";
};

const ITEMS: LinkItem[] = [
  { label: "แอปพนักงาน", desc: "กล่องงานและงานประจำวันของพนักงาน", to: "/staff/inbox", app: "staff", icon: Users, access: "staff" },
  { label: "แอปแอดมิน", desc: "ระบบหลังบ้านทั้งหมด", to: "/admin/home", app: "admin", icon: LayoutDashboard, access: "admin" },
  { label: "POS ขายหน้าร้าน", desc: "ขาย คิดเงิน พิมพ์ใบเสร็จ", to: "/pos/register", app: "pos", icon: ShoppingCart, access: "staff" },
  { label: "Receipt & Delivery", desc: "ระบบออกเอกสารและส่งมอบงาน", to: "/receipts", app: "receipts", icon: Receipt, access: "staff" },
];

/** ลิงก์สาธารณะที่แชร์/บันทึกเป็นเว็บแอปได้จริง — อยู่บนโดเมนที่ใช้งานอยู่เสมอ */
export function workspaceLaunchUrl(app: PwaApp) {
  return `${PUBLIC_ORIGIN}/launch?app=${encodeURIComponent(app)}`;
}

/** การ์ด “ลิงก์เว็บแอป” — เปิดหรือคัดลอกลิงก์ของแต่ละแอปได้จากหน้าเดียว */
export default function WorkspaceLinksCard() {
  const navigate = useNavigate();
  const { isAdmin, isOwner, isStaffAny } = useAuth();
  const items = ITEMS.filter((i) =>
    i.access === "everyone" ? true : i.access === "staff" ? isStaffAny : isAdmin || isOwner,
  );

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("คัดลอกลิงก์แล้ว");
    } catch {
      toast.error("คัดลอกไม่สำเร็จ");
    }
  }

  return (
    <section data-testid="workspace-links-card" className="rounded-2xl border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center justify-between gap-2">
        <div>
          <h2 className="font-bold text-sm">ลิงก์เว็บแอป</h2>
          <p className="text-[11px] text-muted-foreground">เปิดใช้งานหรือคัดลอกลิงก์เพื่อบันทึกเป็นเว็บแอป</p>
        </div>
        <Link to="/admin/app-links" className="text-xs text-primary font-medium shrink-0">ดูทั้งหมด</Link>
      </div>
      <ul className="divide-y">
        {items.map((i) => (
          <li key={i.to} className="flex items-center gap-3 px-4 py-3">
            <span className="w-9 h-9 rounded-xl bg-muted grid place-items-center shrink-0">
              <i.icon className="w-4 h-4 text-foreground/70" />
            </span>
            <span className="min-w-0 flex-1">
              <Link to={i.to} className="block text-sm font-medium truncate hover:underline">{i.label}</Link>
              <span className="block text-[11px] text-muted-foreground truncate">{i.desc}</span>
            </span>
            <button
              type="button"
              onClick={() => copy(workspaceLaunchUrl(i.app))}
              aria-label={`คัดลอกลิงก์ ${i.label}`}
              className="w-9 h-9 rounded-xl border grid place-items-center hover:bg-accent shrink-0"
            >
              <Copy className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label={`เปิด ${i.label}`}
              onClick={() => {
                // ในกรอบพรีวิว/แท็บที่ถูกบล็อก ให้เปิดในแอปแทน
                const w = window.open(workspaceLaunchUrl(i.app), "_blank", "noopener,noreferrer");
                if (!w) navigate(i.to);
              }}
              className="w-9 h-9 rounded-xl border grid place-items-center hover:bg-accent shrink-0"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

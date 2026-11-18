import { Link, useNavigate } from "react-router-dom";
import { Copy, ExternalLink, ShoppingCart, Calculator, Store, Receipt } from "lucide-react";
import { toast } from "sonner";
import { PUBLIC_ORIGIN } from "@/lib/hostMode";

type PosLink = { label: string; desc: string; to: string; shareApp: "pos" | "customer" | "receipts"; icon: typeof Store };

const POS_LINKS: PosLink[] = [
  { label: "POS หลัก", desc: "หน้าขายหลักในพื้นที่ทำงาน POS", to: "/pos", shareApp: "pos", icon: ShoppingCart },
  { label: "POS เครื่องคิดเงิน (จอสัมผัส)", desc: "แอปขายหน้าร้านแบบเต็มจอ สแกน/รับเงิน/พิมพ์ใบเสร็จ", to: "/pos/register", shareApp: "pos", icon: Calculator },
  { label: "POS หน้าร้านออนไลน์", desc: "ขายผ่านหน้าร้านลูกค้า (Shop POS)", to: "/shop/pos", shareApp: "customer", icon: Store },
  { label: "POS ในระบบออกเอกสาร", desc: "POS เดิมในโซน Receipt & Delivery", to: "/receipts/pos", shareApp: "receipts", icon: Receipt },
];

const shareUrl = (app: PosLink["shareApp"]) => `${PUBLIC_ORIGIN}/launch?app=${app}`;

/** การ์ดรวมลิงก์ POS ทุกเวอร์ชัน — คลิกเปิดได้ทันที หรือคัดลอกลิงก์ */
export default function PosLinksCard() {
  const navigate = useNavigate();

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("คัดลอกลิงก์แล้ว");
    } catch {
      toast.error("คัดลอกไม่สำเร็จ");
    }
  }

  return (
    <section data-testid="pos-links-card" className="rounded-2xl border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b">
        <h2 className="font-bold text-sm">หน้า POS ทุกเวอร์ชัน</h2>
        <p className="text-[11px] text-muted-foreground">เลือกเวอร์ชันที่ต้องการใช้ กดเพื่อเปิดหรือคัดลอกลิงก์</p>
      </div>
      <ul className="divide-y">
        {POS_LINKS.map((i) => (
          <li key={i.to} className="flex items-center gap-3 px-4 py-3">
            <span className="w-9 h-9 rounded-xl bg-sky-100 dark:bg-sky-900/40 grid place-items-center shrink-0">
              <i.icon className="w-4 h-4 text-sky-600 dark:text-sky-300" />
            </span>
            <span className="min-w-0 flex-1">
              <Link
                to={i.to}
                data-testid={`pos-link-${i.to}`}
                className="block text-sm font-medium truncate hover:underline"
              >
                {i.label}
              </Link>
              <span className="block text-[11px] text-muted-foreground truncate">{i.desc}</span>
              <span className="block text-[11px] text-muted-foreground/80 font-mono truncate">{i.to}</span>
            </span>
            <button
              type="button"
              onClick={() => copy(shareUrl(i.shareApp))}
              aria-label={`คัดลอกลิงก์ ${i.label}`}
              className="w-9 h-9 rounded-xl border grid place-items-center hover:bg-accent shrink-0"
            >
              <Copy className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label={`เปิด ${i.label}`}
              onClick={() => {
                const w = window.open(shareUrl(i.shareApp), "_blank", "noopener,noreferrer");
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

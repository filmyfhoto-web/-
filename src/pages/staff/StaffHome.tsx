import { Link } from "react-router-dom";
import { ShoppingCart, Boxes, Users, Receipt, Inbox } from "lucide-react";
import StaffLayout from "@/components/layout/StaffLayout";
import SeoHead from "@/components/SeoHead";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Staff start page. Only shows tasks the signed-in person may actually
 * open — no secrets, webhooks, LINE credentials or system settings.
 */
export default function StaffHome() {
  const { profile, hasPerm, canEditProduct } = useAuth();
  const cards = [
    hasPerm("pos") && { to: "/pos", label: "POS ขายหน้าร้าน", desc: "ขายหน้าร้านและตัดสต๊อก", icon: ShoppingCart, tone: "bg-sky-50 border-sky-200" },
    (hasPerm("stock") || canEditProduct) && { to: "/pos/stock", label: "สต๊อกสินค้า", desc: "ตรวจนับและปรับสต๊อก", icon: Boxes, tone: "bg-emerald-50 border-emerald-200" },
    { to: "/pos/customers", label: "ลูกค้า", desc: "ค้นหาและเพิ่มลูกค้า", icon: Users, tone: "bg-amber-50 border-amber-200" },
    { to: "/receipts", label: "ออกเอกสาร", desc: "ใบเสร็จ/ใบส่งของ — ไม่กระทบสต๊อก", icon: Receipt, tone: "bg-accent border-primary/20" },
    { to: "/staff/inbox", label: "กล่องงาน", desc: "งานที่ต้องทำต่อ", icon: Inbox, tone: "bg-rose-50 border-rose-200" },
  ].filter(Boolean) as { to: string; label: string; desc: string; icon: typeof Inbox; tone: string }[];

  return (
    <StaffLayout>
      <SeoHead title="หน้าหลักพนักงาน" description="งานประจำวันของพนักงาน" path="/staff/home" />
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold">สวัสดี {profile?.full_name || "พนักงาน"}</h1>
          <p className="text-sm text-muted-foreground">เลือกงานที่ต้องการทำ</p>
        </header>
        {cards.length === 0 ? (
          <div className="rounded-2xl border bg-card p-8 text-center space-y-3">
            <p className="text-sm text-muted-foreground">ยังไม่ได้รับสิทธิ์ในระบบใด</p>
            <Link to="/pos/role-request" className="inline-block rounded-xl border px-4 py-2 text-sm font-medium hover:bg-accent">
              ขอปรับสิทธิ์จากเจ้าของ
            </Link>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((c) => (
              <Link
                key={c.to}
                to={c.to}
                data-testid={`staff-card-${c.to}`}
                className={`rounded-2xl border-2 p-5 min-h-32 flex flex-col gap-2 transition-shadow hover:shadow-md ${c.tone}`}
              >
                <c.icon className="w-7 h-7 text-foreground/70" />
                <div className="font-bold text-base">{c.label}</div>
                <div className="text-xs text-muted-foreground">{c.desc}</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </StaffLayout>
  );
}
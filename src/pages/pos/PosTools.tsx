import { Link } from "react-router-dom";
import ToolsLinkList, { type ToolGroup, type ToolLink } from "@/components/ToolsLinkList";
import { useAuthOptional, type StaffModule } from "@/contexts/AuthContext";

type PosTool = ToolLink & { perm?: StaffModule };

export const POS_TOOL_GROUPS: { title: string; links: PosTool[] }[] = [
  {
    title: "ภาพรวม",
    links: [
      { to: "/pos/dashboard", label: "แดชบอร์ด", desc: "ยอดขายและภาพรวมของวัน" },
      { to: "/pos/reports", label: "รายงาน", perm: "history" },
      { to: "/pos/staff", label: "ทางลัดพนักงาน" },
    ],
  },
  {
    title: "สต๊อกและจัดซื้อ",
    links: [
      { to: "/pos/purchase-orders", label: "นำเข้า (PO)", perm: "po" },
      { to: "/pos/suppliers", label: "ผู้ขาย", perm: "po" },
      { to: "/pos/movements", label: "เคลื่อนไหวสต๊อก", perm: "stock" },
      { to: "/pos/scan-history", label: "ประวัติการสแกน", perm: "history" },
    ],
  },
  {
    title: "ราคา",
    links: [{ to: "/pos/pricing", label: "ราคาขายส่ง" }],
  },
];

/** POS advanced tools — keeps the daily POS menu down to six items. */
export default function PosTools() {
  const auth = useAuthOptional();
  const groups: ToolGroup[] = POS_TOOL_GROUPS
    .map((g) => ({
      title: g.title,
      links: g.links.filter((l) => !l.perm || !auth || auth.hasPerm(l.perm)),
    }))
    .filter((g) => g.links.length > 0);

  return (
    <div className="p-4 space-y-5 max-w-3xl">
      <header>
        <h1 className="text-xl font-bold">เครื่องมือ</h1>
        <p className="text-sm text-muted-foreground">เมนูที่ไม่ได้ใช้ทุกวันรวมไว้ที่นี่</p>
      </header>
      <ToolsLinkList groups={groups} />
      <Link to="/pos" className="inline-block text-sm font-medium text-primary">กลับหน้าขาย</Link>
    </div>
  );
}

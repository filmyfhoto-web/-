import AdminLayout from "@/components/layout/AdminLayout";
import SeoHead from "@/components/SeoHead";
import ToolsLinkList, { type ToolGroup } from "@/components/ToolsLinkList";
import { useAuth } from "@/contexts/AuthContext";
import { SETTINGS_TABS } from "@/pages/admin/SettingsHub";

/** Links that used to clutter the admin home "เพิ่มเติม" list. */
export const ADMIN_TOOL_GROUPS: (ToolGroup & { ownerOnly?: boolean })[] = [
  {
    title: "งานขายและสต๊อก",
    links: [
      { to: "/admin/boss", label: "บอส AI เอกสาร" },
      { to: "/admin/stock", label: "ประวัติสต๊อก" },
      { to: "/admin/purchases", label: "จัดซื้อเข้าร้าน" },
      { to: "/admin/suppliers", label: "ผู้จำหน่าย" },
      { to: "/admin/prices", label: "ราคา" },
      { to: "/admin/price-groups", label: "กลุ่มราคา" },
      { to: "/admin/review", label: "ตรวจสินค้า/รูปภาพ" },
    ],
  },
  {
    title: "รายงานและสถิติ",
    links: [
      { to: "/admin/customer-purchase-orders", label: "คำสั่งซื้อ (จัดทำ / ส่งลูกค้าตรวจ)" },
      { to: "/admin/credit-bills", label: "บิลลงบัญชี (แยกโรงเรียน/คุณครู)" },
      { to: "/admin/product-views", label: "ประวัติการเข้าชมสินค้า" },
      { to: "/admin/tutorial-views", label: "สถิติวิดีโอสอนลูกค้า" },
    ],
  },
  {
    title: "พนักงาน",
    ownerOnly: true,
    links: [
      { to: "/admin/staff-line", label: "รออนุมัติพนักงาน (LINE)" },
    ],
  },
];

/** One page for everything that is not daily work. */
export default function AdminTools() {
  const { isOwner, isStaff } = useAuth();
  const advanced = SETTINGS_TABS.find((t) => t.key === "tools")!;
  const groups: ToolGroup[] = [
    ...ADMIN_TOOL_GROUPS.filter((g) => (g.ownerOnly ? isOwner : true)).map(({ title, links }) => ({ title, links })),
    {
      title: "ขั้นสูง (ผู้ดูแลระบบ)",
      links: advanced.entries.filter((e) => (e.adminOnly ? isStaff : true)),
    },
  ].filter((g) => g.links.length > 0);

  return (
    <AdminLayout>
      <SeoHead title="เครื่องมือขั้นสูง" description="รวมเครื่องมือและเมนูที่ไม่ได้ใช้ทุกวัน" path="/admin/tools" />
      <div className="space-y-5 max-w-4xl">
        <header>
          <h1 className="text-2xl font-bold">เครื่องมือขั้นสูง</h1>
          <p className="text-sm text-muted-foreground">เมนูที่ไม่ได้ใช้ทุกวันรวมไว้ที่นี่ที่เดียว</p>
        </header>
        <ToolsLinkList groups={groups} />
      </div>
    </AdminLayout>
  );
}

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Link2, MessageCircle, Search, UserPlus } from "lucide-react";
import { StatusBadge } from "./ui";
import QuickLineCustomerDialog, { type QuickLineTarget } from "./QuickLineCustomerDialog";
import type { HubData } from "./useHubData";

/**
 * แผง “LINE OA” ในหน้างานที่ต้องทำ — ดูว่าใครเชื่อม LINE แล้ว/ยังไม่เชื่อม
 * เพื่อคัดลอกลิงก์ส่งให้ลูกค้าได้ทันที (UI-only: อ่านข้อมูลชุดเดิมของศูนย์รวมงาน)
 */
export default function LineLinkPanel({ data }: { data: HubData }) {
  const { customers, friends, orgs } = data;
  const [q, setQ] = useState("");
  const [onlyPending, setOnlyPending] = useState(true);
  const [quickTarget, setQuickTarget] = useState<QuickLineTarget | null>(null);

  const inviteUrl = `${window.location.origin}/l/shop`;

  const rows = useMemo(() => {
    const kw = q.trim().toLowerCase();
    const base = onlyPending ? customers.filter((c) => !c.line_user_id) : customers;
    const list = kw
      ? base.filter((c) => [c.full_name, c.customer_code, c.phone, c.line_display_name, orgs[c.organization_id ?? ""]]
        .some((v) => String(v ?? "").toLowerCase().includes(kw)))
      : base;
    return list.slice(0, 30);
  }, [customers, orgs, q, onlyPending]);

  const pendingFriendRows = useMemo(() => {
    const kw = q.trim().toLowerCase();
    const base = friends.filter((f) => !f.customer_id);
    const list = kw
      ? base.filter((f) => [f.display_name, f.line_user_id].some((v) => String(v ?? "").toLowerCase().includes(kw)))
      : base;
    return list.slice(0, 12);
  }, [friends, q]);
  const pendingFriends = useMemo(() => friends.filter((f) => !f.customer_id).length, [friends]);
  const notLinked = useMemo(() => customers.filter((c) => !c.line_user_id).length, [customers]);

  function copyInvite(name?: string) {
    void navigator.clipboard?.writeText(inviteUrl);
    toast.success("คัดลอกลิงก์เชื่อม LINE แล้ว", {
      description: name ? `ส่งลิงก์นี้ให้ ${name} ใน LINE` : "ส่งลิงก์นี้ให้ลูกค้าใน LINE",
    });
  }

  return (
    <section className="ng-card p-4" data-testid="hub-noti-line-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="font-bold flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-sky-600" /> LINE OA — ใครเชื่อมแล้ว / ยังไม่ได้เชื่อม
          </h3>
          <p className="text-xs text-muted-foreground">
            ยังไม่เชื่อม {notLinked} ราย · บัญชี LINE ที่รอจับคู่ {pendingFriends} บัญชี
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => copyInvite()} data-testid="hub-line-copy-invite">
            <Copy className="w-4 h-4 mr-1" /> คัดลอกลิงก์เชื่อม LINE
          </Button>
          <Button asChild size="sm" variant="secondary" data-testid="hub-line-goto-match">
            <Link to="/admin/work-docs?match=1"><Link2 className="w-4 h-4 mr-1" /> ไปหน้าจับคู่</Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-2">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาชื่อลูกค้า / เบอร์โทร"
            className="pl-8 h-9 w-56"
            data-testid="hub-line-search"
          />
        </div>
        <Button
          variant={onlyPending ? "default" : "outline"}
          size="sm"
          onClick={() => setOnlyPending((v) => !v)}
          className={onlyPending ? "bg-primary hover:bg-primary text-white" : ""}
          data-testid="hub-line-toggle-pending"
        >
          {onlyPending ? "เฉพาะที่ยังไม่เชื่อม" : "แสดงทั้งหมด"}
        </Button>
      </div>

      {pendingFriendRows.length > 0 && (
        <div className="mb-3 border border-amber-200 bg-amber-50/60 p-2" data-testid="hub-line-pending-friends">
          <p className="mb-1.5 text-[11px] font-semibold text-amber-800">
            คนที่ทักเข้ามาแต่ยังไม่มีชื่อในระบบ — กดสร้างลูกค้าและเชื่อมได้ทันที
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {pendingFriendRows.map((f) => (
              <li key={f.line_user_id}>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 bg-white text-[11.5px]"
                  onClick={() => setQuickTarget({ line_user_id: f.line_user_id, display_name: f.display_name })}
                  data-testid="hub-line-quick-create"
                >
                  <UserPlus className="mr-1 h-3.5 w-3.5" /> {f.display_name || f.line_user_id}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <QuickLineCustomerDialog
        target={quickTarget}
        onOpenChange={(open) => { if (!open) setQuickTarget(null); }}
        onDone={() => data.reload()}
      />



      <div className="overflow-x-auto border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/60">
            <tr className="text-left [&>th]:px-2 [&>th]:py-1.5 [&>th]:font-semibold">
              <th>ชื่อลูกค้า</th>
              <th className="hidden sm:table-cell">เบอร์โทร</th>
              <th>สถานะ LINE</th>
              <th className="text-right">ส่งลิงก์</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((c) => (
              <tr key={c.id} className="[&>td]:px-2 [&>td]:py-1.5 hover:bg-accent/30" data-testid="hub-line-row">
                <td className="min-w-[150px]">
                  <div className="font-medium truncate">{c.full_name || c.customer_code || "ไม่ระบุชื่อ"}</div>
                  {c.line_display_name && (
                    <div className="text-[11px] text-muted-foreground truncate">LINE: {c.line_display_name}</div>
                  )}
                </td>
                <td className="hidden sm:table-cell whitespace-nowrap">{c.phone || "—"}</td>
                <td>
                  <StatusBadge tone={c.line_user_id ? "green" : "amber"}>
                    {c.line_user_id ? "เชื่อมแล้ว" : "ยังไม่เชื่อม"}
                  </StatusBadge>
                </td>
                <td className="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyInvite(c.full_name || undefined)}
                    data-testid="hub-line-send"
                  >
                    <Copy className="w-4 h-4 mr-1" /> คัดลอกลิงก์
                  </Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-xs text-muted-foreground">
                  {onlyPending ? "ลูกค้าทุกรายเชื่อม LINE แล้ว 🎉" : "ไม่พบลูกค้าตามคำค้น"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

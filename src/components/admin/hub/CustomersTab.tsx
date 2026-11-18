import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ClipboardList, Copy, Download, History, Link2, Search, Send, ShoppingCart, Unlink, UserPlus,
} from "lucide-react";
import { fmtDateTime } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";
import { StatusBadge } from "./ui";
import QuickLineCustomerDialog, { type QuickLineTarget } from "./QuickLineCustomerDialog";
import type { HubCustomer, HubData, HubLineFriend } from "./useHubData";

const nameOf = (c: HubCustomer) => c.full_name || c.customer_code || "ไม่ระบุชื่อ";

type ChatMessage = { id: string; message: string; topic: string | null; created_at: string; from: "customer" | "staff" };

/**
 * “ลูกค้า & LINE OA” — 3 ส่วนในหน้าเดียว
 *  ซ้าย: รายชื่อลูกค้าในฐานข้อมูล (สถานะเชื่อม LINE)
 *  กลาง: ผู้ที่ทักมาจาก LINE OA ของนัฐภรณ์ เชียงกลาง
 *  ขวา: แชท LINE OA ของลูกค้าที่เลือก + ทางลัดออเดอร์/ใบเบิก/ประวัติ
 * ใช้ RPC และตารางเดิมทั้งหมด (admin_bind_line_customer / customer_messages / order_replies)
 */
export default function CustomersTab({ data }: { data: HubData }) {
  const { customers, orgs, friends, requisitions, orders } = data;
  const [q, setQ] = useState("");
  const [linkFilter, setLinkFilter] = useState<"all" | "linked" | "unlinked">("all");
  const [friendQ, setFriendQ] = useState("");
  const [friendFilter, setFriendFilter] = useState<"all" | "linked" | "unlinked">("unlinked");
  const [customer, setCustomer] = useState<HubCustomer | null>(null);
  const [friend, setFriend] = useState<HubLineFriend | null>(null);
  const [binding, setBinding] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [quickTarget, setQuickTarget] = useState<QuickLineTarget | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const reqByUser = useMemo(() => new Set(requisitions.map((r) => r.user_id).filter(Boolean) as string[]), [requisitions]);
  const orderCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of orders) if (o.user_id) m.set(o.user_id, (m.get(o.user_id) ?? 0) + 1);
    return m;
  }, [orders]);

  const view = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return customers.filter((c) => {
      if (linkFilter === "linked" && !c.line_user_id) return false;
      if (linkFilter === "unlinked" && c.line_user_id) return false;
      if (!kw) return true;
      return [c.full_name, c.customer_code, c.phone, c.line_display_name, orgs[c.organization_id ?? ""]]
        .some((v) => String(v ?? "").toLowerCase().includes(kw));
    });
  }, [customers, q, linkFilter, orgs]);

  const friendView = useMemo(() => {
    const kw = friendQ.trim().toLowerCase();
    return friends.filter((f) => {
      if (friendFilter === "linked" && !f.customer_id) return false;
      if (friendFilter === "unlinked" && f.customer_id) return false;
      if (!kw) return true;
      return [f.display_name, f.line_user_id].some((v) => String(v ?? "").toLowerCase().includes(kw));
    });
  }, [friends, friendQ, friendFilter]);

  /** ประวัติข้อความที่ลูกค้าส่งเข้ามา (ตาราง customer_messages เดิม) */
  const loadChat = useCallback(async (userId: string) => {
    const db = supabase as any;
    const inbound = await db.from("customer_messages").select("id, message, topic, created_at")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(80);
    const rows: ChatMessage[] = ((inbound?.data ?? []) as any[])
      .map((m) => ({
        id: `in:${m.id}`, message: m.message ?? "", topic: m.topic ?? null, created_at: m.created_at, from: "customer" as const,
      }))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    setChat(rows);
  }, []);

  useEffect(() => {
    if (!customer) { setChat([]); return; }
    void loadChat(customer.id);
  }, [customer, loadChat]);

  async function bindNow(force = false) {
    if (!friend || !customer) return;
    setConfirmOpen(false);
    setBinding(true);
    const { data: res, error } = await (supabase as any).rpc("admin_bind_line_customer", {
      p_line_user_id: friend.line_user_id,
      p_customer_id: customer.id,
      p_force: force,
    });
    setBinding(false);
    if (error) { toast.error(`จับคู่ไม่สำเร็จ: ${error.message}`); return; }
    if (res && res.ok === false) {
      if (res.conflict && !force) {
        if (window.confirm("บัญชีนี้ผูกกับลูกค้ารายอื่นอยู่แล้ว ต้องการเขียนทับหรือไม่?")) return bindNow(true);
        return;
      }
      toast.error(`จับคู่ไม่สำเร็จ: ${res.reason ?? "unknown"}`);
      return;
    }
    data.markLinked(customer.id, friend.line_user_id, friend.display_name);
    setCustomer({ ...customer, line_user_id: friend.line_user_id, line_display_name: friend.display_name });
    toast.success(`เชื่อม ${friend.display_name || "LINE"} กับ ${nameOf(customer)} แล้ว`);
    setFriend(null);
  }

  async function unbind(c: HubCustomer) {
    if (!c.line_user_id) return;
    if (!window.confirm(`ยกเลิกการเชื่อม LINE ของ ${nameOf(c)} หรือไม่?`)) return;
    const { error } = await (supabase as any).rpc("admin_unbind_line_customer", {
      p_line_user_id: c.line_user_id,
      p_reason: "ยกเลิกจากศูนย์รวมงานลูกค้า",
    });
    if (error) { toast.error(`ยกเลิกไม่สำเร็จ: ${error.message}`); return; }
    toast.success("ยกเลิกการเชื่อมแล้ว");
    setCustomer({ ...c, line_user_id: null });
    await data.reload();
  }

  async function sendMessage() {
    if (!customer?.line_user_id || !draft.trim()) return;
    setSending(true);
    const { data: res, error } = await supabase.functions.invoke("reply-send-line", {
      body: { line_user_id: customer.line_user_id, message: draft.trim() },
    });
    setSending(false);
    if (error) { toast.error("ส่งข้อความไม่สำเร็จ กรุณาลองใหม่"); return; }
    if ((res as any)?.ok === false) {
      void navigator.clipboard?.writeText(draft.trim());
      toast.warning((res as any)?.message_th ?? "ส่งไม่ได้ — คัดลอกข้อความไว้ให้แล้ว");
      return;
    }
    toast.success("ส่งข้อความถึงลูกค้าแล้ว");
    setDraft("");
    await loadChat(customer.id);
  }

  function exportCsv() {
    downloadCsv(
      `customers-${new Date().toISOString().slice(0, 10)}.csv`,
      view.map((c) => ({
        รหัสลูกค้า: c.customer_code || "-",
        ชื่อลูกค้า: nameOf(c),
        เบอร์โทร: c.phone || "-",
        หน่วยงาน: orgs[c.organization_id ?? ""] || "-",
        สถานะLINE: c.line_user_id ? "เชื่อมแล้ว" : "รอเชื่อม",
        ชื่อLINE: c.line_display_name || "-",
        ใบเบิก: reqByUser.has(c.id) ? "มี" : "-",
        ออเดอร์: orderCount.get(c.id) ?? 0,
      })),
    );
  }

  function copyInvite() {
    void navigator.clipboard?.writeText(`${window.location.origin}/l/shop`);
    toast.success("คัดลอกลิงก์เชิญลูกค้าแล้ว — ส่งใน LINE ให้ลูกค้าเปิดเพื่อสร้างบัญชีในระบบ");
  }

  const FilterChips = ({ value, onChange }: { value: string; onChange: (v: any) => void }) => (
    <div className="flex gap-1">
      {[{ k: "all", l: "ทั้งหมด" }, { k: "linked", l: "จับคู่แล้ว" }, { k: "unlinked", l: "ยังไม่จับคู่" }].map((o) => (
        <button
          key={o.k}
          type="button"
          onClick={() => onChange(o.k)}
          className={`h-7 px-2 text-xs border ${value === o.k
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border hover:bg-accent/40"}`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,28fr)_minmax(0,28fr)_minmax(320px,44fr)]" data-testid="hub-customers">
      {/* ซ้าย: รายชื่อลูกค้า */}
      <section className="ng-card p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-bold">รายชื่อลูกค้า</h3>
          <Button variant="outline" size="sm" onClick={exportCsv} data-testid="hub-customers-export">
            <Download className="w-4 h-4" />
          </Button>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ชื่อลูกค้า / รหัส / เบอร์โทร / โรงเรียน"
            className="pl-8"
            data-testid="hub-customers-search"
          />
        </div>
        <FilterChips value={linkFilter} onChange={setLinkFilter} />
        <ul className="divide-y divide-border max-h-[62vh] overflow-auto border border-border">
          {view.slice(0, 300).map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setCustomer(c)}
                data-testid="hub-customer-row"
                className={`w-full text-left px-2.5 py-2 hover:bg-accent/40 ${customer?.id === c.id ? "bg-accent/60" : ""}`}
              >
                <span className="flex items-center gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium truncate">{nameOf(c)}</span>
                    <span className="block text-[11px] text-muted-foreground truncate">
                      {c.customer_code || "ไม่มีรหัส"} · {orgs[c.organization_id ?? ""] || "ไม่ระบุหน่วยงาน"} · {c.phone || "ไม่มีเบอร์"}
                    </span>
                  </span>
                  <StatusBadge tone={c.line_user_id ? "green" : "amber"} testId="hub-customer-line-badge">
                    {c.line_user_id ? "เชื่อมแล้ว" : "รอเชื่อม"}
                  </StatusBadge>
                </span>
              </button>
            </li>
          ))}
          {view.length === 0 && <li className="p-6 text-center text-xs text-muted-foreground">ไม่พบลูกค้าตามคำค้น</li>}
        </ul>
        <p className="text-[11px] text-muted-foreground">แสดง {Math.min(view.length, 300)} จาก {view.length} รายชื่อ</p>
      </section>

      {/* กลาง: ผู้ติดต่อจาก LINE OA */}
      <section className="ng-card p-3 space-y-2" data-testid="hub-line-match">
        <h3 className="font-bold">ผู้ติดต่อจาก LINE OA</h3>
        <p className="text-[11px] text-muted-foreground">เพื่อนของ <b>นัฐภรณ์ เชียงกลาง</b> เท่านั้น</p>
        <Input value={friendQ} onChange={(e) => setFriendQ(e.target.value)} placeholder="ชื่อ LINE หรือ LINE ID" data-testid="hub-friend-search" />
        <FilterChips value={friendFilter} onChange={setFriendFilter} />
        <ul className="divide-y divide-border max-h-[52vh] overflow-auto border border-border">
          {friendView.slice(0, 300).map((f) => (
            <li key={f.line_user_id} className={friend?.line_user_id === f.line_user_id ? "bg-accent/60" : ""}>
              <div className="flex items-center gap-1 px-2 py-2">
                <button
                  type="button"
                  onClick={() => setFriend(f)}
                  data-testid="hub-friend-option"
                  className="min-w-0 flex-1 text-left flex items-center gap-2"
                >
                  {f.picture_url
                    ? <img src={f.picture_url} alt="" className="w-8 h-8 object-cover" loading="lazy" />
                    : <span className="w-8 h-8 grid place-items-center bg-muted text-[10px]">LINE</span>}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm truncate">{f.display_name || "ไม่มีชื่อ"}</span>
                    <span className="block text-[10px] text-muted-foreground truncate">
                      {f.last_seen_at ? `ติดต่อล่าสุด ${fmtDateTime(f.last_seen_at)}` : f.line_user_id}
                    </span>
                  </span>
                  <StatusBadge tone={f.customer_id ? "green" : "amber"}>{f.customer_id ? "จับคู่แล้ว" : "ยังไม่จับคู่"}</StatusBadge>
                </button>
                {!f.customer_id && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0 px-2 text-[11px]"
                    onClick={() => setQuickTarget({ line_user_id: f.line_user_id, display_name: f.display_name })}
                    data-testid="hub-friend-quick-create"
                    title="สร้างลูกค้าใหม่จากบัญชี LINE นี้ แล้วเชื่อมทันที"
                  >
                    <UserPlus className="mr-1 h-3.5 w-3.5" /> สร้าง+เชื่อม
                  </Button>
                )}
              </div>
            </li>
          ))}
          {friendView.length === 0 && <li className="p-6 text-center text-xs text-muted-foreground">ไม่พบบัญชี LINE ที่ตรงกัน</li>}
        </ul>

        <div className="space-y-1.5 rounded-xl border border-border bg-muted/30 p-2">
          <p className="text-[11px]">
            ลูกค้า: <b>{customer ? nameOf(customer) : "— ยังไม่เลือก —"}</b>
            <br />
            LINE: <b>{friend ? friend.display_name || friend.line_user_id : "— ยังไม่เลือก —"}</b>
          </p>
          <Button className="w-full" disabled={!friend || !customer || binding} onClick={() => setConfirmOpen(true)} data-testid="hub-bind-now">
            <Link2 className="mr-1 h-4 w-4" /> {binding ? "กำลังเชื่อม..." : "เชื่อมลูกค้า ↔ LINE"}
          </Button>
          {customer?.line_user_id && (
            <Button variant="outline" size="sm" className="w-full" onClick={() => void unbind(customer)} data-testid="hub-unbind">
              <Unlink className="mr-1 h-4 w-4" /> ยกเลิกการเชื่อม
            </Button>
          )}
          <Button variant="outline" size="sm" className="w-full" onClick={copyInvite} data-testid="hub-invite-new">
            <Copy className="mr-1 h-4 w-4" /> คัดลอกลิงก์เชิญลูกค้าใหม่
          </Button>
        </div>

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent data-testid="hub-bind-confirm">
            <AlertDialogHeader>
              <AlertDialogTitle>ยืนยันการจับคู่ลูกค้ากับ LINE OA</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-1 text-sm">
                  <div>Customer ID: <b className="font-mono">{customer?.customer_code || customer?.id.slice(0, 8) || "—"}</b></div>
                  <div>ชื่อลูกค้า: <b>{customer ? nameOf(customer) : "—"}</b></div>
                  <div>LINE Display Name: <b>{friend?.display_name || friend?.line_user_id || "—"}</b></div>
                  <p className="pt-1 text-xs text-muted-foreground">ตรวจให้แน่ใจก่อนยืนยัน เพื่อไม่ให้จับคู่ผิดคน</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
              <AlertDialogAction onClick={() => void bindNow(false)} data-testid="hub-bind-confirm-ok">
                ยืนยันจับคู่
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <QuickLineCustomerDialog
          target={quickTarget}
          onOpenChange={(open) => { if (!open) setQuickTarget(null); }}
          onDone={() => data.reload()}
        />



      </section>

      {/* ขวา: แชท + ทางลัด */}
      <section className="ng-card p-3 space-y-2 flex flex-col" data-testid="hub-line-chat">
        <h3 className="font-bold">แชท LINE OA {customer ? `· ${nameOf(customer)}` : ""}</h3>
        {!customer && <p className="text-xs text-muted-foreground py-10 text-center">เลือกลูกค้าจากรายชื่อด้านซ้ายเพื่อดูแชทและประวัติ</p>}

        {customer && (
          <>
            <div className="grid grid-cols-3 gap-1.5">
              <Button asChild variant="outline" size="sm" data-testid="hub-chat-orders">
                <Link to="/admin/work-docs?tab=orders"><ShoppingCart className="w-4 h-4 mr-1" /> ออเดอร์</Link>
              </Button>
              <Button asChild variant="outline" size="sm" data-testid="hub-chat-reqs">
                <Link to="/admin/work-docs?tab=requisitions"><ClipboardList className="w-4 h-4 mr-1" /> ใบเบิก</Link>
              </Button>
              <Button asChild variant="outline" size="sm" data-testid="hub-chat-history">
                <Link to={`/admin/customer-360?focus=${customer.id}`}><History className="w-4 h-4 mr-1" /> ประวัติ</Link>
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              ออเดอร์ {orderCount.get(customer.id) ?? 0} รายการ · {reqByUser.has(customer.id) ? "มีใบเบิก" : "ยังไม่มีใบเบิก"} ·
              {customer.line_user_id ? " ผูก LINE แล้ว" : " ยังไม่ผูก LINE"}
            </p>

            <div className="flex-1 min-h-[220px] max-h-[46vh] overflow-auto border border-border p-2 space-y-2 bg-muted/20">
              {chat.map((m) => (
                <div key={m.id} className={`max-w-[85%] px-2.5 py-1.5 text-sm ${m.from === "staff" ? "ml-auto bg-primary text-primary-foreground" : "bg-card border border-border"}`}>
                  <div className="whitespace-pre-wrap break-words">{m.message}</div>
                  <div className={`text-[10px] mt-0.5 ${m.from === "staff" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {m.topic ? `${m.topic} · ` : ""}{fmtDateTime(m.created_at)}
                  </div>
                </div>
              ))}
              {chat.length === 0 && <p className="text-xs text-muted-foreground text-center py-8">ยังไม่มีประวัติข้อความ</p>}
            </div>

            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={customer.line_user_id ? "พิมพ์ข้อความถึงลูกค้า..." : "ลูกค้ารายนี้ยังไม่ผูก LINE — จับคู่ก่อนจึงส่งข้อความได้"}
              rows={3}
              disabled={!customer.line_user_id}
              data-testid="hub-chat-input"
            />
            <div className="flex gap-1.5">
              <Button
                className="flex-1"
                disabled={!customer.line_user_id || !draft.trim() || sending}
                onClick={() => void sendMessage()}
                data-testid="hub-chat-send"
              >
                <Send className="w-4 h-4 mr-1" /> {sending ? "กำลังส่ง..." : "ส่งข้อความ"}
              </Button>
              {customer.line_user_id && (
                <Button variant="outline" onClick={() => void unbind(customer)} data-testid="hub-chat-unbind">
                  <Unlink className="w-4 h-4" />
                </Button>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

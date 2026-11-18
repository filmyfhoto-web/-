import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Send, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtDateTime } from "@/lib/format";
import { useHubData, type HubCustomer } from "@/components/admin/hub/useHubData";
import type { WorkItem } from "@/lib/workDocs";

type ChatMessage = { id: string; message: string; created_at: string; from: "customer" | "staff" };

const digits = (v: string | null | undefined) => String(v ?? "").replace(/\D/g, "");
const nameOf = (c: HubCustomer) => c.full_name || c.customer_code || "ไม่ระบุชื่อ";

/**
 * "เปิดแชท" จากการ์ดข้อมูลลูกค้าในหน้างานและเอกสาร
 *
 * โหลดข้อมูลศูนย์รวมลูกค้า (useHubData) เฉพาะตอนคอมโพเนนต์นี้ถูก mount เท่านั้น
 * — หน้า /admin/work-docs จึงไม่ยิงคิวรีชุดใหญ่ตอนเข้าหน้า
 */
export default function CustomerChatDialog({ item, onClose }: { item: WorkItem; onClose: () => void }) {
  const { customers, loading } = useHubData();
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  /** จับคู่ลูกค้าในระบบจาก LINE user id ก่อน ถ้าไม่มีค่อยเทียบเบอร์โทร */
  const customer = useMemo(() => {
    if (item.lineUserId) {
      const byLine = customers.find((c) => c.line_user_id === item.lineUserId);
      if (byLine) return byLine;
    }
    const p = digits(item.phone);
    return p ? customers.find((c) => digits(c.phone) === p) ?? null : null;
  }, [customers, item.lineUserId, item.phone]);

  const lineUserId = item.lineUserId || customer?.line_user_id || null;

  const loadChat = useCallback(async (userId: string) => {
    setChatLoading(true);
    const { data } = await (supabase as any)
      .from("customer_messages")
      .select("id, message, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(80);
    setChat(((data ?? []) as any[])
      .map((m) => ({ id: `in:${m.id}`, message: m.message ?? "", created_at: m.created_at, from: "customer" as const }))
      .sort((a, b) => a.created_at.localeCompare(b.created_at)));
    setChatLoading(false);
  }, []);

  useEffect(() => {
    if (!customer) { setChat([]); return; }
    void loadChat(customer.id);
  }, [customer, loadChat]);

  async function send() {
    if (!lineUserId || !draft.trim() || sending) return;
    setSending(true);
    const { data: res, error } = await supabase.functions.invoke("reply-send-line", {
      body: { line_user_id: lineUserId, message: draft.trim() },
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
    if (customer) await loadChat(customer.id);
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg" data-testid="work-chat-dialog">
        <DialogHeader>
          <DialogTitle>แชท LINE OA · {item.customerName}</DialogTitle>
          <DialogDescription>
            {customer ? `ลูกค้าในระบบ: ${nameOf(customer)}` : "ยังไม่พบลูกค้ารายนี้ในฐานข้อมูล"}
            {lineUserId ? " · ผูก LINE แล้ว" : " · ยังไม่ผูก LINE"}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[46vh] min-h-[180px] space-y-2 overflow-auto rounded-xl border border-border bg-muted/20 p-2">
          {loading || chatLoading ? (
            <p className="py-8 text-center text-xs text-muted-foreground">กำลังโหลดข้อความ…</p>
          ) : chat.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">ยังไม่มีข้อความจากลูกค้ารายนี้</p>
          ) : chat.map((m) => (
            <div key={m.id} className="rounded-xl border border-border bg-card p-2">
              <p className="whitespace-pre-line text-sm">{m.message}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">{fmtDateTime(m.created_at)}</p>
            </div>
          ))}
        </div>

        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder={lineUserId ? "พิมพ์ข้อความถึงลูกค้า…" : "ต้องผูก LINE ก่อนจึงจะส่งข้อความได้"}
          disabled={!lineUserId}
          data-testid="work-chat-input"
        />
        <Button onClick={() => void send()} disabled={!lineUserId || !draft.trim() || sending} data-testid="work-chat-send">
          {sending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
          ส่งข้อความทาง LINE
        </Button>
      </DialogContent>
    </Dialog>
  );
}

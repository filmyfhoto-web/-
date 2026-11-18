import { useEffect, useState } from "react";
import { MessageCircle, Phone, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import AccountPage, { AccountCard } from "@/components/account/AccountPage";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuthUserId } from "@/hooks/useAuthUserId";
import { useMyOrders } from "@/hooks/useMyOrders";
import { readIdToken, hasVerifiableIdentity } from "@/lib/lineSession";
import { ACCOUNT_ROUTES } from "@/lib/customerAccountRoutes";

const TOPICS = ["สอบถามราคา", "สถานะงาน", "แก้ไขงาน", "ขอใบเสร็จ / ใบกำกับภาษี", "เรื่องอื่น ๆ"];

export default function ContactShop() {
  const userId = useAuthUserId();
  const { orders } = useMyOrders();
  const [topic, setTopic] = useState(TOPICS[0]);
  const [orderId, setOrderId] = useState("none");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [contact, setContact] = useState<{ phone?: string | null; line?: string | null }>({});

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.rpc("get_public_settings");
        const s: any = Array.isArray(data) ? data[0] : data;
        setContact({ phone: s?.phone ?? null, line: s?.line_add_friend_url || s?.line_url || null });
      } catch { /* ไม่มีข้อมูลติดต่อก็ยังส่งข้อความในระบบได้ */ }
    })();
  }, []);

  const send = async () => {
    if (message.trim().length < 5) return toast.error("กรุณาพิมพ์ข้อความอย่างน้อย 5 ตัวอักษร");
    if (message.length > 1000) return toast.error("ข้อความยาวเกินไป");
    // ล็อกอินอยู่ หรือผูก LINE แล้ว (ลูกค้าใน LINE ไม่ต้องล็อกอิน)
    if (!userId && !hasVerifiableIdentity()) return toast.error("กรุณาเข้าสู่ระบบ หรือเปิดหน้านี้ผ่าน LINE ก่อนส่งข้อความ");
    setSending(true);
    try {
      // ส่งผ่านหลังบ้าน: บันทึกข้อความ + แจ้งเข้ากลุ่ม LINE ของร้านจริง
      const { data, error } = await (supabase as any).functions.invoke("contact-shop-message", {
        body: {
          topic,
          message: message.trim(),
          order_id: orderId !== "none" ? orderId : null,
          id_token: readIdToken() || undefined,
        },
      });
      if (error || data?.ok === false) throw new Error(String(data?.error || error?.message || "send_failed"));
      toast.success("ส่งข้อความถึงร้านแล้ว ร้านจะติดต่อกลับโดยเร็ว");
      setMessage("");
    } catch {
      toast.error("ส่งข้อความไม่สำเร็จ กรุณาติดต่อผ่าน LINE หรือโทรหาร้าน");
    } finally {
      setSending(false);
    }
  };


  return (
    <AccountPage title="ติดต่อร้าน" description="ส่งข้อความถึงร้านหรือติดต่อผ่านช่องทางด่วน" path={ACCOUNT_ROUTES.contact}>
      <div className="grid grid-cols-2 gap-2">
        {contact.line && (
          <a href={contact.line} target="_blank" rel="noreferrer" className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-primary text-[14px] font-medium text-primary-foreground">
            <MessageCircle className="w-4 h-4" aria-hidden /> แชท LINE
          </a>
        )}
        {contact.phone && (
          <a href={`tel:${contact.phone}`} className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-accent text-[14px] font-medium">
            <Phone className="w-4 h-4 text-primary" aria-hidden /> โทรหาร้าน
          </a>
        )}
      </div>

      <AccountCard>
        <h2 className="mb-2 text-[15px] font-bold">ส่งข้อความในระบบ</h2>
        <div className="space-y-2">
          <Select value={topic} onValueChange={setTopic}>
            <SelectTrigger className="min-h-11 rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>{TOPICS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={orderId} onValueChange={setOrderId}>
            <SelectTrigger className="min-h-11 rounded-xl"><SelectValue placeholder="เลือกงานที่เกี่ยวข้อง" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">ไม่ระบุงาน</SelectItem>
              {(orders ?? []).map((o) => <SelectItem key={o.id} value={o.id}>#{o.order_no || o.id.slice(0, 8)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Textarea
            data-testid="contact-message"
            placeholder="พิมพ์ข้อความถึงร้าน…"
            maxLength={1000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>
        <Button className="mt-3 w-full min-h-12 rounded-xl" disabled={sending} onClick={() => void send()} data-testid="contact-send">
          {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden /> : <Send className="w-4 h-4 mr-2" aria-hidden />} ส่งข้อความ
        </Button>
      </AccountCard>
    </AccountPage>
  );
}

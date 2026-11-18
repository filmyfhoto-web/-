import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, Copy, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import QuickReplyBar from "@/components/admin/live/QuickReplyBar";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lineUserId: string | null;
  customerName?: string | null;
  orderId?: string | null;
};

export default function DirectReplyDialog({ open, onOpenChange, lineUserId, customerName, orderId }: Props) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => { if (open) setText(""); }, [open]);

  async function send() {
    if (!text.trim()) { toast.error("กรุณาพิมพ์ข้อความ"); return; }
    if (!lineUserId && !orderId) { toast.error("ไม่มีปลายทาง LINE"); return; }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("reply-send-line", {
        body: { line_user_id: lineUserId ?? undefined, order_id: orderId ?? undefined, message: text.trim() },
      });
      if (error) { toast.error(error.message); return; }
      if (data?.ok) { toast.success(data?.message_th || "เข้าคิวส่งแล้ว"); onOpenChange(false); }
      else {
        try { await navigator.clipboard.writeText(text); } catch {}
        toast.warning(data?.message_th || "ส่งไม่สำเร็จ — คัดลอกให้แล้ว");
      }
    } finally { setSending(false); }
  }

  async function copy() {
    if (!text.trim()) return;
    try { await navigator.clipboard.writeText(text); toast.success("คัดลอกแล้ว"); } catch {}
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent lang="th" className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5" /> ตอบกลับลูกค้า
            {customerName && <span className="text-sm text-muted-foreground font-normal">— {customerName}</span>}
          </DialogTitle>
        </DialogHeader>
        <QuickReplyBar onPick={(t) => setText((prev) => prev ? prev + "\n" + t : t)} />
        <Textarea
          lang="th"
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="พิมพ์ข้อความถึงลูกค้า..."
          style={{ fontFamily: '"Sarabun","Noto Sans Thai",system-ui,sans-serif' }}
        />
        <DialogFooter>
          <Button variant="outline" onClick={copy} disabled={!text.trim()}>
            <Copy className="w-4 h-4 mr-1" /> คัดลอก
          </Button>
          <Button
            className="bg-[#06C755] hover:bg-[#05b84c] text-white"
            onClick={send}
            disabled={sending || !text.trim() || (!lineUserId && !orderId)}
          >
            {sending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
            ส่ง LINE
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
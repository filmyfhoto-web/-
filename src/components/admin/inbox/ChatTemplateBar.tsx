import { Button } from "@/components/ui/button";
import { MessageSquareText } from "lucide-react";
import { TEMPLATE_KEYS, TEMPLATE_LABEL, buildOrderReplyText } from "@/lib/orderReplyText";
import type { LatestOrder } from "@/hooks/useCustomerLatestOrder";

type Props = {
  onPick: (text: string) => void;
  customerName?: string | null;
  order?: LatestOrder | null;
};

/** เทมเพลตข้อความมาตรฐาน — กดครั้งเดียวได้ข้อความพร้อมส่ง (เติมชื่อ/เลขออเดอร์ให้อัตโนมัติ) */
export default function ChatTemplateBar({ onPick, customerName, order }: Props) {
  const ctx = {
    order_no: order?.order_no ?? "-",
    guest_name: order?.customer_name || customerName || "ลูกค้า",
    status: order?.status,
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="chat-template-bar">
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <MessageSquareText className="h-3.5 w-3.5" /> เทมเพลต:
      </span>
      {TEMPLATE_KEYS.map((k) => (
        <Button
          key={k}
          type="button"
          size="sm"
          variant="outline"
          className="h-7 rounded-full px-2.5 text-xs"
          onClick={() => onPick(buildOrderReplyText(ctx, order?.items ?? [], order?.total ?? 0, k))}
        >
          {TEMPLATE_LABEL[k]}
        </Button>
      ))}
    </div>
  );
}

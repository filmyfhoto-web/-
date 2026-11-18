import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, MessageCircle, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import LineBindActions from "./LineBindActions";
import { useLineBindingState } from "@/hooks/useLineBindingState";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orderNo?: string | null;
  linkToken: string;
  shopLineUrl?: string | null;
  /** When true, headline says "success" — used right after checkout. When false, "bind LINE now" prompt used on subsequent visits. */
  celebratory?: boolean;
  /** Where "ดูสถานะออเดอร์" navigates. */
  statusHref?: string;
}

/**
 * Post-order dialog.
 *
 * `useLineBindingState` is the ONLY source of truth for "is this customer
 * linked?". A customer who already linked once must never be asked again:
 * when the shared state says `linked` (or `needs_friend`, which is still a
 * binding) the dialog collapses to the order number plus a status button and
 * renders NO binding copy and NO <LineBindActions>.
 *
 * While the lookup is in flight we show a neutral placeholder instead of the
 * bind step, so a linked customer never sees a flash of "please link". An
 * errored lookup is also treated as "don't nag" — the shared hook already
 * refuses to downgrade a known-linked customer, and guessing "unlinked" on a
 * transient network error is exactly what produced the old re-prompt loop.
 */
export default function OrderSuccessLineDialog({
  open,
  onOpenChange,
  orderNo,
  linkToken,
  shopLineUrl,
  celebratory = true,
  statusHref = "/my-orders",
}: Props) {
  const navigate = useNavigate();
  const { status } = useLineBindingState();
  const bindPhrase = linkToken ? `link t:${linkToken}` : "";

  const linked = status === "linked" || status === "needs_friend";
  const resolving = status === "loading";
  // Only a definite server "unlinked" may show the bind CTA.
  const showBind = status === "unlinked" && !!bindPhrase;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl p-0 overflow-hidden">
        <div className="bg-gradient-to-br from-[#06C755] to-[#04a548] text-white px-6 pt-6 pb-5">
          <div className="flex items-center gap-2">
            {celebratory ? <CheckCircle2 className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
            <DialogHeader className="p-0 space-y-0">
              <DialogTitle className="text-white text-lg font-bold">
                {celebratory ? "สั่งซื้อสำเร็จ!" : linked ? "ติดตามออเดอร์" : "รับแจ้งเตือนผ่าน LINE"}
              </DialogTitle>
            </DialogHeader>
          </div>
          {orderNo && (
            <div className="mt-1 text-white/90 text-sm">
              เลขที่ <span className="font-semibold" data-testid="order-no">{orderNo}</span>
            </div>
          )}
          <DialogDescription className="text-white/95 text-sm mt-2 leading-relaxed">
            {linked
              ? "บัญชี LINE ของคุณผูกไว้แล้ว ระบบจะแจ้งเตือนสถานะออเดอร์ให้อัตโนมัติ"
              : "ผูก LINE ตอนนี้เพื่อรับแจ้งเตือนทันทีเมื่อร้านเสนอราคา ยืนยันออเดอร์ หรืออัปเดตสถานะ"}
          </DialogDescription>
        </div>

        <div className="p-5 space-y-3">
          {resolving && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-3">
              <Loader2 className="w-4 h-4 animate-spin" /> กำลังตรวจสอบสถานะ LINE…
            </div>
          )}

          {showBind && (
            <>
              <ol className="text-sm text-foreground/90 space-y-1.5 list-decimal list-inside">
                <li>กดปุ่ม <b>เปิด LINE ผูกอัตโนมัติ</b> หรือ <b>คัดลอกข้อความ</b> ด้านล่าง</li>
                <li>ในแชท LINE ของร้าน ให้วางข้อความและกดส่ง</li>
                <li>ระบบจะผูกออเดอร์นี้กับ LINE ของคุณอัตโนมัติ</li>
              </ol>
              <LineBindActions
                bindPhrase={bindPhrase}
                shopLineUrl={shopLineUrl}
                storageKey={`order:${linkToken}`}
              />
            </>
          )}

          {!resolving && (
            <Button
              variant={linked ? "default" : "outline"}
              size="sm"
              className="w-full"
              onClick={() => { onOpenChange(false); navigate(statusHref); }}
            >
              ดูสถานะออเดอร์
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground"
            onClick={() => onOpenChange(false)}
          >
            {linked ? "ปิด" : "ไว้ทีหลัง"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

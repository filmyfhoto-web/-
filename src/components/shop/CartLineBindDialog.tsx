import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, MessageCircle, RefreshCw } from "lucide-react";
import { normalizeLineUrl } from "@/lib/line";
import { supabase } from "@/integrations/supabase/client";
import LineBindActions from "./LineBindActions";
import { useLineBindingState, refreshLineBinding } from "@/hooks/useLineBindingState";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  phone: string;
  shopLineUrl?: string | null;
  policy: "optional" | "recommended" | "required";
  onProceed: () => void;
}

/**
 * Pre-order LINE binding modal used from the cart.
 * Shows QR + copy + open-LINE + recheck-status.
 *
 * "Bound" is decided by the shared `useLineBindingState` store first — a
 * customer who linked once (this session, another tab, or a previous visit)
 * is never asked to link again. The phone-number RPC is only a FALLBACK for
 * guests who have no LINE id_token yet, and it can only ever flip the answer
 * to bound, never back to unbound.
 *
 * Fallback: when the shop's LINE URL is missing, all deep-link/QR affordances
 * are hidden and the "proceed anyway" button is always available (never
 * blocks checkout, even in `required` mode — availability comes first).
 */
export default function CartLineBindDialog({ open, onOpenChange, phone, shopLineUrl, policy, onProceed }: Props) {
  const bindPhrase = phone ? `#${phone}` : "";
  const addFriendUrl = normalizeLineUrl(shopLineUrl || "");
  const lineAvailable = !!addFriendUrl;
  const shared = useLineBindingState({ auto: false });
  const [phoneBound, setPhoneBound] = useState(false);
  const [checking, setChecking] = useState(false);
  const timerRef = useRef<number | null>(null);
  const bound = shared.isLinked || phoneBound;

  async function check() {
    setChecking(true);
    try {
      // Server-side source of truth for an already-linked customer.
      const s = await refreshLineBinding(true);
      if (s.status === "linked") return true;
      if (!phone) return false;
      const { data, error } = await supabase.rpc("check_line_binding_by_phone", { p_phone: phone });
      if (error) return false;
      const ok = data === true;
      if (ok) setPhoneBound(true);
      return ok;
    } finally { setChecking(false); }
  }

  useEffect(() => {
    if (!open) return;
    // Do NOT reset to false: clearing a known-linked state is what made the
    // dialog re-prompt customers who had already linked.
    check();
    const started = Date.now();
    timerRef.current = window.setInterval(async () => {
      if (Date.now() - started > 2 * 60_000) {
        if (timerRef.current) window.clearInterval(timerRef.current);
        return;
      }
      const ok = await check();
      if (ok && timerRef.current) window.clearInterval(timerRef.current);
    }, 5000) as unknown as number;
    return () => { if (timerRef.current) window.clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, phone]);

  const isRequired = policy === "required" && lineAvailable;
  const canProceed = bound || !isRequired;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl p-0 overflow-hidden">
        <div className={`px-6 pt-6 pb-5 text-white ${bound ? "bg-gradient-to-br from-[#06C755] to-[#04a548]" : "bg-gradient-to-br from-[#06C755] to-[#04a548]"}`}>
          <div className="flex items-center gap-2">
            {bound ? <CheckCircle2 className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
            <DialogHeader className="p-0 space-y-0">
              <DialogTitle className="text-white text-lg font-bold">
                {bound ? "ผูก LINE สำเร็จแล้ว ✅" : (isRequired ? "กรุณาผูก LINE ก่อนสั่งซื้อ" : "แนะนำให้ผูก LINE ก่อนสั่งซื้อ")}
              </DialogTitle>
            </DialogHeader>
          </div>
          <DialogDescription className="text-white/95 text-sm mt-2 leading-relaxed">
            {bound
              ? "ต่อจากนี้เราจะแจ้งเตือนสถานะออเดอร์ให้คุณผ่าน LINE ทันที กดปุ่มด้านล่างเพื่อดำเนินการสั่งซื้อต่อได้เลยค่ะ"
              : "เพื่อให้ร้านสามารถแจ้งยอดรวม ตอบกลับออเดอร์ และแจ้งสถานะสินค้าให้คุณได้รวดเร็วขึ้น กรุณาผูก LINE ก่อนส่งรายการค่ะ"}
          </DialogDescription>
        </div>

        <div className="p-5 space-y-3">
          {bound ? (
            <>
              <div className="rounded-xl border border-[#06C755]/30 bg-[#06C755]/5 p-4 flex gap-2">
                <CheckCircle2 className="w-5 h-5 text-[#06C755] shrink-0 mt-0.5" />
                <div className="text-sm">
                  <div className="font-semibold text-foreground">เบอร์ {phone} ผูก LINE แล้ว</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    ออเดอร์ที่คุณกำลังจะส่งจะเชื่อมกับ LINE นี้อัตโนมัติ
                  </div>
                </div>
              </div>
              <Button size="lg" onClick={() => { onOpenChange(false); onProceed(); }}
                className="w-full rounded-xl bg-gradient-primary text-primary-foreground font-semibold">
                ดำเนินการสั่งซื้อต่อ
              </Button>
            </>
          ) : !lineAvailable ? (
            <>
              <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                ร้านยังไม่ได้ตั้งค่า LINE Official Account — คุณสามารถสั่งซื้อต่อได้เลย
                และแอดมินจะติดต่อกลับตามเบอร์ที่ให้ไว้
              </div>
              <Button size="lg" onClick={() => { onOpenChange(false); onProceed(); }}
                className="w-full rounded-xl bg-gradient-primary text-primary-foreground font-semibold">
                สั่งซื้อต่อ
              </Button>
            </>
          ) : (
            <>
              <ol className="text-sm text-foreground/90 space-y-1.5 list-decimal list-inside">
                <li>กดปุ่ม <b>เปิด LINE ผูกอัตโนมัติ</b> หรือ <b>คัดลอกข้อความ</b> ด้านล่าง</li>
                <li>ในแชท LINE ของร้าน ให้วางข้อความและกดส่ง</li>
                <li>รอสักครู่ ระบบจะตรวจสถานะให้อัตโนมัติ</li>
              </ol>

              {bindPhrase && (
                <LineBindActions
                  bindPhrase={bindPhrase}
                  shopLineUrl={shopLineUrl}
                  storageKey={`cart:${phone}`}
                />
              )}

              <div className="flex gap-2">
                <Button variant="secondary" size="sm" className="flex-1 rounded-lg" onClick={check} disabled={checking}>
                  <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${checking ? "animate-spin" : ""}`} />
                  ตรวจสถานะอีกครั้ง
                </Button>
                {policy === "recommended" && (
                  <Button variant="ghost" size="sm" className="flex-1 text-muted-foreground"
                    onClick={() => { onOpenChange(false); onProceed(); }}>
                    ข้ามไปก่อน
                  </Button>
                )}
              </div>

              {isRequired && (
                <div className="text-[11px] text-center text-muted-foreground">
                  ร้านนี้กำหนดให้ผูก LINE ก่อนสั่งซื้อ — ระบบตรวจสถานะอัตโนมัติทุก 5 วินาที
                </div>
              )}
            </>
          )}

          {!bound && !canProceed && policy === "required" && (
            <div className="text-[11px] text-center text-destructive">
              ต้องผูก LINE สำเร็จก่อนจึงจะกดสั่งซื้อได้
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
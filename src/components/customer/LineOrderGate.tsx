import { useCallback, useEffect, useState } from "react";
import { Loader2, MessageCircle, RefreshCw, AlertTriangle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useLineBindingState, refreshLineBinding } from "@/hooks/useLineBindingState";
import { startLineLogin as beginLineOauth, lineErrorMessage } from "@/lib/lineOauth";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

/**
 * LINE OA gate ที่ใช้ "ตอนกดยืนยันสั่งซื้อ" เท่านั้น
 *
 * หน้าดูสินค้า/ตะกร้าเปิดสาธารณะ — การ์ดนี้จะโผล่ก็ต่อเมื่อผู้ใช้กดยืนยัน
 * แล้วเซิร์ฟเวอร์ (`line-link-lookup`) ยังไม่ยืนยันว่า
 *   1) ล็อกอิน LINE แล้ว และ 2) เป็นเพื่อนกับ LINE OA ของร้าน
 *
 * การตัดสินใจทั้งหมดมาจากเซิร์ฟเวอร์เสมอ ค่าจาก localStorage ใช้เป็นเพียง
 * หลักฐานแนบไปกับคำขอ และการบังคับจริงยังอยู่ที่ edge function ตอนสร้างออเดอร์
 */

export type OrderGateStatus =
  | "checking" | "ready" | "needs_login" | "needs_friend" | "error";

export function mapBindingToGate(status: string): OrderGateStatus {
  switch (status) {
    case "linked": return "ready";
    case "needs_friend": return "needs_friend";
    case "unlinked": return "needs_login";
    case "loading": return "checking";
    default: return "error";
  }
}

export function useOrderGate() {
  const binding = useLineBindingState({ auto: false });
  const status = mapBindingToGate(binding.status);
  const recheck = useCallback(() => refreshLineBinding(true), []);
  return { status, recheck, binding };
}

export default function LineOrderGate({
  open,
  onOpenChange,
  onPassed,
  /** URL ที่จะกลับมาหลังล็อกอินจากเบราว์เซอร์ภายนอก (เก็บตะกร้า/ฟอร์มไว้) */
  returnTo = "/cart",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPassed: () => void;
  returnTo?: string;
}) {
  const { status, recheck } = useOrderGate();
  const [addFriendUrl, setAddFriendUrl] = useState<string | null>(null);
  const [cfgMissing, setCfgMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // โหลดลิงก์เพิ่มเพื่อนจากการตั้งค่าจริงของร้าน (ไม่ hardcode)
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.rpc("get_public_settings");
        if (cancelled) return;
        if (error) { setCfgMissing(true); return; }
        const row: any = Array.isArray(data) ? data[0] : data;
        const url = row?.line_add_friend_url || row?.line_url || null;
        setAddFriendUrl(url);
        setCfgMissing(!url);
      } catch { if (!cancelled) setCfgMissing(true); }
    })();
    return () => { cancelled = true; };
  }, [open]);

  // ตรวจสิทธิ์ทันทีที่การ์ดเปิด และตรวจซ้ำอัตโนมัติเมื่อกลับมาที่แท็บนี้
  useEffect(() => {
    if (!open) return;
    void recheck();
    function onFocus() { void recheck(); }
    function onVisible() { if (document.visibilityState === "visible") void recheck(); }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [open, recheck]);

  // ผ่านแล้ว → ไปต่อทันที ไม่ต้องกรอกใหม่
  useEffect(() => {
    if (open && status === "ready") { onOpenChange(false); onPassed(); }
  }, [open, status, onOpenChange, onPassed]);

  async function login() {
    setBusy(true); setErr(null);
    try {
      const url = await beginLineOauth(returnTo);
      window.location.assign(url);
    } catch (e) {
      setErr(lineErrorMessage(String((e as Error)?.message || e)));
      setBusy(false);
    }
  }

  const body = (() => {
    if (status === "checking") {
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-6" data-testid="order-gate-checking">
          <Loader2 className="w-4 h-4 animate-spin" /> กำลังตรวจสอบบัญชี LINE...
        </div>
      );
    }
    if (status === "error") {
      return (
        <div className="space-y-3" data-testid="order-gate-error">
          <p className="text-sm text-destructive flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            ตรวจสอบบัญชี LINE ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง
          </p>
          <Button className="w-full" onClick={() => void recheck()}>
            <RefreshCw className="w-4 h-4 mr-2" /> ลองอีกครั้ง
          </Button>
        </div>
      );
    }
    if (status === "needs_login") {
      return (
        <div className="space-y-2" data-testid="order-gate-login">
          {addFriendUrl ? (
            <Button asChild className="w-full bg-[#06C755] hover:bg-[#06C755]/90 text-white">
              <a href={addFriendUrl} target="_blank" rel="noopener noreferrer" data-testid="order-gate-add-friend">
                <MessageCircle className="w-4 h-4 mr-2" /> เพิ่มเพื่อน LINE
              </a>
            </Button>
          ) : null}
          <Button
            variant={addFriendUrl ? "secondary" : "default"}
            className={addFriendUrl ? "w-full" : "w-full bg-[#06C755] hover:bg-[#06C755]/90 text-white"}
            disabled={busy}
            onClick={login}
            data-testid="order-gate-login-btn"
          >
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MessageCircle className="w-4 h-4 mr-2" />}
            เพิ่มเพื่อนแล้ว — เข้าสู่ระบบเพื่อสั่งซื้อ
          </Button>
          <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
            <ArrowLeft className="w-4 h-4 mr-2" /> กลับไปดูสินค้า
          </Button>
          {err && <p className="text-xs text-destructive">{err}</p>}
        </div>
      );
    }
    // needs_friend
    if (cfgMissing || !addFriendUrl) {
      return (
        <div className="space-y-3" data-testid="order-gate-config-missing">
          <p className="text-sm text-destructive flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            ตอนนี้ยังยืนยันสั่งซื้อไม่ได้ เพราะร้านยังตั้งค่า LINE ไม่ครบ
            (แจ้งแอดมิน: ตั้งค่า “ลิงก์เพิ่มเพื่อน LINE OA” ในหน้าตั้งค่า LINE)
          </p>
          <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
            <ArrowLeft className="w-4 h-4 mr-2" /> กลับไปดูสินค้า
          </Button>
        </div>
      );
    }
    return (
      <div className="space-y-2" data-testid="order-gate-friend">
        <Button
          asChild
          className="w-full bg-[#06C755] hover:bg-[#06C755]/90 text-white"
        >
          <a href={addFriendUrl} target="_blank" rel="noopener noreferrer" data-testid="order-gate-add-friend">
            <MessageCircle className="w-4 h-4 mr-2" /> เพิ่มเพื่อน LINE
          </a>
        </Button>
        <Button variant="secondary" className="w-full" onClick={() => void recheck()}>
          <RefreshCw className="w-4 h-4 mr-2" /> เพิ่มเพื่อนแล้ว — ตรวจสอบอีกครั้ง
        </Button>
        <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
          <ArrowLeft className="w-4 h-4 mr-2" /> กลับไปดูสินค้า
        </Button>
      </div>
    );
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(92vw,26rem)]" data-testid="line-order-gate">
        <DialogHeader>
          <DialogTitle>เพิ่มเพื่อน LINE ร้านก่อนสั่งซื้อ</DialogTitle>
          <DialogDescription>
            เพื่อรับเลขออเดอร์และติดตามสถานะงาน — ตะกร้าและข้อมูลที่กรอกไว้จะถูกเก็บไว้ให้
          </DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}

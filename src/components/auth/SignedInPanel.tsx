import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { fetchLoginRole } from "@/lib/fetchLoginRole";
import { resolveRoleHome } from "@/lib/roleHome";
import { LogOut, ArrowRight, Loader2, UserCircle2 } from "lucide-react";

/**
 * แสดงเมื่อเปิดหน้าเข้าสู่ระบบทั้งที่ยังมี session อยู่:
 * ไม่เด้งอัตโนมัติ แต่ให้เลือก "ไปต่อ" (ตามบทบาทจริงจากฐานข้อมูล)
 * หรือ "ออกจากระบบ" เพื่อสลับบัญชี
 */
export default function SignedInPanel({
  email,
  uid,
  target,
}: {
  email?: string | null;
  uid?: string;
  /** ปลายทางที่กำหนดเอง (เช่น มี ?next=) — ถ้าไม่ส่ง จะคำนวณจากบทบาทจริง */
  target?: string;
}) {
  const nav = useNavigate();
  const [dest, setDest] = useState<string | null>(target ?? null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (target) { setDest(target); return; }
    let alive = true;
    fetchLoginRole(uid).then((r) => {
      if (!alive) return;
      setDest(
        resolveRoleHome({
          signedIn: true,
          isOwner: r.isOwner,
          isAdmin: r.isAdmin,
          isStaffAny: r.isStaffAny,
          isCustomer: true,
        }),
      );
    });
    return () => { alive = false; };
  }, [uid, target]);

  async function logout() {
    setBusy(true);
    await supabase.auth.signOut();
    setBusy(false);
    nav(0);
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border bg-card p-6 space-y-4 shadow-sm" data-testid="signed-in-panel">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary grid place-items-center">
          <UserCircle2 className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">คุณเข้าสู่ระบบอยู่แล้ว</p>
          <p className="text-xs text-muted-foreground truncate">{email || "บัญชีปัจจุบัน"}</p>
        </div>
      </div>
      <Button
        className="w-full h-11 rounded-xl"
        disabled={!dest}
        onClick={() => dest && nav(dest, { replace: true })}
        data-testid="signed-in-continue"
      >
        {dest ? <>ไปต่อตามบทบาท <ArrowRight className="w-4 h-4 ml-2" /></> : <Loader2 className="w-4 h-4 animate-spin" />}
      </Button>
      <Button
        variant="outline"
        className="w-full h-11 rounded-xl"
        onClick={logout}
        disabled={busy}
        data-testid="signed-in-logout"
      >
        {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LogOut className="w-4 h-4 mr-2" />} ออกจากระบบ / สลับบัญชี
      </Button>
    </div>
  );
}
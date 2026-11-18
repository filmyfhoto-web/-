import { useState } from "react";
import { CheckCircle2, AlertCircle, RefreshCw, Copy, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { readIdToken, hasVerifiableIdentity } from "@/lib/lineSession";
import { refreshLineBinding, useLineBindingState } from "@/hooks/useLineBindingState";
import { maskLineUserId } from "@/lib/customer360/identity";

/**
 * การ์ด "การเชื่อมโยง LINE" ในหน้าข้อมูลสมาชิก
 * แสดง LINE ID (มาสก์) + สถานะยืนยันจากเซิร์ฟเวอร์ และปุ่มยืนยัน/เชื่อมบัญชี
 * ทุกค่าอ่านจาก `useLineBindingState` ซึ่งมาจาก `line-link-lookup` เท่านั้น
 */
export default function LineIdentityCard() {
  const line = useLineBindingState();
  const [busy, setBusy] = useState(false);
  const linked = line.status === "linked" || line.status === "needs_friend";
  const lineUserId = line.lineUserId || null;

  async function verify() {
    setBusy(true);
    try {
      if (!(await hasVerifiableIdentity())) {
        toast.error("ยังไม่พบการเชื่อมโยง LINE");
        return;
      }
      const id_token = readIdToken();
      await supabase.functions.invoke("line-profile-sync", { body: id_token ? { id_token } : {} });
      const next = await refreshLineBinding(true);
      const ok = (next as any)?.status === "linked" || (next as any)?.status === "needs_friend";
      toast[ok ? "success" : "error"](
        ok ? "ยืนยันการเชื่อมโยง LINE แล้ว" : "ยังไม่พบการเชื่อมโยง LINE",
      );
    } catch {
      toast.error("ยืนยันไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-primary/10"
      aria-label="การเชื่อมโยงบัญชี LINE"
      data-testid="line-identity-card"
      data-linked={linked ? "true" : "false"}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[17px] font-bold">การเชื่อมโยงบัญชี LINE</h2>
          <p className="text-[12px] text-muted-foreground">
            ใช้เชื่อมประวัติและสถานะคำสั่งซื้อของคุณให้ถูกต้อง
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1 px-2.5 py-1 text-[11px] font-semibold ${
            linked ? "bg-success/10 text-success" : "bg-amber-500/10 text-amber-600"
          }`}
          data-testid="line-identity-status"
        >
          {linked ? (
            <><CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> ยืนยันแล้ว</>
          ) : (
            <><AlertCircle className="h-3.5 w-3.5" aria-hidden /> ยังไม่เชื่อม</>
          )}
        </span>
      </div>

      <dl className="mt-3 grid gap-2 text-[13px]">
        <div className="flex items-center justify-between gap-2 border-t border-border/70 pt-2">
          <dt className="text-muted-foreground">ชื่อบน LINE</dt>
          <dd className="truncate font-medium" data-testid="line-identity-name">
            {line.displayName || "—"}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border/70 pt-2">
          <dt className="text-muted-foreground">LINE ID</dt>
          <dd className="flex items-center gap-1.5 font-mono text-[12px]" data-testid="line-identity-id">
            {maskLineUserId(lineUserId)}
            {lineUserId && (
              <button
                type="button"
                aria-label="คัดลอก LINE ID"
                className="p-1 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  void navigator.clipboard?.writeText(lineUserId);
                  toast.success("คัดลอก LINE ID แล้ว");
                }}
              >
                <Copy className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border/70 pt-2">
          <dt className="text-muted-foreground">ลูกค้าที่จับคู่</dt>
          <dd className="truncate font-medium" data-testid="line-identity-customer">
            {line.customerName || (linked ? "รอร้านจับคู่" : "—")}
          </dd>
        </div>
      </dl>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" className="min-h-10" onClick={() => void verify()} disabled={busy} data-testid="line-identity-verify">
          <RefreshCw className={`mr-1.5 h-4 w-4 ${busy ? "animate-spin" : ""}`} aria-hidden />
          {busy ? "กำลังยืนยัน" : "ยืนยันการเชื่อมโยง"}
        </Button>
        {!linked && (
          <Button type="button" size="sm" className="min-h-10" onClick={() => window.location.assign("/customer/login?next=/account")} data-testid="line-identity-connect">
            <MessageCircle className="mr-1.5 h-4 w-4" aria-hidden /> เชื่อมบัญชี LINE
          </Button>
        )}
      </div>
    </section>
  );
}

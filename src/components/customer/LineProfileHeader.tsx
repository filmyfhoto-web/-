import { useState } from "react";
import { RefreshCw, ShieldCheck, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { readIdToken, hasVerifiableIdentity } from "@/lib/lineSession";
import { refreshLineBinding } from "@/hooks/useLineBindingState";
import { profileInitial, safePictureUrl } from "@/lib/lineProfile";

/**
 * Personal LINE identity header for the customer account pages.
 * Name + picture always come from the server-verified LINE profile
 * (`profiles.line_*`, written only by the audited OAuth/link flows).
 */
export default function LineProfileHeader({
  name,
  pictureUrl,
  linked,
  onSynced,
  subtitle,
}: {
  name: string | null;
  pictureUrl: string | null;
  linked: boolean;
  subtitle?: string | null;
  onSynced?: () => void | Promise<void>;
}) {
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pic = safePictureUrl(pictureUrl);

  async function sync() {
    setSyncing(true);
    setError(null);
    try {
      if (!(await hasVerifiableIdentity())) {
        setError("บัญชีนี้ยังไม่ได้ผูกกับ LINE — กรุณาเข้าสู่ระบบด้วย LINE");
        return;
      }
      const id_token = readIdToken();
      const { data, error: err } = await supabase.functions.invoke("line-profile-sync", {
        body: id_token ? { id_token } : {},
      });
      if (err) throw err;
      if ((data as any)?.source === "not_linked") {
        setError("บัญชีนี้ยังไม่ได้ผูกกับ LINE — กรุณาเข้าสู่ระบบด้วย LINE");
      } else if ((data as any)?.source === "config_missing") {
        setError("ยังไม่ได้ตั้งค่า LINE Messaging API — ใช้ข้อมูลที่บันทึกไว้ล่าสุด");
      } else {
        toast.success("ซิงก์ข้อมูลจาก LINE แล้ว");
      }
      await refreshLineBinding(true);
      await onSynced?.();
    } catch (e: any) {
      const msg = String(e?.message || e);
      setError(msg === "unauthorized" ? "กรุณาเข้าสู่ระบบด้วย LINE อีกครั้ง" : "ซิงก์ข้อมูลไม่สำเร็จ");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div
      className="rounded-2xl bg-card p-4 ring-1 ring-primary/10 shadow-sm"
      data-testid="line-profile-header"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="w-14 h-14 shrink-0 rounded-full overflow-hidden bg-accent grid place-items-center ring-2 ring-primary/20">
          {pic ? (
            <img
              src={pic}
              alt={name ? `รูปโปรไฟล์ LINE ของ ${name}` : "รูปโปรไฟล์ LINE"}
              className="w-full h-full object-cover"
              data-testid="line-profile-picture"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="text-xl font-bold text-primary" data-testid="line-profile-initial">
              {profileInitial(name)}
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-semibold truncate" data-testid="line-profile-name">
            {name || "ยังไม่มีชื่อจาก LINE"}
          </p>
          <p
            className="text-[12px] flex items-center gap-1 text-muted-foreground truncate"
            data-testid="line-profile-status"
          >
            {linked ? (
              <><ShieldCheck className="w-3.5 h-3.5 text-success shrink-0" aria-hidden /> ผูก LINE แล้ว</>
            ) : (
              <><ShieldAlert className="w-3.5 h-3.5 text-amber-500 shrink-0" aria-hidden /> ยังไม่ได้ผูก LINE</>
            )}
            {subtitle ? <span className="truncate"> · {subtitle}</span> : null}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11 rounded-xl shrink-0"
          onClick={() => void sync()}
          disabled={syncing}
          data-testid="line-profile-sync"
        >
          <RefreshCw className={`w-4 h-4 mr-1 ${syncing ? "animate-spin" : ""}`} aria-hidden />
          {syncing ? "กำลังซิงก์" : "ซิงก์ LINE"}
        </Button>
      </div>
      {error && (
        <p className="mt-2 text-[12px] text-destructive break-words" data-testid="line-profile-error">
          {error}
        </p>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, ShieldCheck } from "lucide-react";

// Local typed wrapper for the (beta) supabase.auth.oauth namespace.
type OAuthNs = {
  getAuthorizationDetails: (id: string) => Promise<{ data: any; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: any; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: any; error: { message: string } | null }>;
};
function oauthNs(): OAuthNs {
  return (supabase.auth as unknown as { oauth: OAuthNs }).oauth;
}

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("ไม่พบ authorization_id ในคำขอ");
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        // Preserve the FULL consent URL so login sends the user back here.
        const next = window.location.pathname + window.location.search;
        window.location.href = "/login?next=" + encodeURIComponent(next);
        return;
      }
      const { data, error } = await oauthNs().getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (error) {
        setError(error.message);
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error } = approve
      ? await oauthNs().approveAuthorization(authorizationId)
      : await oauthNs().denyAuthorization(authorizationId);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("เซิร์ฟเวอร์ยืนยันตัวตนไม่ส่ง redirect กลับมา");
      return;
    }
    window.location.href = target;
  }

  if (error) {
    return (
      <main className="min-h-screen grid place-items-center p-6 bg-muted">
        <Card className="max-w-md w-full p-6 space-y-3">
          <h1 className="text-lg font-semibold">เชื่อมต่อไม่สำเร็จ</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
        </Card>
      </main>
    );
  }

  if (!details) {
    return (
      <main className="min-h-screen grid place-items-center p-6 bg-muted">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> กำลังโหลด…
        </div>
      </main>
    );
  }

  const clientName = details.client?.name ?? details.client?.client_name ?? "แอปพลิเคชันภายนอก";
  const redirectUri = details.client?.redirect_uri ?? details.client?.redirect_uris?.[0];

  return (
    <main className="min-h-screen grid place-items-center p-6 bg-muted">
      <Card className="max-w-md w-full p-6 space-y-5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold">
            เชื่อมต่อ {clientName} เข้ากับบัญชีของคุณ
          </h1>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {clientName} จะสามารถเรียกใช้เครื่องมือของแอปนี้ในนามคุณได้
          โดยยังคงอยู่ภายใต้สิทธิ์และนโยบายความปลอดภัยของระบบ (RLS)
        </p>
        {redirectUri && (
          <div className="rounded-lg bg-muted/50 p-3 text-xs break-all">
            <div className="text-muted-foreground mb-1">Redirect URI</div>
            <div className="font-mono">{redirectUri}</div>
          </div>
        )}
        <div className="text-xs text-muted-foreground">
          การอนุญาตนี้จะไม่ข้ามสิทธิ์ของบัญชีคุณ และคุณสามารถถอนสิทธิ์ได้ในภายหลัง
        </div>
        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            className="flex-1"
            disabled={busy}
            onClick={() => decide(false)}
          >
            ยกเลิก
          </Button>
          <Button className="flex-1" disabled={busy} onClick={() => decide(true)}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "อนุญาต"}
          </Button>
        </div>
      </Card>
    </main>
  );
}
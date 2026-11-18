import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Loader2, MessageCircle, RefreshCw, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import SeoHead from "@/components/SeoHead";
import { sanitizeNext } from "@/lib/lineSession";
import {
  lineErrorMessage,
  reportLineStep,
  resetLineRetryCount,
  startLineLogin,
} from "@/lib/lineOauth";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/** Map any technical LINE error to a short friendly Thai message. */
export function friendlyLineMessage(code?: string | null): string {
  return lineErrorMessage(code);
}

/**
 * Single customer sign-in screen: one large LINE button, a short Thai
 * explanation, and loading / error / retry states. Uses the existing
 * customer LINE login entry point — no separate identity system.
 */
export default function CustomerLogin() {
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string>("");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [mailError, setMailError] = useState("");

  const next = useMemo(() => {
    const p = new URLSearchParams(location.search).get("next");
    return sanitizeNext(p || "") || "/shop";
  }, [location.search]);

  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const err = p.get("error") || p.get("line_error");
    if (err) {
      setError(friendlyLineMessage(err));
      void reportLineStep({ step: "client_error_returned", ok: false, error: err });
    }
  }, [location.search]);

  // If a cold-started iOS PWA briefly reached this route while its persisted
  // session was still hydrating, leave the login screen as soon as that
  // session is restored. Without this, the user remained stranded here even
  // though the refresh token had already signed them back in.
  useEffect(() => {
    if (!authLoading && user) window.location.replace(next);
  }, [authLoading, user, next]);

  async function start() {
    setError("");
    setStarting(true);
    resetLineRetryCount();
    void reportLineStep({ step: "client_start_requested", ok: true, next });
    try {
      // Normal LINE Login OAuth flow: the server owns state + nonce + PKCE.
      const authorizeUrl = await startLineLogin(next);
      window.location.assign(authorizeUrl);
    } catch (e) {
      const code = String((e as Error)?.message || e);
      setError(lineErrorMessage(code));
      void reportLineStep({ step: "client_start_failed", ok: false, next, error: code });
      setStarting(false);
    }
  }

  /**
   * Fallback identity. LINE Login depends on an external console setting
   * (the callback URL) that the shop owner controls; if it is missing the
   * storefront must still be reachable, so customers can sign in with a
   * one-time e-mail link instead.
   */
  async function sendEmailLink(e: React.FormEvent) {
    e.preventDefault();
    setMailError("");
    setSending(true);
    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}${next}` },
      });
      if (err) throw err;
      setSent(true);
    } catch (err) {
      setMailError(
        String((err as Error)?.message || err) ||
          "ส่งลิงก์เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="min-h-[100dvh] grid place-items-center px-5 py-10 bg-gradient-to-b from-[hsl(140_40%_97%)] to-white">
      <SeoHead title="เข้าสู่ระบบด้วย LINE" description="เข้าสู่ระบบด้วย LINE เพื่อดูสินค้าและสั่งซื้อ" path="/customer/login" />
      <div className="w-full max-w-sm space-y-5 text-center">
        <h1 className="text-2xl font-bold">เข้าสู่ระบบเพื่อเริ่มสั่งซื้อ</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          เข้าสู่ระบบด้วย LINE เพื่อดูสินค้า ราคา และประวัติคำสั่งซื้อของคุณ
          ใช้เวลาเพียงไม่กี่วินาที และเราจะแจ้งสถานะคำสั่งซื้อให้ทาง LINE
        </p>

        {error && (
          <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <Button
          onClick={start}
          disabled={starting}
          data-testid="customer-line-login"
          className="w-full h-14 rounded-2xl text-base font-bold bg-[#06C755] hover:bg-[#05b34c] text-white"
        >
          {starting ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <MessageCircle className="w-5 h-5 mr-2" />}
          เข้าสู่ระบบด้วย LINE
        </Button>

        {error && (
          <Button variant="outline" className="w-full rounded-xl" onClick={start}>
            <RefreshCw className="w-4 h-4 mr-2" /> ลองอีกครั้ง
          </Button>
        )}

        <div className="pt-2 border-t border-border/60 space-y-3 text-left">
          <p className="text-xs text-muted-foreground text-center">
            เข้าสู่ระบบด้วย LINE ไม่ได้? ใช้อีเมลแทนได้
          </p>
          {sent ? (
            <div role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              ส่งลิงก์เข้าสู่ระบบไปที่อีเมลแล้ว กรุณาเปิดลิงก์ในอีเมลเพื่อเข้าใช้งาน
            </div>
          ) : (
            <form onSubmit={sendEmailLink} className="space-y-2">
              <Input
                type="email"
                required
                inputMode="email"
                autoComplete="email"
                data-testid="customer-email-input"
                placeholder="อีเมลของคุณ"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                className="h-12 rounded-xl"
              />
              {mailError && (
                <p role="alert" className="text-xs text-destructive">{mailError}</p>
              )}
              <Button
                type="submit"
                variant="outline"
                disabled={sending || !email.trim()}
                data-testid="customer-email-login"
                className="w-full h-12 rounded-xl"
              >
                {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
                ส่งลิงก์เข้าสู่ระบบทางอีเมล
              </Button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
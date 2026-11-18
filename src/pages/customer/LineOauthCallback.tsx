import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import SeoHead from "@/components/SeoHead";
import {
  completeLineLogin,
  lineErrorMessage,
  reportLineStep,
  resetLineRetryCount,
  retryLineLogin,
  safeNext,
  shouldAutoRetryLine,
} from "@/lib/lineOauth";

/** Landing page for the LINE OAuth return trip. Exchanges the one-time
 *  handoff code for a Supabase session, then redirects once. */
export default function LineOauthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [retrying, setRetrying] = useState(false);
  const nextRef = useRef("/account");
  const ran = useRef(false);

  const doRetry = useCallback(
    async (reason: string) => {
      setRetrying(true);
      setCountdown(null);
      const ok = await retryLineLogin(nextRef.current, reason);
      if (!ok) setRetrying(false);
    },
    [],
  );

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const handoff = params.get("c") || "";
    const next = safeNext(params.get("next"), "/account");
    nextRef.current = next;
    if (!handoff) {
      navigate(`/customer/login?error=state_invalid&next=${encodeURIComponent(next)}`, { replace: true });
      return;
    }
    completeLineLogin(handoff)
      .then((dest) => {
        resetLineRetryCount();
        navigate(dest || next, { replace: true });
      })
      .catch(async (e) => {
        const code = String(e?.message || e);
        setError(lineErrorMessage(code));
        await reportLineStep({ step: "client_callback_failed", ok: false, next, error: code });
        if (shouldAutoRetryLine(code)) setCountdown(3);
      });
  }, [params, navigate]);

  // Countdown to the automatic restart of the OAuth round-trip.
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      void doRetry("auto_retry_after_callback_failure");
      return;
    }
    const t = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdown, doRetry]);

  return (
    <main className="min-h-[100dvh] grid place-items-center px-5 text-center">
      <SeoHead title="กำลังเข้าสู่ระบบ" description="กำลังยืนยันการเข้าสู่ระบบด้วย LINE" path="/auth/line/callback" />
      {!error ? (
        <div className="space-y-3" data-testid="line-callback-loading">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-[#06C755]" />
          <p className="text-sm text-muted-foreground">กำลังเข้าสู่ระบบด้วย LINE...</p>
        </div>
      ) : (
        <div className="space-y-4 max-w-sm">
          <p role="alert" className="text-sm text-destructive">{error}</p>
          {countdown !== null && (
            <p className="text-xs text-muted-foreground" data-testid="line-auto-retry">
              กำลังเริ่มเข้าสู่ระบบใหม่อัตโนมัติใน {countdown} วินาที…
            </p>
          )}
          <Button
            className="w-full rounded-xl"
            disabled={retrying}
            data-testid="line-retry-now"
            onClick={() => void doRetry("manual_retry")}
          >
            {retrying ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            ลองใหม่ทันที
          </Button>
          <Button
            variant="outline"
            className="w-full rounded-xl"
            onClick={() => navigate("/customer/login", { replace: true })}
          >
            กลับหน้าเข้าสู่ระบบ
          </Button>
        </div>
      )}
    </main>
  );
}
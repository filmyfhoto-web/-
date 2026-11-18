import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Loader2, AlertTriangle, RefreshCw, HelpCircle, ExternalLink, Copy, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { writeBinding, writeLinkError, clearLinkError, sanitizeNext, logLineIssue, writeFriendshipHint, writeIdToken, clearLineSession } from "@/lib/lineSession";
import { diagnoseReason } from "@/lib/liffDiagnosis";

import { toast } from "sonner";

const FALLBACK_LIFF_ID = "2010762305-5Yqzh5tB";
const CANONICAL_LIFF_ENDPOINT = "https://filmyynatta.com/l/shop";
const LIFF_SDK = "https://static.line-scdn.net/liff/edge/2/sdk.js";

/**
 * Stale LIFF id_token recovery: when the LINE verify endpoint rejects the
 * cached id_token (id_token_invalid / aud mismatch), we allow ONE
 * self-heal cycle — clear the LIFF/session cache, `liff.logout()`, and
 * re-run `liff.login()` preserving `next`. If it fails again we surface a
 * hard error instead of looping.
 */
const STALE_RECOVERY_KEY = "liff_stale_recovery_done";

/** LIFF พังระดับ config/สภาพแวดล้อม → ใช้ LINE Login แบบเว็บแทนได้ */
function shouldFallbackToWebLogin(message: string, code?: string | number | null): boolean {
  const s = `${message || ""} ${code ?? ""}`.toLowerCase();
  return (
    s.includes("channel not found") ||
    s.includes("404") ||
    s.includes("invalid liff id") ||
    s.includes("liffid") ||
    s.includes("init") ||
    s.includes("โหลด liff sdk ไม่สำเร็จ") ||
    s.includes("forbidden") ||
    s.includes("unauthorized")
  );
}

function isStaleTokenError(message: string, code?: string | number | null): boolean {
  const s = `${message || ""} ${code ?? ""}`.toLowerCase();
  return (
    s.includes("id_token_invalid") ||
    s.includes("line_id_token_invalid_400") ||
    s.includes("line_id_token_invalid_401") ||
    s.includes("aud_mismatch") ||
    s.includes("id_token_missing_sub")
  );
}


declare global {
  interface Window { liff?: any; }
}

function loadLiffSdk(): Promise<any> {
  return new Promise((resolve, reject) => {
    if (window.liff) return resolve(window.liff);
    const s = document.createElement("script");
    s.src = LIFF_SDK;
    s.async = true;
    s.onload = () => resolve(window.liff);
    s.onerror = () => reject(new Error("โหลด LIFF SDK ไม่สำเร็จ"));
    document.head.appendChild(s);
  });
}

function readNext(): string {
  try {
    const url = new URL(window.location.href);
    const q = sanitizeNext(url.searchParams.get("next"));
    if (q) {
      sessionStorage.setItem("line_link_next", q);
      return q;
    }
  } catch { /* ignore */ }
  const stored = sanitizeNext(sessionStorage.getItem("line_link_next"));
  // ค่าเริ่มต้น = หน้าแรก NATTA GROUP (ไม่ใช่หน้าสินค้า)
  return stored || "/";
}

function resolveEndpoint(raw: unknown): { endpoint: string; usedFallback: boolean; reason?: string } {
  if (typeof raw !== "string" || !raw.trim()) {
    return { endpoint: CANONICAL_LIFF_ENDPOINT, usedFallback: true, reason: "missing_endpoint" };
  }
  try {
    const url = new URL(raw.trim());
    if (url.hostname === "liff.line.me") {
      return { endpoint: CANONICAL_LIFF_ENDPOINT, usedFallback: true, reason: "liff_share_url_is_not_endpoint" };
    }
    if (url.protocol !== "https:" || url.pathname !== "/l/shop") {
      return { endpoint: CANONICAL_LIFF_ENDPOINT, usedFallback: true, reason: "invalid_endpoint_shape" };
    }
    return { endpoint: url.toString(), usedFallback: false };
  } catch {
    return { endpoint: CANONICAL_LIFF_ENDPOINT, usedFallback: true, reason: "invalid_endpoint_url" };
  }
}

export default function LiffShop() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("กำลังเชื่อมต่อ LINE...");
  const [error, setError] = useState<{ message: string; code?: string | number } | null>(null);
  const [endpointUrl, setEndpointUrl] = useState<string | null>(null);
  const [liffIdState, setLiffIdState] = useState<string>(FALLBACK_LIFF_ID);
  const [autoBindError, setAutoBindError] = useState<{
    message: string;
    code?: string | number;
    diagnostic: Record<string, unknown>;
  } | null>(null);
  const [autoBindRetrying, setAutoBindRetrying] = useState(false);
  // โหมดการเชื่อมต่อปัจจุบัน — บอกลูกค้าแบบเรียลไทม์ว่ากำลังใช้แอป LINE หรือเข้าสู่ระบบผ่านเว็บ
  const [connectMode, setConnectMode] = useState<"liff" | "web">("liff");

  const bindCtxRef = useRef<{ userId: string; liffId: string; endpoint: string; displayName?: string; pictureUrl?: string; idToken?: string } | null>(null);
  const next = typeof window !== "undefined" ? readNext() : "/";
  const originRef = useRef<string>(typeof window !== "undefined" ? window.location.origin : "");

  const runAutoBind = useCallback(async () => {
    const ctx = bindCtxRef.current;
    if (!ctx || !ctx.userId) {
      setAutoBindError({
        message: "missing_line_user_id",
        diagnostic: {
          reason: "ไม่พบ LINE userId — เซสชั่นอาจหมดอายุ",
          at: new Date().toISOString(),
        },
      });
      return;
    }
    setAutoBindRetrying(true);
    const startedAt = Date.now();
    try {
      // 15s watchdog — ถ้า edge function ค้าง ให้โผล่ error UI แทนที่จะค้างที่ loading
      const invocation = supabase.functions.invoke("line-link-bind", {
        body: {
          line_user_id: ctx.userId,
          id_token: ctx.idToken,
          display_name: ctx.displayName,
          picture_url: ctx.pictureUrl,
          auto: true,
        },
      });
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("auto_bind_timeout")), 15000),
      );
      const { data: bindRes, error: bindErr } = (await Promise.race([invocation, timeout])) as any;
      // supabase-js drops the response body on non-2xx. Recover it from
      // FunctionsHttpError.context so the real reason (aud_mismatch,
      // id_token_invalid, server_misconfigured_login_channel_id, …) surfaces.
      let effective: any = bindRes;
      if (bindErr && !effective) {
        try {
          const ctx = (bindErr as any)?.context;
          if (ctx && typeof ctx.json === "function") {
            effective = await ctx.clone().json().catch(async () => {
              const t = await ctx.clone().text().catch(() => "");
              return t ? { ok: false, error: t } : null;
            });
          }
        } catch { /* best-effort */ }
      }
      if (!effective && bindErr) throw bindErr;
      if (effective?.ok) {
        const bindRes = effective;
        writeBinding({
          phone: bindRes.phone ?? undefined,
          customer_id: bindRes.customer_id ?? undefined,
          customer_source: bindRes.customer_source ?? undefined,
          customer_name: bindRes.customer_name ?? ctx.displayName ?? null,
          line_user_id: ctx.userId,
          linked_at: new Date().toISOString(),
          status: "linked",
        });
        clearLinkError();
        if (ctx.idToken) writeIdToken(ctx.idToken);
        try {
          const w = window as any;
          if (w?.liff && typeof w.liff.getFriendship === "function") {
            const fr = await w.liff.getFriendship();
            writeFriendshipHint({ is_friend: !!fr?.friendFlag, checked_at: new Date().toISOString() });
          }
        } catch { /* friendship best-effort */ }
        await logLineIssue("liff_auto_bind_ok", {
          line_user_id: ctx.userId,
          display_name: ctx.displayName ?? null,
          endpoint: ctx.endpoint,
          liff_id: ctx.liffId,
          duration_ms: Date.now() - startedAt,
          customer_id: bindRes.customer_id ?? null,
          customer_source: bindRes.customer_source ?? null,
        });
        sessionStorage.removeItem("line_link_next");
        setAutoBindError(null);
        navigate(next, { replace: true });
        return;
      }
      const err = new Error(effective?.error || "auto_bind_failed") as Error & {
        code?: string | number;
        detail?: unknown;
      };
      err.code = effective?.error_reason ?? effective?.error_status ?? undefined;
      err.detail = effective?.detail;
      throw err;
    } catch (bindEx: any) {
      const message = bindEx?.message || "auto_bind_failed";
      const code = bindEx?.code ?? bindEx?.status ?? null;
      // Stale/rotated id_token recovery — happens when a previously cached
      // LIFF session was minted for a different LINE Login channel (e.g.
      // after we migrated 2010588895 → 2010762305). Allow ONE self-heal
      // cycle before surfacing the error UI.
      if (
        isStaleTokenError(message, code) &&
        !sessionStorage.getItem(STALE_RECOVERY_KEY)
      ) {
        try { sessionStorage.setItem(STALE_RECOVERY_KEY, "1"); } catch { /* ignore */ }
        clearLineSession();
        await logLineIssue("liff_auto_bind_fail", {
          reason: "stale_id_token_recovering",
          message,
          code,
          liff_id: ctx.liffId,
          endpoint: ctx.endpoint,
        });
        try {
          const w = window as any;
          if (w?.liff?.isLoggedIn?.() && typeof w.liff.logout === "function") {
            w.liff.logout();
          }
          if (w?.liff && typeof w.liff.login === "function") {
            const back = new URL(window.location.href);
            back.searchParams.set("next", next);
            w.liff.login({ redirectUri: back.toString() });
            return;
          }
        } catch { /* fall through to error UI */ }
        window.location.reload();
        return;
      }
      const hint = diagnoseReason(message, message);
      const diagnostic = {
        line_user_id: ctx.userId,
        display_name: ctx.displayName ?? null,
        endpoint: ctx.endpoint,
        liff_id: ctx.liffId,
        origin: typeof window !== "undefined" ? window.location.origin : null,
        error_message: message,
        error_code: code,
        error_detail: bindEx?.detail ?? null,
        expected_client_id: (bindEx?.detail as any)?.expected_client_id ?? null,
        token_aud: (bindEx?.detail as any)?.token_aud ?? null,
        line_error: (bindEx?.detail as any)?.line_error ?? null,
        line_error_description: (bindEx?.detail as any)?.line_error_description ?? null,
        hint_th: hint.hint,
        duration_ms: Date.now() - startedAt,
        at: new Date().toISOString(),
        ua: typeof navigator !== "undefined" ? navigator.userAgent : null,
      };
      await logLineIssue("liff_auto_bind_fail", { reason: message, ...diagnostic });
      // Best-effort external report so admins see it on /admin/line-callbacks
      // without the user pressing "Retry".
      try {
        supabase.functions.invoke("line-endpoint-report", {
          body: {
            from: ctx.endpoint || (typeof window !== "undefined" ? window.location.origin : null),
            endpoint: ctx.endpoint,
            liff_id: ctx.liffId,
            code: code != null ? String(code) : null,
            message,
            detail: bindEx?.detail ?? null,
            ua: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 240) : null,
          },
        }).catch(() => { /* ignore */ });
      } catch { /* ignore */ }
      sessionStorage.removeItem("line_binding");
      setAutoBindError({ message, code: code ?? undefined, diagnostic });
    } finally {
      setAutoBindRetrying(false);
    }
  }, [navigate, next]);

  useEffect(() => {
    let cancelled = false;

    let liffId = FALLBACK_LIFF_ID;
    let endpoint = CANONICAL_LIFF_ENDPOINT;
    (async () => {
      try {
        // Load LIFF ID from admin settings (falls back to hardcoded value)
        try {
          const { data } = await supabase.rpc("get_public_liff_config");
          const row = Array.isArray(data) ? data[0] : data;
          if (row?.liff_id && typeof row.liff_id === "string" && row.liff_id.trim()) {
            liffId = row.liff_id.trim();
          }
          const resolved = resolveEndpoint(row?.liff_endpoint_url);
          endpoint = resolved.endpoint;
          if (resolved.usedFallback) {
            await logLineIssue("liff_config_fallback", {
              reason: resolved.reason,
              message: "liff_endpoint_fallback_to_canonical",
              configured_endpoint: row?.liff_endpoint_url ?? null,
              endpoint,
              liff_id: liffId,
              origin: window.location.origin,
            });
          }
        } catch (configError: any) {
          endpoint = CANONICAL_LIFF_ENDPOINT;
          await logLineIssue("liff_config_fallback", {
            reason: "config_rpc_failed",
            message: configError?.message || "load_liff_config_failed",
            code: configError?.code ?? null,
            endpoint,
            liff_id: liffId,
            origin: window.location.origin,
          });
        }
        setLiffIdState(liffId);
        setEndpointUrl(endpoint);

        // If we're not on the exact origin registered as the LIFF endpoint,
        // the LINE OAuth callback will fail with 400. Auto-redirect to the
        // canonical origin while preserving `next`.
        try {
          const target = new URL(endpoint);
          if (target.origin !== window.location.origin) {
            setStatus("กำลังพาไปโดเมนหลักของร้าน...");
            // Preserve the incoming query string verbatim (LIFF adds liff.state,
            // code, state, error, error_description, etc.) — mangling them can
            // make the LIFF SDK think the endpoint is broken. Only add "next"
            // if it isn't already carried in the URL.
            const dest = new URL(target.pathname + window.location.search, target.origin);
            if (!dest.searchParams.has("next")) dest.searchParams.set("next", next);
            await logLineIssue("liff_redirect", {
              reason: "origin_mismatch",
              message: "origin_mismatch_redirect",
              from_origin: window.location.origin,
              to_origin: target.origin,
              from_url: window.location.href,
              to_url: dest.toString(),
              liff_id: liffId,
              endpoint,
              next,
            });
            window.location.replace(dest.toString());
            return;
          }
        } catch { /* endpoint is normalized above */ }

        const liff = await loadLiffSdk();
        await liff.init({ liffId });

        if (!liff.isLoggedIn()) {
          // Break redirect loops: if we already bounced through liff.login()
          // a couple of times without producing a session, stop and show the
          // error UI so the user isn't stuck.
          const attempts = Number(sessionStorage.getItem("liff_login_attempts") || "0");
          if (attempts >= 2) {
            sessionStorage.removeItem("liff_login_attempts");
            await logLineIssue("liff_login_loop", { attempts, liff_id: liffId, endpoint, origin: window.location.origin });
            throw new Error("เข้าสู่ระบบ LINE ไม่สำเร็จหลังพยายามหลายครั้ง กรุณาลองใหม่อีกครั้ง");
          }
          sessionStorage.setItem("liff_login_attempts", String(attempts + 1));
          setStatus("กำลังพาไปเข้าสู่ระบบ LINE...");
          const back = new URL(window.location.href);
          back.searchParams.set("next", next);
          liff.login({ redirectUri: back.toString() });
          return;
        }
        // Logged in: reset the counter so future logouts don't inherit it.
        sessionStorage.removeItem("liff_login_attempts");

        setStatus("กำลังโหลดโปรไฟล์...");
        let userId: string | null = null;
        let idToken: string | null = null;
        try {
          const profile = await liff.getProfile();
          userId = profile.userId;
          sessionStorage.setItem("liff_profile", JSON.stringify({
            userId: profile.userId,
            displayName: profile.displayName,
            pictureUrl: profile.pictureUrl,
          }));
        } catch {
          /* ignore profile errors */
        }
        // LIFF id_token — verified server-side against LINE's oauth2/v2.1/verify
        // endpoint using LINE_LOGIN_CHANNEL_ID. When present, edge functions
        // trust its `sub` claim instead of the body's line_user_id.
        try {
          if (typeof liff.getIDToken === "function") {
            idToken = liff.getIDToken() || null;
          }
        } catch {
          /* ignore — id_token is best-effort; server can still verify via Supabase JWT */
        }

        if (userId) {
          setStatus("กำลังตรวจสอบบัญชี...");
          try {
            const { data } = await supabase.functions.invoke("line-link-lookup", {
              body: { line_user_id: userId, id_token: idToken || undefined },
            });
            if (data?.bound) {
              writeBinding({
                phone: data.phone,
                customer_id: data.customer_id,
                customer_source: data.customer_source,
                customer_name: data.customer_name,
                line_user_id: userId,
                linked_at: data.linked_at || new Date().toISOString(),
                status: "linked",
              });
              if (idToken) writeIdToken(idToken);
              try {
                const w = window as any;
                if (w?.liff && typeof w.liff.getFriendship === "function") {
                  const fr = await w.liff.getFriendship();
                  writeFriendshipHint({ is_friend: !!fr?.friendFlag, checked_at: new Date().toISOString() });
                }
              } catch { /* friendship best-effort */ }
              sessionStorage.removeItem("line_link_next");
              if (!cancelled) navigate(next, { replace: true });
              return;
            }
          } catch (e) {
            console.warn("binding lookup failed", e);
          }

          // Not bound yet → auto-bind on first LIFF entry (no phone needed).
          setStatus("กำลังผูกบัญชี LINE...");
          const storedProfile = (() => {
            try { return JSON.parse(sessionStorage.getItem("liff_profile") || "{}"); }
            catch { return {}; }
          })();
          bindCtxRef.current = {
            userId,
            liffId,
            endpoint,
            displayName: storedProfile?.displayName,
            pictureUrl: storedProfile?.pictureUrl,
            idToken: idToken || undefined,
          };
          if (!cancelled) await runAutoBind();
          return;
        }

        if (!cancelled) navigate(next, { replace: true });
      } catch (e: any) {
        console.warn("LIFF init failed", e);
        const message = e?.message || "เชื่อมต่อ LINE ไม่สำเร็จ";
        writeLinkError({ message, code: e?.code });
        await logLineIssue("liff_init_fail", {
          message,
          code: e?.code ?? null,
          liff_id: liffId,
          endpoint,
          origin: typeof window !== "undefined" ? window.location.origin : null,
          href: typeof window !== "undefined" ? window.location.href.slice(0, 500) : null,
        });
        // LIFF ใช้ไม่ได้ (channel not found / 404 / เปิดนอกแอป LINE)
        // → ไม่มี LINE Login แบบเว็บให้ fallback แล้ว (ไม่เคยมี channel จริง)
        //   พาลูกค้าเข้าหน้าร้านซึ่งจะขึ้นขั้นตอน "เพิ่มเพื่อน LINE" ที่ใช้งานได้จริง
        if (!cancelled && shouldFallbackToWebLogin(message, e?.code)) {
          setStatus("กำลังพาเข้าหน้าร้าน...");
          navigate(next, { replace: true });
          return;
        }
        if (!cancelled) {
          setError({ message, code: e?.code });
          setStatus("");
        }
      }

    })();

    return () => { cancelled = true; };
  }, [navigate, next, runAutoBind]);



  function retry() {

    clearLinkError();
    try { sessionStorage.removeItem("liff_login_attempts"); } catch { /* ignore */ }
    if (endpointUrl) {
      try {
        const endpoint = new URL(endpointUrl);
        if (endpoint.origin !== window.location.origin) {
          window.location.assign(endpoint.toString());
          return;
        }
      } catch { /* reload below */ }
    }
    window.location.reload();
  }

  if (error) {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    // Best-effort: send an external report so admins see this on
    // /admin/line-callbacks even without the user pressing anything.
    if (typeof window !== "undefined" && !(window as any).__liff_reported) {
      (window as any).__liff_reported = true;
      try {
        supabase.functions.invoke("line-endpoint-report", {
          body: {
            from: originRef.current,
            endpoint: endpointUrl,
            liff_id: liffIdState,
            code: error.code != null ? String(error.code) : null,
            message: error.message,
            ua: ua.slice(0, 240),
          },
        }).catch(() => { /* ignore */ });
      } catch { /* ignore */ }
    }
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background px-6 py-10 text-center">
        <div className="w-14 h-14 rounded-full grid place-items-center bg-destructive/10">
          <AlertTriangle className="h-7 w-7 text-destructive" />
        </div>
        <div className="max-w-md space-y-1">
          <h1 className="text-lg font-semibold">เชื่อมต่อ LINE ไม่สำเร็จ</h1>
          <p className="text-sm text-muted-foreground break-words">
            {error.message}
            {error.code ? <span className="text-xs opacity-70"> (code {String(error.code)})</span> : null}
          </p>
        </div>
        <div className="grid gap-2 w-full max-w-xs">
          <Button asChild className="w-full">
            <Link to={next}>เข้าหน้าร้าน (เพิ่มเพื่อน LINE ของร้าน)</Link>
          </Button>
          <Button variant="outline" onClick={retry} className="w-full">
            <RefreshCw className="w-4 h-4 mr-1.5" /> ลองเชื่อมต่อ LINE ใหม่
          </Button>



          {endpointUrl ? (
            <Button variant="outline" asChild className="w-full">
              <a href={endpointUrl}>
                <ExternalLink className="w-4 h-4 mr-1.5" /> ไปยังโดเมนหลักของร้าน
              </a>
            </Button>
          ) : null}
          <Button variant="ghost" asChild className="w-full">
            <Link to="/faq/line-oa">
              <HelpCircle className="w-4 h-4 mr-1.5" /> ขั้นตอนแก้ไข / คำถามที่พบบ่อย
            </Link>
          </Button>
        </div>
        <details className="max-w-md w-full text-left text-xs text-muted-foreground/80">
          <summary className="cursor-pointer select-none">รายละเอียดทางเทคนิค (สำหรับส่งให้แอดมิน)</summary>
          <div className="mt-2 space-y-1 rounded-md bg-muted/40 p-3 font-mono break-all">
            <div><span className="opacity-60">from:</span> {originRef.current || "-"}</div>
            <div><span className="opacity-60">endpoint:</span> {endpointUrl || "-"}</div>
            <div><span className="opacity-60">liff_id:</span> {liffIdState}</div>
            {error.code ? <div><span className="opacity-60">code:</span> {String(error.code)}</div> : null}
            <div><span className="opacity-60">ua:</span> {ua.slice(0, 160)}</div>
          </div>
        </details>
      </div>
    );
  }

  if (autoBindError) {
    const msg = String(autoBindError.message || "").toLowerCase();
    const codeStr = String(autoBindError.code ?? "").toLowerCase();
    const diag = diagnoseReason(autoBindError.message, autoBindError.message);
    let reason = diag.hint || "เกิดข้อผิดพลาดที่ไม่คาดคิดระหว่างผูกบัญชี";
    const d = (autoBindError.diagnostic || {}) as Record<string, unknown>;
    const expectedClientId = typeof d.expected_client_id === "string" ? d.expected_client_id : null;
    const tokenAud = typeof d.token_aud === "string" ? d.token_aud : null;
    const isChannelMismatch =
      msg.includes("aud_mismatch") ||
      msg.includes("id_token_invalid") ||
      (expectedClientId && tokenAud && expectedClientId !== tokenAud);
    if (msg.includes("binding_failed") || msg.includes("customer_create")) {
      reason = "ระบบไม่สามารถบันทึกข้อมูลได้ อาจเป็นปัญหาชั่วคราวของเซิร์ฟเวอร์";
    } else if (msg.includes("failed to fetch") || msg.includes("network") || msg.includes("timeout")) {
      reason = "การเชื่อมต่ออินเทอร์เน็ตขัดข้อง กรุณาตรวจสอบสัญญาณแล้วลองใหม่";
    } else if (msg.includes("unauthorized") || codeStr === "401") {
      reason = "เซสชั่น LINE หมดอายุ กรุณาปิดหน้าแล้วเปิดลิงก์ใหม่จากแอป LINE";
    } else if (isChannelMismatch) {
      reason = "ตั้งค่า LINE Login Channel ไม่ตรงกับ LIFF app — เข้าสู่ระบบ LINE ใหม่อีกครั้ง หากยังไม่หายให้แจ้งแอดมินตรวจ /admin/line-settings";
    } else if (msg.includes("server_misconfigured_login_channel_id")) {
      reason = "เซิร์ฟเวอร์ยังไม่ได้ตั้ง LINE_LOGIN_CHANNEL_ID — แจ้งแอดมิน";
    }
    const diagText = JSON.stringify(autoBindError.diagnostic, null, 2);
    async function copyDiag() {
      try {
        await navigator.clipboard.writeText(diagText);
        toast.success("คัดลอกแล้ว ส่งให้แอดมินได้เลย");
      } catch {
        toast.error("คัดลอกไม่สำเร็จ");
      }
    }
    function reLoginLine() {
      try { sessionStorage.removeItem(STALE_RECOVERY_KEY); } catch { /* ignore */ }
      clearLineSession();
      try {
        const w = window as any;
        if (w?.liff?.isLoggedIn?.() && typeof w.liff.logout === "function") w.liff.logout();
      } catch { /* ignore */ }
      window.location.reload();
    }
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background px-6 py-10 text-center">
        <div className="w-14 h-14 rounded-full grid place-items-center bg-destructive/10">
          <AlertTriangle className="h-7 w-7 text-destructive" />
        </div>
        <div className="max-w-md space-y-1">
          <h1 className="text-lg font-semibold">เชื่อมบัญชี LINE ไม่สำเร็จ</h1>
          <p className="text-sm text-muted-foreground break-words">{reason}</p>
          {autoBindError.code ? (
            <p className="text-xs opacity-60">code: {String(autoBindError.code)}</p>
          ) : null}
        </div>

        <div className="max-w-md w-full text-left rounded-xl border border-border bg-muted/30 p-4 text-sm space-y-1.5">
          <div className="font-medium text-foreground">คำแนะนำแก้ไข:</div>
          <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
            <li>ตรวจสอบสัญญาณอินเทอร์เน็ตของคุณ</li>
            <li>ปิดแล้วเปิดแอป LINE ใหม่ จากนั้นกดลิงก์ร้านอีกครั้ง</li>
            <li>หากยังไม่ได้ ให้กด "กรอกเบอร์เพื่อผูกด้วยตนเอง" ด้านล่าง</li>
          </ol>
        </div>

        <div className="grid gap-2 w-full max-w-xs">
          <Button onClick={runAutoBind} disabled={autoBindRetrying} className="w-full">
            {autoBindRetrying
              ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              : <RefreshCw className="w-4 h-4 mr-1.5" />}
            ลองผูกอีกครั้ง
          </Button>
          {isChannelMismatch ? (
            <Button variant="secondary" onClick={reLoginLine} className="w-full">
              <RefreshCw className="w-4 h-4 mr-1.5" /> เข้าสู่ระบบ LINE ใหม่
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => navigate("/l/link", { replace: true })} className="w-full">
            <Phone className="w-4 h-4 mr-1.5" /> กรอกเบอร์เพื่อผูกเอง
          </Button>
          <Button variant="ghost" onClick={copyDiag} className="w-full">
            <Copy className="w-4 h-4 mr-1.5" /> คัดลอก diagnostic log
          </Button>
        </div>

        <details className="max-w-md w-full text-left text-xs text-muted-foreground/80">
          <summary className="cursor-pointer select-none">รายละเอียดทางเทคนิค (สำหรับส่งให้แอดมิน)</summary>
          <pre className="mt-2 rounded-md bg-muted/40 p-3 font-mono text-[11px] break-all whitespace-pre-wrap">{diagText}</pre>
        </details>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <div
        data-testid="liff-connect-status"
        data-mode={connectMode}
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-4 shadow-sm"
      >
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-semibold text-foreground">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[hsl(var(--success))]" aria-hidden />
          {connectMode === "web" ? "กำลังเข้าสู่ระบบด้วยเว็บ (LINE Login)" : "กำลังเชื่อมต่อผ่านแอป LINE (LIFF)"}
        </span>
        <p className="mt-3 text-base font-semibold text-foreground" aria-live="polite">{status}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {connectMode === "web"
            ? "ระบบกำลังพาไปหน้าเข้าสู่ระบบ LINE บนเว็บ แล้วจะกลับมาที่หน้าร้านอัตโนมัติ"
            : "กำลังตรวจสอบบัญชี LINE ของคุณกับร้าน — ใช้เวลาสักครู่"}
        </p>
      </div>
    </div>
  );
}


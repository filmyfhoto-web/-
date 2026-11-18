import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import SeoHead from "@/components/SeoHead";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, ExternalLink, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Loader2, ShieldCheck, ShieldAlert, History, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import LiffDomainSyncCard from "@/components/admin/LiffDomainSyncCard";
import {
  validateWebhookUrl,
  validateLiffEndpoint,
  summarize,
  type ValidationLevel,
  type ValidationResult,
} from "@/lib/lineUrlValidation";

type OaSettings = {
  basic_id: string | null;
  liff_id: string | null;
  liff_endpoint_url: string | null;
  liff_callback_urls?: string[] | null;
};

type ConfigCheck = {
  ok?: boolean;
  messagingChannelSecretShape?: string;
  accessTokenShape?: string;
  adminShape?: string;
  [k: string]: unknown;
};

type ProbeState = {
  loading: boolean;
  ok?: boolean;
  status?: number;
  latency_ms?: number;
  hint?: string;
  checked_at?: string;
};

type HistoryRow = {
  id: string;
  event: string;
  detail: {
    url?: string;
    ok?: boolean;
    status?: number;
    latency_ms?: number;
    hint?: string;
  };
  created_at: string;
};

type ExternalReport = {
  id: string;
  created_at: string;
  detail: {
    from?: string;
    endpoint?: string;
    liff_id?: string;
    code?: string | number | null;
    message?: string | null;
    ua?: string;
    ip?: string;
  };
};

type AuditRow = {
  id: string;
  user_id: string | null;
  action: string;
  detail: any;
  created_at: string;
  actor_email?: string | null;
  actor_name?: string | null;
};

type CallbackFailureRow = {
  id: string;
  action: string;
  detail: any;
  created_at: string;
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s} วินาทีที่แล้ว`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} นาทีที่แล้ว`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ชั่วโมงที่แล้ว`;
  const d = Math.floor(h / 24);
  return `${d} วันที่แล้ว`;
}

function useCopy() {
  return async (value: string, label = "URL") => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`คัดลอก${label}แล้ว`);
    } catch {
      toast.error("คัดลอกไม่สำเร็จ");
    }
  };
}

function shapeBadge(shape: string | undefined, okValues: string[]) {
  if (!shape) return <Badge variant="outline">ไม่ทราบ</Badge>;
  if (shape === "missing")
    return (
      <Badge className="bg-rose-100 text-rose-800 border-rose-200 border">
        <XCircle className="w-3 h-3 mr-1" /> ยังไม่ตั้งค่า
      </Badge>
    );
  if (okValues.includes(shape))
    return (
      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 border">
        <CheckCircle2 className="w-3 h-3 mr-1" /> พร้อมใช้งาน
      </Badge>
    );
  return (
    <Badge className="bg-amber-100 text-amber-800 border-amber-200 border">
      <AlertTriangle className="w-3 h-3 mr-1" /> รูปแบบผิด
    </Badge>
  );
}

function optionalShapeBadge(shape: string | undefined, okValues: string[]) {
  if (!shape || shape === "missing") {
    return (
      <Badge className="bg-slate-100 text-slate-600 border-slate-200 border">
        ไม่จำเป็น
      </Badge>
    );
  }
  return shapeBadge(shape, okValues);
}

function levelBadge(level: ValidationLevel) {
  if (level === "ok")
    return (
      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 border">
        <CheckCircle2 className="w-3 h-3 mr-1" /> พร้อมใช้งาน
      </Badge>
    );
  if (level === "warn")
    return (
      <Badge className="bg-amber-100 text-amber-800 border-amber-200 border">
        <AlertTriangle className="w-3 h-3 mr-1" /> ควรตรวจสอบ
      </Badge>
    );
  return (
    <Badge className="bg-rose-100 text-rose-800 border-rose-200 border">
      <XCircle className="w-3 h-3 mr-1" /> ผิดรูปแบบ
    </Badge>
  );
}

function IssuesList({ result, probe }: { result: ValidationResult; probe?: ProbeState }) {
  const items: { tone: ValidationLevel; text: string }[] = result.issues.map((t) => ({
    tone: result.level,
    text: t,
  }));
  if (probe && !probe.loading) {
    if (probe.ok) {
      items.push({
        tone: "ok",
        text: `เข้าถึงได้ (HTTP ${probe.status}, ${probe.latency_ms}ms)`,
      });
    } else {
      items.push({
        tone: "error",
        text: `เข้าถึงไม่ได้: ${probe.hint || `HTTP ${probe.status}`}`,
      });
    }
  }
  if (items.length === 0) return null;
  return (
    <ul className="text-xs space-y-1 mt-1">
      {items.map((it, i) => (
        <li
          key={i}
          className={
            it.tone === "ok"
              ? "text-emerald-700"
              : it.tone === "warn"
              ? "text-amber-700"
              : "text-rose-700"
          }
        >
          • {it.text}
        </li>
      ))}
    </ul>
  );
}

function UrlCard({
  title,
  where,
  value,
  extra,
  badge,
  consoleUrl,
}: {
  title: string;
  where: string;
  value: string;
  extra?: React.ReactNode;
  badge?: React.ReactNode;
  consoleUrl?: string;
}) {
  const copy = useCopy();
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-slate-900">{title}</div>
          <div className="text-xs text-slate-500 mt-0.5">{where}</div>
        </div>
        {badge}
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 break-all font-mono">
          {value || "— ยังไม่พร้อม —"}
        </code>
        <Button size="sm" variant="outline" disabled={!value} onClick={() => copy(value, title)}>
          <Copy className="w-4 h-4" />
        </Button>
        {consoleUrl && (
          <Button size="sm" variant="outline" asChild>
            <a href={consoleUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="w-4 h-4" />
            </a>
          </Button>
        )}
      </div>
      {extra}
    </div>
  );
}

// Builds a LINE Login authorize URL from the current channel_id + one of the
function CopyCallbackButton({ value }: { value: string }) {
  const copy = useCopy();
  return (
    <Button
      className="w-full"
      disabled={!value}
      onClick={() => copy(value, "LINE Login Callback URL")}
    >
      <Copy className="w-4 h-4 mr-2" />
      คัดลอก LINE Login Callback URL
    </Button>
  );
}

// Builds a LINE Login authorize URL from the current channel_id + one of the
// configured LIFF callback URLs. This is a helper for admins to test the OAuth
// flow end-to-end; it doesn't change any server behavior on its own.
function AuthorizeUrlBuilder({
  channelId,
  allowedCallbacks,
  defaultCallback,
}: {
  channelId: string;
  allowedCallbacks: string[];
  defaultCallback: string;
}) {
  const copy = useCopy();
  const [callback, setCallback] = useState<string>(defaultCallback || allowedCallbacks[0] || "");
  const [customCallback, setCustomCallback] = useState<string>("");
  const [useCustom, setUseCustom] = useState(false);
  const [state, setState] = useState<string>(() =>
    (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)),
  );
  const [botPrompt, setBotPrompt] = useState<"" | "normal" | "aggressive">("aggressive");
  const [scOpenid, setScOpenid] = useState(true);
  const [scProfile, setScProfile] = useState(true);
  const [scEmail, setScEmail] = useState(false);

  const effectiveCallback = useCustom ? customCallback.trim() : callback;
  const scopes = [scOpenid && "openid", scProfile && "profile", scEmail && "email"]
    .filter(Boolean)
    .join(" ");
  const inAllowlist =
    !effectiveCallback ||
    allowedCallbacks.some((u) => u.trim() === effectiveCallback.trim());

  const url = useMemo(() => {
    if (!channelId || !effectiveCallback || !scopes || !state) return "";
    const p = new URLSearchParams();
    p.set("response_type", "code");
    p.set("client_id", channelId);
    p.set("redirect_uri", effectiveCallback);
    p.set("state", state);
    if (botPrompt) p.set("bot_prompt", botPrompt);
    p.set("scope", scopes);
    return `https://access.line.me/oauth2/v2.1/authorize?${p.toString()}`;
  }, [channelId, effectiveCallback, state, botPrompt, scopes]);

  async function logOpen() {
    try {
      await supabase.from("activity_logs" as any).insert({
        action: "line.authorize_url_opened",
        target_type: "line_login",
        detail: {
          callback: effectiveCallback,
          bot_prompt: botPrompt || null,
          scope: scopes,
          in_allowlist: inAllowlist,
        },
      });
    } catch (e) {
      console.warn("activity_logs insert failed", e);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
      <div>
        <div className="font-semibold text-slate-900">
          LINE Login authorize URL (สำหรับทดสอบ)
        </div>
        <div className="text-xs text-slate-500 mt-0.5">
          ประกอบ URL จาก <code>LINE_LOGIN_CHANNEL_ID</code> + callback ที่ตั้งไว้ในระบบ — ใช้กดทดสอบ flow ได้ทันที
        </div>
      </div>

      {!channelId && (
        <div className="text-xs bg-rose-50 border border-rose-200 text-rose-800 rounded-lg px-3 py-2">
          ยังไม่มี <code>LINE_LOGIN_CHANNEL_ID</code> — ตั้งค่าที่ <a className="underline" href="/admin/line-secret-vault">/admin/line-secret-vault</a> ก่อน
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-xs text-slate-600 space-y-1">
          <div className="font-medium text-slate-700">Callback URL</div>
          {!useCustom ? (
            <select
              className="w-full border border-slate-200 rounded-lg px-2 py-2 text-xs bg-white"
              value={callback}
              onChange={(e) => setCallback(e.target.value)}
            >
              {allowedCallbacks.length === 0 && <option value="">— ไม่มี allowlist —</option>}
              {allowedCallbacks.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="w-full border border-slate-200 rounded-lg px-2 py-2 text-xs font-mono"
              placeholder="https://…"
              value={customCallback}
              onChange={(e) => setCustomCallback(e.target.value)}
            />
          )}
          <label className="flex items-center gap-1 text-[11px] text-slate-500 mt-1">
            <input type="checkbox" checked={useCustom} onChange={(e) => setUseCustom(e.target.checked)} />
            ใช้ URL อื่น (custom)
          </label>
        </label>

        <label className="text-xs text-slate-600 space-y-1">
          <div className="font-medium text-slate-700">State</div>
          <div className="flex gap-2">
            <input
              className="flex-1 border border-slate-200 rounded-lg px-2 py-2 text-xs font-mono"
              value={state}
              onChange={(e) => setState(e.target.value)}
            />
            <Button
              size="sm"
              variant="outline"
              type="button"
              onClick={() =>
                setState(globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2))
              }
            >
              <RefreshCw className="w-3 h-3" />
            </Button>
          </div>
        </label>

        <label className="text-xs text-slate-600 space-y-1">
          <div className="font-medium text-slate-700">bot_prompt</div>
          <select
            className="w-full border border-slate-200 rounded-lg px-2 py-2 text-xs bg-white"
            value={botPrompt}
            onChange={(e) => setBotPrompt(e.target.value as any)}
          >
            <option value="">— ไม่ส่ง —</option>
            <option value="normal">normal (ปุ่ม add friend)</option>
            <option value="aggressive">aggressive (บังคับหน้า add friend)</option>
          </select>
        </label>

        <div className="text-xs text-slate-600 space-y-1">
          <div className="font-medium text-slate-700">Scope</div>
          <div className="flex flex-wrap gap-3 pt-1">
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={scOpenid} onChange={(e) => setScOpenid(e.target.checked)} />
              openid
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={scProfile} onChange={(e) => setScProfile(e.target.checked)} />
              profile
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={scEmail} onChange={(e) => setScEmail(e.target.checked)} />
              email
            </label>
          </div>
        </div>
      </div>

      {!inAllowlist && effectiveCallback && (
        <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Callback นี้ไม่อยู่ใน <code>liff_callback_urls</code> allowlist — LINE อาจปฏิเสธ (invalid_request)
          </span>
        </div>
      )}

      <div>
        <div className="text-xs font-medium text-slate-700 mb-1">URL ที่ประกอบได้</div>
        <code className="block text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 break-all font-mono">
          {url || "— กรอกข้อมูลให้ครบก่อน —"}
        </code>
        <div className="flex gap-2 mt-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!url}
            onClick={() => copy(url, "authorize URL")}
          >
            <Copy className="w-4 h-4 mr-1" /> คัดลอก
          </Button>
          <Button
            size="sm"
            disabled={!url}
            onClick={() => {
              void logOpen();
              window.open(url, "_blank", "noopener,noreferrer");
            }}
          >
            <ExternalLink className="w-4 h-4 mr-1" /> ทดสอบ (เปิดแท็บใหม่)
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function AdminLineCallbacks() {
  const [origin, setOrigin] = useState("");
  const [oa, setOa] = useState<OaSettings | null>(null);
  const [cfg, setCfg] = useState<ConfigCheck | null>(null);
  const [lastWebhookAt, setLastWebhookAt] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [webhookProbe, setWebhookProbe] = useState<ProbeState>({ loading: false });
  const [liffProbe, setLiffProbe] = useState<ProbeState>({ loading: false });
  const [toastedFor, setToastedFor] = useState<string>("");
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [reports, setReports] = useState<ExternalReport[]>([]);
  const [unreachableRecently, setUnreachableRecently] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [monitorRan, setMonitorRan] = useState(false);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [failures, setFailures] = useState<CallbackFailureRow[]>([]);
  const [failuresLoading, setFailuresLoading] = useState(false);
  const [auditQuery, setAuditQuery] = useState("");
  const [auditFrom, setAuditFrom] = useState("");
  const [auditTo, setAuditTo] = useState("");
  const [auditActor, setAuditActor] = useState("");

  const projectRef = (import.meta.env.VITE_SUPABASE_PROJECT_ID as string) || "";
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || "";

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const [{ data: probes }, { data: ext }, { data: alerts }] = await Promise.all([
        supabase
        .from("line_login_diagnostics")
        .select("id, event, detail, created_at")
        .like("event", "endpoint_probe:%")
        .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("line_login_diagnostics")
          .select("id, detail, created_at")
          .eq("event", "external_liff_report")
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("line_login_diagnostics")
          .select("id, created_at")
          .eq("event", "line_endpoint_unreachable")
          .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
          .limit(1),
      ]);
      setHistory((probes as HistoryRow[] | null) ?? []);
      setReports((ext as ExternalReport[] | null) ?? []);
      setUnreachableRecently(!!(alerts && alerts.length > 0));
    } catch (e) {
      console.warn("history load error", e);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function loadAudit() {
    setAuditLoading(true);
    try {
      const { data: rowsRaw } = await supabase
        .from("activity_logs" as any)
        .select("id, user_id, action, detail, created_at")
        .in("action", ["line.secret_update_request", "line.liff_settings_update"])
        .order("created_at", { ascending: false })
        .limit(50);
      const list = ((rowsRaw as unknown) as AuditRow[] | null) ?? [];
      const uids = Array.from(new Set(list.map((r) => r.user_id).filter(Boolean))) as string[];
      let profileMap: Record<string, { email: string | null; full_name: string | null }> = {};
      if (uids.length > 0) {
        const { data: profs } = await supabase
          .from("profiles" as any)
          .select("id, email, full_name")
          .in("id", uids);
        for (const p of (profs as any[]) ?? []) {
          profileMap[p.id] = { email: p.email ?? null, full_name: p.full_name ?? null };
        }
      }
      setAudit(
        list.map((r) => ({
          ...r,
          actor_email: r.user_id ? profileMap[r.user_id]?.email ?? null : null,
          actor_name: r.user_id ? profileMap[r.user_id]?.full_name ?? null : null,
        })),
      );
    } catch (e) {
      console.warn("audit load error", e);
    } finally {
      setAuditLoading(false);
    }
  }

  async function loadFailures() {
    setFailuresLoading(true);
    try {
      const { data } = await supabase
        .from("activity_logs" as any)
        .select("id, action, detail, created_at")
        .eq("action", "line.callback_failure")
        .order("created_at", { ascending: false })
        .limit(50);
      setFailures(((data as unknown) as CallbackFailureRow[] | null) ?? []);
    } catch (e) {
      console.warn("failures load error", e);
    } finally {
      setFailuresLoading(false);
    }
  }

  const filteredAudit = useMemo(() => {
    const q = auditQuery.trim().toLowerCase();
    const actor = auditActor.trim().toLowerCase();
    const fromMs = auditFrom ? new Date(auditFrom).getTime() : null;
    const toMs = auditTo ? new Date(auditTo).getTime() + 24 * 60 * 60 * 1000 : null;
    return audit.filter((r) => {
      const ts = new Date(r.created_at).getTime();
      if (fromMs != null && ts < fromMs) return false;
      if (toMs != null && ts > toMs) return false;
      if (actor) {
        const hay = `${r.actor_email ?? ""} ${r.actor_name ?? ""} ${r.user_id ?? ""}`.toLowerCase();
        if (!hay.includes(actor)) return false;
      }
      if (q) {
        const hay = `${r.action} ${JSON.stringify(r.detail ?? {})}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [audit, auditQuery, auditActor, auditFrom, auditTo]);

  const webhookUrl = useMemo(() => {
    if (projectRef) return `https://${projectRef}.functions.supabase.co/line-webhook`;
    if (supabaseUrl) return `${supabaseUrl.replace(/\/$/, "")}/functions/v1/line-webhook`;
    return "";
  }, [projectRef, supabaseUrl]);

  const liffEndpoint = oa?.liff_endpoint_url || (origin ? `${origin}/liff/link` : "");
  // The server endpoint LINE must redirect back to after customer login.
  // If this exact string is not in the LINE Login channel's Callback URL
  // list, LINE answers the authorize request with
  // "400 Bad Request — Invalid redirect_uri value".
  const loginCallbackUrl = useMemo(() => {
    if (supabaseUrl) return `${supabaseUrl.replace(/\/$/, "")}/functions/v1/line-oauth-callback`;
    if (projectRef) return `https://${projectRef}.functions.supabase.co/line-oauth-callback`;
    return "";
  }, [projectRef, supabaseUrl]);
  const statusUrl = origin ? `${origin}/me/line-status` : "";
  const addFriendUrl = oa?.basic_id
    ? `https://line.me/R/ti/p/${oa.basic_id.startsWith("@") ? oa.basic_id : `@${oa.basic_id}`}`
    : "";

  const webhookValidation = useMemo(
    () =>
      validateWebhookUrl(webhookUrl, {
        projectRef,
        channelSecretShape: cfg?.messagingChannelSecretShape,
      }),
    [webhookUrl, projectRef, cfg?.messagingChannelSecretShape],
  );
  const liffValidation = useMemo(
    () =>
      validateLiffEndpoint(liffEndpoint, {
        expectedOrigin: origin,
        allowList: oa?.liff_callback_urls ?? [],
        liffId: oa?.liff_id ?? null,
      }),
    [liffEndpoint, origin, oa?.liff_callback_urls, oa?.liff_id],
  );
  const summary = useMemo(
    () => summarize([webhookValidation, liffValidation]),
    [webhookValidation, liffValidation],
  );

  async function refresh() {
    setLoading(true);
    try {
      const [oaRes, cfgRes, whRes, pendRes] = await Promise.all([
        supabase
          .from("line_oa_settings")
          .select("basic_id, liff_id, liff_endpoint_url, liff_callback_urls")
          .limit(1)
          .maybeSingle(),
        supabase.functions.invoke("line-config-check", { body: {} }),
        supabase
          .from("line_webhook_events")
          .select("received_at")
          .order("received_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("line_account_links")
          .select("line_user_id", { count: "exact", head: true })
          .is("verified_at", null),
      ]);
      setOa((oaRes.data as OaSettings | null) ?? null);
      setCfg((cfgRes.data as ConfigCheck | null) ?? null);
      setLastWebhookAt(((whRes.data as { received_at?: string } | null)?.received_at) ?? null);
      setPendingCount(pendRes.count ?? 0);
      await loadHistory();
      loadAudit();
      loadFailures();
    } catch (e) {
      console.warn("line-callbacks refresh error", e);
    } finally {
      setLoading(false);
    }
  }

  async function runProbes(webhook: string, liff: string) {
    if (webhook) {
      setWebhookProbe({ loading: true });
      supabase.functions
        .invoke("line-endpoint-probe", { body: { url: webhook, kind: "webhook" } })
        .then(({ data, error }) => {
          if (error) {
            setWebhookProbe({ loading: false, ok: false, hint: error.message });
          } else {
            setWebhookProbe({
              loading: false,
              ok: !!(data as any)?.ok,
              status: (data as any)?.status,
              latency_ms: (data as any)?.latency_ms,
              hint: (data as any)?.hint,
              checked_at: new Date().toISOString(),
            });
          }
          loadHistory();
        });
    }
    if (liff) {
      setLiffProbe({ loading: true });
      supabase.functions
        .invoke("line-endpoint-probe", { body: { url: liff, kind: "liff" } })
        .then(({ data, error }) => {
          if (error) {
            setLiffProbe({ loading: false, ok: false, hint: error.message });
          } else {
            setLiffProbe({
              loading: false,
              ok: !!(data as any)?.ok,
              status: (data as any)?.status,
              latency_ms: (data as any)?.latency_ms,
              hint: (data as any)?.hint,
              checked_at: new Date().toISOString(),
            });
          }
          loadHistory();
        });
    }
  }

  useEffect(() => {
    setOrigin(window.location.origin);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-run reachability probes once URLs are known
  useEffect(() => {
    if (webhookUrl || liffEndpoint) runProbes(webhookUrl, liffEndpoint);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webhookUrl, liffEndpoint]);

  // Trigger the server-side endpoint monitor once so the dashboard reflects
  // the current reachability state without waiting for the next cron tick.
  useEffect(() => {
    if (monitorRan) return;
    setMonitorRan(true);
    supabase.functions
      .invoke("line-endpoint-monitor", { body: { source: "admin-dashboard" } })
      .then(() => loadHistory())
      .catch(() => {
        /* non-fatal — cron will pick it up */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monitorRan]);

  async function clearOldReports() {
    setClearing(true);
    try {
      // Delete stale external LIFF error reports older than 1 hour so the
      // dashboard only surfaces reports that are still relevant.
      const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { error } = await supabase
        .from("line_login_diagnostics")
        .delete()
        .eq("event", "external_liff_report")
        .lt("created_at", cutoff);
      if (error) throw error;
      toast.success("ล้างรายงานเก่าเรียบร้อย");
      await loadHistory();
    } catch (e: any) {
      toast.error(`ล้างไม่สำเร็จ: ${e?.message ?? "unknown"}`);
    } finally {
      setClearing(false);
    }
  }

  // Aggregate readiness: config check + both probes ok
  const systemReady =
    !!cfg?.ok &&
    (cfg as any)?.messaging_ready === true &&
    (cfg as any)?.webhook_secret_ok === true &&
    (cfg as any)?.admin_ready === true &&
    webhookProbe.ok !== false &&
    liffProbe.ok !== false &&
    !unreachableRecently;

  // Toast once when validation error/warn appears
  useEffect(() => {
    const key = `${webhookValidation.level}:${liffValidation.level}:${summary.count}`;
    if (toastedFor === key) return;
    if (webhookValidation.level === "error") {
      toast.error(`Webhook URL: ${webhookValidation.issues[0] ?? "รูปแบบไม่ถูกต้อง"}`);
    } else if (liffValidation.level === "error") {
      toast.error(`LIFF Endpoint: ${liffValidation.issues[0] ?? "รูปแบบไม่ถูกต้อง"}`);
    } else if (summary.level === "warn") {
      toast.warning(`พบ ${summary.count} คำเตือนเกี่ยวกับการตั้งค่า URL`);
    }
    setToastedFor(key);
  }, [webhookValidation, liffValidation, summary, toastedFor]);

  return (
    <AdminLayout>
      <SeoHead
        title="URL เรียกกลับ LINE"
        description="URL สำหรับตั้งค่าใน LINE Developers Console"
        path="/admin/line-callbacks"
      />
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">URL เรียกกลับ LINE</h1>
          <p className="text-sm text-slate-500 mt-1">
            คัดลอก URL ด้านล่างไปวางใน LINE Developers Console เพื่อให้ระบบ webhook / LIFF / เพิ่มเพื่อน OA ทำงาน
          </p>
        </div>
        <Button variant="outline" asChild>
          <a href="/admin/line-login-logs">
            <History className="w-4 h-4 mr-2" /> บันทึกการเข้าสู่ระบบ LINE
          </a>
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            refresh();
            runProbes(webhookUrl, liffEndpoint);
          }}
          disabled={loading}
        >
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          ตรวจอีกครั้ง
        </Button>
      </div>
      <div className="mb-4">
        <LiffDomainSyncCard onSynced={refresh} />
      </div>

      {unreachableRecently && (
        <div className="rounded-2xl border p-4 mb-4 flex items-start gap-3 bg-rose-50 border-rose-300 text-rose-900">
          <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
          <div className="text-sm">
            <div className="font-semibold">พบ endpoint ตอบ 404/5xx ในชั่วโมงล่าสุด</div>
            <div className="text-xs mt-1">
              ตรวจ URL ที่ตั้งใน LINE Console กับ URL ในระบบให้ตรงกัน แล้วกด "ตรวจอีกครั้ง" ด้านบน — ดูรายละเอียดที่ตาราง "ประวัติการทดสอบล่าสุด"
            </div>
          </div>
        </div>
      )}

      {systemReady && !unreachableRecently && (
        <div className="rounded-2xl border p-4 mb-4 flex items-start gap-3 bg-emerald-50 border-emerald-300 text-emerald-900">
          <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0" />
          <div className="text-sm">
            <div className="font-semibold">✅ ระบบพร้อมใช้งาน</div>
            <div className="text-xs mt-1">
              Secret, Webhook signature, Admin OA และ LIFF endpoint ผ่านการทดสอบทั้งหมด — ระบบ LINE พร้อมรับลูกค้า
            </div>
          </div>
        </div>
      )}

      {(() => {
        const env = (cfg as any)?.env as Record<string, string> | undefined;
        if (!env) return null;
        const loginIdProblem = env.login_channel_id && env.login_channel_id !== "digits_ok";
        const loginSecretProblem = env.login_channel_secret && env.login_channel_secret !== "hex32_ok";
        if (!loginIdProblem && !loginSecretProblem) return null;
        return (
          <div className="rounded-2xl border p-4 mb-4 flex items-start gap-3 bg-amber-50 border-amber-300 text-amber-900">
            <ShieldAlert className="w-5 h-5 mt-0.5 shrink-0" />
            <div className="text-sm flex-1">
              <div className="font-semibold">ตรวจค่า LINE Login channel</div>
              <div className="text-xs mt-1 leading-relaxed">
                {loginIdProblem && (
                  <div>• <code>LINE_LOGIN_CHANNEL_ID</code> ยังไม่ถูกต้อง — ต้องเป็นตัวเลข 8–15 หลัก</div>
                )}
                {loginSecretProblem && (
                  <div>• <code>LINE_LOGIN_CHANNEL_SECRET</code> ยังไม่ถูกต้อง — ต้อง hex 32 ตัว</div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      <div
        className={`rounded-2xl border p-4 mb-4 flex items-center gap-3 ${
          summary.level === "ok"
            ? "bg-emerald-50 border-emerald-200 text-emerald-800"
            : summary.level === "warn"
            ? "bg-amber-50 border-amber-200 text-amber-800"
            : "bg-rose-50 border-rose-200 text-rose-800"
        }`}
      >
        {summary.level === "ok" ? (
          <ShieldCheck className="w-5 h-5" />
        ) : (
          <ShieldAlert className="w-5 h-5" />
        )}
        <div className="text-sm font-medium">
          {summary.level === "ok"
            ? "การตั้งค่า URL ทั้งหมดพร้อมใช้งาน"
            : `พบ ${summary.count} รายการที่ต้องแก้ไข`}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 mb-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500">Webhook ล่าสุดที่รับ event</div>
          <div className="text-base font-semibold text-slate-900 mt-1">
            {lastWebhookAt ? new Date(lastWebhookAt).toLocaleString("th-TH") : "ยังไม่เคยได้รับ"}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500">Binding ที่ยังไม่ยืนยัน</div>
          <div className="text-base font-semibold text-slate-900 mt-1">
            {pendingCount ?? "-"} รายการ
          </div>
        </div>
      </div>

      <div className="grid gap-4">
        <UrlCard
          title="Messaging API Webhook URL"
          where="LINE Developers → Messaging API channel → Webhook settings → Webhook URL (แล้วเปิด Use webhook)"
          value={webhookUrl}
          consoleUrl="https://developers.line.biz/console/"
          badge={
            <div className="flex items-center gap-2">
              {webhookProbe.loading && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
              {levelBadge(webhookValidation.level)}
            </div>
          }
          extra={
            <>
              <IssuesList result={webhookValidation} probe={webhookProbe} />
              <div className="text-[11px] text-slate-400 mt-1">
                ต้องตั้ง secret <code>LINE_CHANNEL_SECRET</code> ให้ตรงกับ channel เดียวกัน
              </div>
            </>
          }
        />

        <UrlCard
          title="LIFF Endpoint URL (ผูกบัญชี)"
          where="LINE Developers → LIFF app → Endpoint URL"
          value={liffEndpoint}
          consoleUrl="https://developers.line.biz/console/"
          badge={
            <div className="flex items-center gap-2">
              {liffProbe.loading && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
              {levelBadge(liffValidation.level)}
            </div>
          }
          extra={
            <>
              <IssuesList result={liffValidation} probe={liffProbe} />
              <div className="text-[11px] text-slate-400 mt-1">
                LIFF ID ปัจจุบัน: <code>{oa?.liff_id || "ยังไม่ตั้งค่า"}</code>
              </div>
            </>
          }
        />

        <UrlCard
          title="หน้าสถานะสำหรับลูกค้า"
          where="แชร์ให้ลูกค้าไว้เช็คสถานะการผูก / กดลองใหม่"
          value={statusUrl}
        />

        <UrlCard
          title="LINE Login Callback URL (ลูกค้าเข้าสู่ระบบ) — จำเป็น"
          where="LINE Developers → LINE Login channel → LINE Login → Callback URL (วางบรรทัดนี้ให้ตรงทุกตัวอักษร)"
          value={loginCallbackUrl}
          consoleUrl="https://developers.line.biz/console/"
          extra={
            <div className="space-y-2">
              <CopyCallbackButton value={loginCallbackUrl} />
              <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 leading-relaxed">
              ถ้ายังไม่ได้ใส่ URL นี้ ปุ่ม “เข้าสู่ระบบด้วย LINE” ของลูกค้าจะเด้งหน้า LINE ขึ้นว่า
              <b> 400 Bad Request — Invalid redirect_uri value</b> และเข้าหน้าลูกค้าไม่ได้
              </div>
            </div>
          }
        />

        <UrlCard
          title="URL เพิ่มเพื่อน OA"
          where="ใช้ในอีเมล / ปุ่มเชิญให้ลูกค้ากดเป็นเพื่อน OA"
          value={addFriendUrl}
          extra={
            !oa?.basic_id ? (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                ตั้ง <code>basic_id</code> ของ OA ที่ <a className="underline" href="/admin/line-settings">/admin/line-settings</a> ก่อน
              </div>
            ) : undefined
          }
        />

        <AuthorizeUrlBuilder
          channelId={((cfg as any)?.login_channel_id_value as string) || ""}
          allowedCallbacks={(oa?.liff_callback_urls ?? []).filter(Boolean)}
          defaultCallback={
            (oa?.liff_callback_urls ?? []).find((u) => u && u.includes("/auth/line/callback")) ||
            oa?.liff_callback_urls?.[0] ||
            ""
          }
        />

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="font-semibold text-slate-900 mb-3">สถานะ Secret</div>
          <div className="grid gap-2 text-sm">
            <div className="flex items-center justify-between">
              <span>LINE_CHANNEL_SECRET</span>
              {shapeBadge(cfg?.messagingChannelSecretShape as string | undefined, ["hex32_ok"])}
            </div>
            <div className="flex items-center justify-between">
              <span>LINE_CHANNEL_ACCESS_TOKEN</span>
              {shapeBadge(cfg?.accessTokenShape as string | undefined, ["set_long"])}
            </div>
            <div className="flex items-center justify-between">
              <span>LINE_ADMIN_USER_ID</span>
              {shapeBadge(cfg?.adminShape as string | undefined, ["u_hex32_ok"])}
            </div>
            <div className="pt-2 mt-1 border-t border-slate-100 text-[11px] text-slate-500">
              LINE Login channel (สำหรับ LIFF / ผูกบัญชี)
            </div>
            <div className="flex items-center justify-between">
              <span>LINE_LOGIN_CHANNEL_ID</span>
              {shapeBadge((cfg as any)?.env?.login_channel_id, ["digits_ok"])}
            </div>
            <div className="flex items-center justify-between">
              <span>LINE_LOGIN_CHANNEL_SECRET</span>
              {shapeBadge((cfg as any)?.env?.login_channel_secret, ["hex32_ok"])}
            </div>
            <div className="flex items-center justify-between">
              <span>
                LINE_LOGIN_CHANNEL_TOKEN
                <span className="ml-1 text-[10px] text-slate-400">(debug-only)</span>
              </span>
              {optionalShapeBadge((cfg as any)?.env?.login_channel_token, ["set_long", "set_short"])}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-slate-500" />
              <div className="font-semibold text-slate-900">ประวัติการทดสอบล่าสุด</div>
              <span className="text-xs text-slate-400">(20 รายการล่าสุด)</span>
            </div>
            <Button size="sm" variant="outline" onClick={loadHistory} disabled={historyLoading}>
              {historyLoading ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3 mr-1" />
              )}
              รีเฟรช
            </Button>
          </div>
          {history.length === 0 ? (
            <div className="text-sm text-slate-400 py-6 text-center">
              ยังไม่มีประวัติการทดสอบ — กด "ตรวจอีกครั้ง" ด้านบนเพื่อเริ่ม
            </div>
          ) : (
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th className="py-2 px-2 font-medium">เวลา</th>
                    <th className="py-2 px-2 font-medium">ประเภท</th>
                    <th className="py-2 px-2 font-medium">URL</th>
                    <th className="py-2 px-2 font-medium">สถานะ</th>
                    <th className="py-2 px-2 font-medium text-right">HTTP</th>
                    <th className="py-2 px-2 font-medium text-right">Latency</th>
                    <th className="py-2 px-2 font-medium">หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((row) => {
                    const kind = row.event === "endpoint_probe:webhook" ? "webhook" : "liff";
                    const ok = !!row.detail?.ok;
                    return (
                      <tr key={row.id} className="border-b border-slate-100 last:border-0 align-top">
                        <td className="py-2 px-2 whitespace-nowrap">
                          <div className="text-slate-900">{relativeTime(row.created_at)}</div>
                          <div className="text-[10px] text-slate-400">
                            {new Date(row.created_at).toLocaleString("th-TH")}
                          </div>
                        </td>
                        <td className="py-2 px-2">
                          <Badge
                            variant="outline"
                            className={
                              kind === "webhook"
                                ? "border-sky-200 bg-sky-50 text-sky-800"
                                : "border-primary/20 bg-accent text-primary"
                            }
                          >
                            {kind === "webhook" ? "Webhook" : "LIFF"}
                          </Badge>
                        </td>
                        <td className="py-2 px-2 font-mono text-[11px] text-slate-600 break-all max-w-[280px]" title={row.detail?.url}>
                          {row.detail?.url ?? "-"}
                        </td>
                        <td className="py-2 px-2">
                          {ok ? (
                            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 border">
                              <CheckCircle2 className="w-3 h-3 mr-1" /> สำเร็จ
                            </Badge>
                          ) : (
                            <Badge className="bg-rose-100 text-rose-800 border-rose-200 border">
                              <XCircle className="w-3 h-3 mr-1" /> ล้มเหลว
                            </Badge>
                          )}
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums text-slate-700">
                          {row.detail?.status ?? "-"}
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums text-slate-700">
                          {row.detail?.latency_ms != null ? `${row.detail.latency_ms}ms` : "-"}
                        </td>
                        <td className="py-2 px-2 text-slate-500">{row.detail?.hint ?? ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-slate-500" />
              <div className="font-semibold text-slate-900">รายงานจากภายนอก</div>
              <span className="text-xs text-slate-400">(หน้า LIFF error ที่ผู้ใช้พบ, 20 รายการ)</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={clearOldReports}
              disabled={clearing || reports.length === 0}
            >
              {clearing ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <Trash2 className="w-3 h-3 mr-1" />
              )}
              ล้างรายงานเก่า (&gt;1 ชม.)
            </Button>
          </div>
          {reports.length === 0 ? (
            <div className="text-sm text-slate-400 py-6 text-center">
              ยังไม่มีรายงานจากผู้ใช้ — ระบบจะบันทึกอัตโนมัติเมื่อหน้า <code>/l/shop</code> โผล่หน้า error
            </div>
          ) : (
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th className="py-2 px-2 font-medium">เวลา</th>
                    <th className="py-2 px-2 font-medium">endpoint</th>
                    <th className="py-2 px-2 font-medium">liff_id</th>
                    <th className="py-2 px-2 font-medium">code</th>
                    <th className="py-2 px-2 font-medium">message</th>
                    <th className="py-2 px-2 font-medium">ua</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100 last:border-0 align-top">
                      <td className="py-2 px-2 whitespace-nowrap">
                        <div className="text-slate-900">{relativeTime(row.created_at)}</div>
                        <div className="text-[10px] text-slate-400">
                          {new Date(row.created_at).toLocaleString("th-TH")}
                        </div>
                      </td>
                      <td className="py-2 px-2 font-mono text-[11px] text-slate-600 break-all max-w-[240px]">
                        {row.detail?.endpoint ?? "-"}
                      </td>
                      <td className="py-2 px-2 font-mono text-[11px] text-slate-600 break-all">
                        {row.detail?.liff_id ?? "-"}
                      </td>
                      <td className="py-2 px-2">
                        {row.detail?.code != null ? (
                          <Badge className="bg-rose-100 text-rose-800 border-rose-200 border">
                            {String(row.detail.code)}
                          </Badge>
                        ) : "-"}
                      </td>
                      <td className="py-2 px-2 text-slate-700 break-words max-w-[260px]">
                        {row.detail?.message ?? "-"}
                      </td>
                      <td className="py-2 px-2 text-slate-400 text-[10px] break-all max-w-[180px]">
                        {row.detail?.ua ? row.detail.ua.slice(0, 120) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-500" />
              <div className="font-semibold text-slate-900">Callback ที่ล้มเหลว</div>
              <span className="text-xs text-slate-400">(signature invalid / state mismatch / OTP, 50 รายการ)</span>
            </div>
            <Button size="sm" variant="outline" onClick={loadFailures} disabled={failuresLoading}>
              {failuresLoading ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3 mr-1" />
              )}
              รีเฟรช
            </Button>
          </div>
          {failures.length === 0 ? (
            <div className="text-sm text-slate-400 py-6 text-center">
              ยังไม่มี callback ที่ล้มเหลว — เหตุการณ์ signature mismatch / state mismatch / OTP invalid จะบันทึกที่นี่
            </div>
          ) : (
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th className="py-2 px-2 font-medium">เวลา</th>
                    <th className="py-2 px-2 font-medium">ที่มา</th>
                    <th className="py-2 px-2 font-medium">สาเหตุ</th>
                    <th className="py-2 px-2 font-medium">รายละเอียด</th>
                  </tr>
                </thead>
                <tbody>
                  {failures.map((row) => {
                    const d = row.detail ?? {};
                    return (
                      <tr key={row.id} className="border-b border-slate-100 last:border-0 align-top">
                        <td className="py-2 px-2 whitespace-nowrap">
                          <div className="text-slate-900">{relativeTime(row.created_at)}</div>
                          <div className="text-[10px] text-slate-400">
                            {new Date(row.created_at).toLocaleString("th-TH")}
                          </div>
                        </td>
                        <td className="py-2 px-2">
                          <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-800">
                            {String(d.source ?? "-")}
                          </Badge>
                        </td>
                        <td className="py-2 px-2 font-mono text-[11px] text-rose-700 break-all max-w-[220px]">
                          {String(d.reason ?? "-")}
                        </td>
                        <td className="py-2 px-2 text-slate-600">
                          <div className="font-mono text-[11px] space-y-0.5 break-all">
                            {d.ip && <div>ip: <span className="text-slate-900">{String(d.ip)}</span></div>}
                            {d.ua && <div className="text-slate-400 max-w-[280px] truncate" title={String(d.ua)}>ua: {String(d.ua).slice(0, 120)}</div>}
                            {d.message && <div className="text-slate-700">msg: {String(d.message)}</div>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-slate-500" />
              <div className="font-semibold text-slate-900">ประวัติการแก้ไข LINE credentials / endpoint</div>
              <span className="text-xs text-slate-400">(50 รายการล่าสุด)</span>
            </div>
            <Button size="sm" variant="outline" onClick={loadAudit} disabled={auditLoading}>
              {auditLoading ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3 mr-1" />
              )}
              รีเฟรช
            </Button>
          </div>
          {/* filters injected below */}
          <div className="grid gap-2 sm:grid-cols-4 mb-3">
            <input
              type="text"
              placeholder="ค้นหา (name, secret, from/to...)"
              value={auditQuery}
              onChange={(e) => setAuditQuery(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
            />
            <input
              type="text"
              placeholder="ผู้แก้ไข (email/ชื่อ/uid)"
              value={auditActor}
              onChange={(e) => setAuditActor(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
            />
            <input
              type="date"
              value={auditFrom}
              onChange={(e) => setAuditFrom(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
            />
            <input
              type="date"
              value={auditTo}
              onChange={(e) => setAuditTo(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
            />
          </div>
          {filteredAudit.length === 0 ? (
            <div className="text-sm text-slate-400 py-6 text-center">
              {audit.length === 0
                ? "ยังไม่มีบันทึกการแก้ไข — เมื่อมีการอัปเดต secret หรือ LIFF endpoint จะปรากฏที่นี่"
                : "ไม่พบรายการที่ตรงกับตัวกรอง"}
            </div>
          ) : (
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th className="py-2 px-2 font-medium">เวลา</th>
                    <th className="py-2 px-2 font-medium">ผู้แก้ไข</th>
                    <th className="py-2 px-2 font-medium">ประเภท</th>
                    <th className="py-2 px-2 font-medium">รายละเอียด</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAudit.map((row) => {
                    const isSecret = row.action === "line.secret_update_request";
                    const detail = row.detail ?? {};
                    return (
                      <tr key={row.id} className="border-b border-slate-100 last:border-0 align-top">
                        <td className="py-2 px-2 whitespace-nowrap">
                          <div className="text-slate-900">{relativeTime(row.created_at)}</div>
                          <div className="text-[10px] text-slate-400">
                            {new Date(row.created_at).toLocaleString("th-TH")}
                          </div>
                        </td>
                        <td className="py-2 px-2 text-slate-700">
                          <div className="font-medium">{row.actor_name ?? "-"}</div>
                          <div className="text-[10px] text-slate-400 break-all">{row.actor_email ?? row.user_id ?? "-"}</div>
                        </td>
                        <td className="py-2 px-2">
                          <Badge
                            variant="outline"
                            className={
                              isSecret
                                ? "border-amber-200 bg-amber-50 text-amber-800"
                                : "border-sky-200 bg-sky-50 text-sky-800"
                            }
                          >
                            {isSecret ? "Secret" : "LIFF"}
                          </Badge>
                          <div className="text-[10px] text-slate-500 mt-1 font-mono">
                            {isSecret ? String(detail.name ?? "") : Object.keys(detail.changes ?? {}).join(", ")}
                          </div>
                        </td>
                        <td className="py-2 px-2 text-slate-600">
                          {isSecret ? (
                            <div className="font-mono text-[11px] space-y-0.5">
                              <div>last4: <span className="text-slate-900">{String(detail.last4 ?? "-")}</span></div>
                              <div>length: <span className="text-slate-900">{String(detail.length ?? "-")}</span></div>
                              <div className="text-slate-400">sha256: {String(detail.sha256_prefix8 ?? "-")}</div>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              {Object.entries(detail.changes ?? {}).map(([k, v]: [string, any]) => (
                                <div key={k} className="font-mono text-[11px]">
                                  <div className="text-slate-500">{k}</div>
                                  <div className="text-rose-700 break-all">- {String(v?.from ?? "(ว่าง)")}</div>
                                  <div className="text-emerald-700 break-all">+ {String(v?.to ?? "(ว่าง)")}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
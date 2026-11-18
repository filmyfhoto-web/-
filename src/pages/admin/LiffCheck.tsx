import AdminLayout from "@/components/layout/AdminLayout";
import SeoHead from "@/components/SeoHead";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import {
  Loader2, RefreshCw, CheckCircle2, XCircle, AlertTriangle,
  Copy, ExternalLink, Smartphone, FlaskConical, ListChecks,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type CheckResult = {
  ok: boolean;
  canonical_endpoint?: string;
  db?: {
    liff_id: string | null;
    endpoint_url: string | null;
    scopes: string[];
    callback_urls: string[];
  };
  line?: {
    list?: { ok: boolean; status?: number; count?: number; error?: string };
    app?: { ok: boolean; status?: number; view?: { url?: string; type?: string }; features?: Record<string, unknown>; error?: string };
    endpoint_from_line?: string | null;
    token_present?: boolean;
    login_token_present?: boolean;
    api_check_skipped?: boolean;
    api_warning?: string | null;
    used_messaging_fallback?: boolean;
    messaging_token_present?: boolean;
    token_channel_id_from_error?: string | null;
    app_error_th?: string | null;
  };
  match?: {
    endpoint_matches: boolean;
    endpoint_uses_our_domain: boolean;
    callbacks_missing: string[];
    channel_id_matches?: boolean | null;
    liff_channel_id?: string | null;
    login_channel_id?: string | null;
    token_channel_id_matches_liff?: boolean | null;
  };
  problems?: string[];
  error?: string;
};

type Scenario = "all_ok" | "endpoint_mismatch" | "endpoint_liff_line_me" | "callbacks_missing" | "no_token" | "liff_id_not_found";

const APP_ORIGIN = "https://www.filmyynatta.com";
const ROOT_ORIGIN = "https://filmyynatta.com";
const CANONICAL = `${APP_ORIGIN}/l/shop`;
const DEFAULT_CBS = [`${APP_ORIGIN}/l/shop`, `${ROOT_ORIGIN}/l/shop`, `${APP_ORIGIN}/liff-link`];
const LIFF_ID_REGEX = /^\d{10}-[A-Za-z0-9]+$/;
const REQUIRED_CB_ORIGINS = [APP_ORIGIN, ROOT_ORIGIN];

type LineItem = { ok: boolean; label: string; msg: string; suggest?: string };

function normalizeUrl(u: string): string {
  return u.trim().replace(/\/+$/, "");
}

function validateChecklist(input: { liffId: string; endpoint: string; callbacks: string }): {
  liff: LineItem;
  endpoint: LineItem;
  callbacks: LineItem & { missing: string[]; extra: string[] };
  problemCount: number;
} {
  // LIFF ID
  const liffTrim = input.liffId.trim();
  const liff: LineItem = liffTrim
    ? LIFF_ID_REGEX.test(liffTrim)
      ? { ok: true, label: "LIFF ID", msg: "รูปแบบถูกต้อง" }
      : { ok: false, label: "LIFF ID", msg: "รูปแบบไม่ถูกต้อง — ควรเป็น 10 หลัก ตามด้วย - และรหัส (เช่น 2010762305-5Yqzh5tB)" }
    : { ok: false, label: "LIFF ID", msg: "ยังไม่ได้กรอก" };

  // Endpoint
  let endpoint: LineItem;
  const endpointTrim = input.endpoint.trim();
  if (!endpointTrim) {
    endpoint = { ok: false, label: "Endpoint URL", msg: "ยังไม่ได้กรอก", suggest: CANONICAL };
  } else {
    try {
      const u = new URL(endpointTrim);
      if (u.protocol !== "https:") {
        endpoint = { ok: false, label: "Endpoint URL", msg: "ต้องเป็น https", suggest: CANONICAL };
      } else if (u.hostname === "liff.line.me") {
        endpoint = { ok: false, label: "Endpoint URL", msg: "ต้องเป็นโดเมนของร้าน ไม่ใช่ liff.line.me", suggest: CANONICAL };
      } else if (u.pathname !== "/l/shop") {
        endpoint = { ok: false, label: "Endpoint URL", msg: `path ต้องเป็น /l/shop (พบ ${u.pathname})`, suggest: CANONICAL };
      } else if (`${u.protocol}//${u.host}` !== APP_ORIGIN) {
        endpoint = { ok: false, label: "Endpoint URL", msg: `ควรใช้โดเมนหลัก ${APP_ORIGIN}`, suggest: CANONICAL };
      } else {
        endpoint = { ok: true, label: "Endpoint URL", msg: "ตรงกับที่ระบบคาดหวัง" };
      }
    } catch {
      endpoint = { ok: false, label: "Endpoint URL", msg: "URL ไม่ถูกต้อง", suggest: CANONICAL };
    }
  }

  // Callbacks
  const cbLines = input.callbacks.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const provided = new Set(cbLines.map(normalizeUrl));
  const missing = DEFAULT_CBS.filter((u) => !provided.has(normalizeUrl(u)));
  const extra: string[] = [];
  for (const line of cbLines) {
    try {
      const u = new URL(line);
      if (!REQUIRED_CB_ORIGINS.some((o) => `${u.protocol}//${u.host}` === o)) {
        extra.push(line);
      }
    } catch {
      extra.push(line);
    }
  }
  const cbOk = missing.length === 0 && cbLines.length > 0;
  const callbacks = {
    ok: cbOk,
    label: "Callback URLs",
    msg: cbLines.length === 0
      ? "ยังไม่ได้กรอก"
      : cbOk
        ? `ครบถ้วน (${cbLines.length} รายการ)`
        : `ขาด ${missing.length} รายการ${extra.length ? ` · ไม่รู้จัก ${extra.length} รายการ` : ""}`,
    missing,
    extra,
  };

  const problemCount = [liff, endpoint, callbacks].filter((x) => !x.ok).length;
  return { liff, endpoint, callbacks, problemCount };
}

function buildMockResult(s: Scenario): CheckResult {
  const baseDb = {
    liff_id: "2010762305-5Yqzh5tB",
    endpoint_url: CANONICAL,
    scopes: ["profile", "openid"],
    callback_urls: DEFAULT_CBS,
  };
  const baseLine = {
    token_present: true,
    list: { ok: true, status: 200, count: 1 },
    app: { ok: true, status: 200, view: { url: CANONICAL, type: "full" } },
    endpoint_from_line: CANONICAL,
  };
  const baseMatch = { endpoint_matches: true, endpoint_uses_our_domain: true, callbacks_missing: [] as string[] };
  const common = { ok: true, canonical_endpoint: CANONICAL };

  switch (s) {
    case "all_ok":
      return { ...common, db: baseDb, line: baseLine, match: baseMatch, problems: [] };
    case "endpoint_mismatch": {
      const wrongUrl = `${APP_ORIGIN}/l/shop-old`;
      return {
        ...common,
        db: baseDb,
        line: { ...baseLine, app: { ok: true, status: 200, view: { url: wrongUrl, type: "full" } }, endpoint_from_line: wrongUrl },
        match: { ...baseMatch, endpoint_matches: false },
        problems: [`ค่าที่ตั้งใน LINE Console (${wrongUrl}) ต่างจากที่บันทึกในระบบ (${CANONICAL})`],
      };
    }
    case "endpoint_liff_line_me": {
      const wrong = "https://liff.line.me/2010762305-5Yqzh5tB";
      return {
        ...common,
        db: { ...baseDb, endpoint_url: wrong },
        line: baseLine,
        match: { endpoint_matches: false, endpoint_uses_our_domain: false, callbacks_missing: [] },
        problems: [
          "Endpoint ในระบบเป็นลิงก์ liff.line.me — ต้องเป็นโดเมนของร้าน",
          "Endpoint ในระบบไม่ได้ชี้ไปที่ /l/shop",
        ],
      };
    }
    case "callbacks_missing": {
      const missing = [`${ROOT_ORIGIN}/l/shop`];
      return {
        ...common,
        db: { ...baseDb, callback_urls: [`${APP_ORIGIN}/l/shop`] },
        line: baseLine,
        match: { ...baseMatch, callbacks_missing: missing },
        problems: [`Callback URL ที่ควรมีแต่ยังไม่ได้บันทึก: ${missing.join(", ")}`],
      };
    }
    case "no_token":
      return {
        ...common,
        db: baseDb,
        line: {
          token_present: false,
          login_token_present: false,
          api_check_skipped: true,
          api_warning: "ไม่มี LINE_LOGIN_CHANNEL_TOKEN จึงข้ามการอ่านค่า LIFF ผ่าน LINE API — ไม่ใช่ปัญหาการใช้งาน เพราะบางบัญชีไม่มีช่อง token นี้ ให้ทดสอบจริงด้วย LIFF URL แทน",
          list: { ok: false },
          app: { ok: false },
          endpoint_from_line: null,
        },
        match: baseMatch,
        problems: [],
      };
    case "liff_id_not_found":
      return {
        ...common,
        db: baseDb,
        line: {
          token_present: true,
          list: { ok: true, status: 200, count: 3 },
          app: { ok: false, status: 404, error: "liff_id_not_found_in_channel" },
          endpoint_from_line: null,
        },
        match: { endpoint_matches: false, endpoint_uses_our_domain: true, callbacks_missing: [] },
        problems: ["ไม่พบ LIFF ID นี้ใน LINE Login channel — ตรวจสอบว่า LIFF ID ที่บันทึกในระบบตรงกับที่สร้างใน channel เดียวกับ token"],
      };
  }
}

const SCENARIO_LABELS: Record<Scenario, string> = {
  all_ok: "สมบูรณ์ทุกอย่าง",
  endpoint_mismatch: "Endpoint mismatch (DB ≠ LINE)",
  endpoint_liff_line_me: "Endpoint เป็น liff.line.me",
  callbacks_missing: "Callback URL ขาด",
  no_token: "ไม่มี LINE token (อ่านค่าจาก LINE ไม่ได้)",
  liff_id_not_found: "LIFF ID ไม่พบใน channel",
};

function StatusRow({ ok, warn, label, value }: { ok: boolean; warn?: boolean; label: string; value?: React.ReactNode }) {
  const Icon = ok ? CheckCircle2 : warn ? AlertTriangle : XCircle;
  const color = ok ? "text-success" : warn ? "text-amber-500" : "text-destructive";
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${color}`} />
      <div className="flex-1">
        <div className="font-medium">{label}</div>
        {value ? <div className="text-xs text-muted-foreground break-all font-mono">{value}</div> : null}
      </div>
    </div>
  );
}

function ChecklistRow({
  item,
  onCopy,
  children,
}: {
  item: LineItem;
  onCopy: (text: string, label: string) => void;
  children?: React.ReactNode;
}) {
  const Icon = item.ok ? CheckCircle2 : XCircle;
  const color = item.ok ? "text-success" : "text-destructive";
  return (
    <div className="rounded-xl border border-border p-3 text-sm">
      <div className="flex items-start gap-2">
        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${color}`} />
        <div className="flex-1 min-w-0">
          <div className="font-medium">{item.label}</div>
          <div className={`text-xs ${item.ok ? "text-muted-foreground" : "text-destructive"}`}>{item.msg}</div>
          {item.suggest ? (
            <div className="mt-1.5 flex items-center gap-2 text-xs">
              <span className="opacity-60 shrink-0">ควรใช้:</span>
              <code className="flex-1 px-1.5 py-0.5 rounded bg-muted border break-all">{item.suggest}</code>
              <Button size="sm" variant="outline" className="h-7" onClick={() => onCopy(item.suggest!, item.label)}>
                <Copy className="w-3 h-3" />
              </Button>
            </div>
          ) : null}
          {children}
        </div>
      </div>
    </div>
  );
}

export default function AdminLiffCheck() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [dryRun, setDryRun] = useState(false);
  const [scenario, setScenario] = useState<Scenario>("all_ok");
  const [clLiffId, setClLiffId] = useState("");
  const [clEndpoint, setClEndpoint] = useState("");
  const [clCallbacks, setClCallbacks] = useState(DEFAULT_CBS.join("\n"));
  const [clResult, setClResult] = useState<ReturnType<typeof validateChecklist> | null>(null);
  const currentOrigin = typeof window !== "undefined" ? window.location.origin : "";

  async function fetchLive() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("line-liff-check", { body: {} });
      if (error) { toast.error(error.message || "ตรวจสอบไม่สำเร็จ"); return; }
      setResult(data as CheckResult);
      // Immediate alert on channel-id mismatch — the most critical failure.
      const m = (data as CheckResult)?.match;
      if (m && m.channel_id_matches === false) {
        toast.error(
          `LIFF ID ผูกกับ channel ${m.liff_channel_id} แต่ LINE_LOGIN_CHANNEL_ID = ${m.login_channel_id} — ล็อกอิน LINE จะใช้งานไม่ได้`,
          { duration: 10000 },
        );
      }
      // Best-effort audit log — ignore RLS failures.
      try {
        await supabase.from("activity_logs").insert({
          action: "line.liff_check",
          target_type: "line_settings",
          detail: {
            problems_count: (data as CheckResult)?.problems?.length || 0,
            endpoint_matches: (data as CheckResult)?.match?.endpoint_matches ?? null,
            login_token_present: (data as CheckResult)?.line?.login_token_present ?? null,
            line_status: (data as CheckResult)?.line?.app?.status ?? null,
          },
        });
      } catch { /* ignore */ }
    } finally { setLoading(false); }
  }

  async function run() {
    if (dryRun) { setResult(buildMockResult(scenario)); return; }
    await fetchLive();
  }

  useEffect(() => {
    if (dryRun) setResult(buildMockResult(scenario));
    else void fetchLive();
    // eslint-disable-next-line
  }, [dryRun, scenario]);

  // Auto-refresh live status every 60 seconds while the tab is visible
  useEffect(() => {
    if (dryRun) return;
    const id = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        void fetchLive();
      }
    }, 60_000);
    return () => clearInterval(id);
    // eslint-disable-next-line
  }, [dryRun]);

  function exitDryRun() { setDryRun(false); }

  async function copy(text: string, label: string) {
    try { await navigator.clipboard.writeText(text); toast.success(`คัดลอก ${label}`); }
    catch { toast.error("คัดลอกไม่สำเร็จ"); }
  }

  function runChecklist() {
    const r = validateChecklist({ liffId: clLiffId, endpoint: clEndpoint, callbacks: clCallbacks });
    setClResult(r);
    if (r.problemCount === 0) toast.success("ค่าที่กรอกถูกต้องทั้งหมด");
    else toast.warning(`พบปัญหา ${r.problemCount} รายการ`);
  }

  // Auto-run checklist (debounced) เมื่อผู้ใช้พิมพ์แก้ไข input
  useEffect(() => {
    if (!clLiffId && !clEndpoint && clCallbacks === DEFAULT_CBS.join("\n")) return;
    const t = setTimeout(() => {
      setClResult(validateChecklist({ liffId: clLiffId, endpoint: clEndpoint, callbacks: clCallbacks }));
    }, 400);
    return () => clearTimeout(t);
  }, [clLiffId, clEndpoint, clCallbacks]);

  function loadFromCurrent() {
    if (!db) { toast.error("ยังไม่มีข้อมูลจากระบบ"); return; }
    setClLiffId(db.liff_id || "");
    setClEndpoint(db.endpoint_url || "");
    setClCallbacks((db.callback_urls || []).join("\n"));
    toast.success("โหลดค่าจากระบบแล้ว");
  }

  const db = result?.db;
  const line = result?.line;
  const match = result?.match;
  const tokenChannelMismatch = match?.token_channel_id_matches_liff === false;

  return (
    <AdminLayout>
      <SeoHead title="ตรวจสอบ LIFF Endpoint / Callback — แอดมิน" description="ตรวจสอบค่า LIFF endpoint และ callback URL ที่ระบบกำลังใช้อยู่แบบอัตโนมัติ" path="/admin/line-liff-check" />

      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Smartphone className="w-6 h-6 text-[#06C755]" /> ตรวจสอบ LIFF / Callback
            {result && result.ok ? (
              (result.problems?.length || 0) === 0 ? (
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 border border-green-300 inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> ผ่านทั้งหมด
                </span>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 inline-flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> พบ {result.problems?.length} ปัญหา
                </span>
              )
            ) : null}
          </h1>
          <p className="text-sm text-muted-foreground">ค่าปัจจุบันที่ระบบกำลังใช้ เทียบกับที่ตั้งใน LINE Developers Console</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild className="rounded-xl">
            <Link to="/admin/line-settings">← กลับหน้าตั้งค่า LINE</Link>
          </Button>
          <Button
            variant={dryRun ? "default" : "outline"}
            onClick={() => setDryRun((v) => !v)}
            className="rounded-xl"
          >
            <FlaskConical className="w-4 h-4 mr-1" /> {dryRun ? "กำลังทดสอบ..." : "โหมดทดสอบ"}
          </Button>
          <Button onClick={run} disabled={loading} className="rounded-xl">
            {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />} ตรวจใหม่
          </Button>
        </div>
      </div>

      {dryRun ? (
        <div className="mb-4 rounded-2xl border border-blue-300 bg-blue-50 p-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-blue-900 font-medium">
            <FlaskConical className="w-4 h-4" /> โหมดทดสอบ — ข้อมูลด้านล่างเป็นข้อมูลจำลองเท่านั้น
          </div>
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <label className="text-sm text-blue-900 shrink-0">Scenario:</label>
            <select
              value={scenario}
              onChange={(e) => setScenario(e.target.value as Scenario)}
              className="flex-1 h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              {(Object.keys(SCENARIO_LABELS) as Scenario[]).map((k) => (
                <option key={k} value={k}>{SCENARIO_LABELS[k]}</option>
              ))}
            </select>
          </div>
          <Button size="sm" variant="outline" onClick={exitDryRun} className="rounded-lg">
            ออกจากโหมดทดสอบ
          </Button>
        </div>
      ) : null}

      {/* Manual checklist */}
      <section className="bg-card border border-border rounded-2xl p-5 shadow-card space-y-4 mb-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-bold flex items-center gap-2">
            <ListChecks className="w-5 h-5 text-primary" /> เช็กลิสต์ตั้งค่า (ตรวจจากค่าที่กรอก)
          </h2>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="rounded-lg" onClick={loadFromCurrent} disabled={!db}>
              โหลดค่าจากระบบ
            </Button>
            <Button size="sm" className="rounded-lg" onClick={runChecklist}>
              ตรวจความถูกต้อง
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          กรอกค่าที่ตั้งไว้ใน LINE Developers Console แล้วกดตรวจ — ระบบจะเทียบกับค่าที่ควรใช้จริง (โดเมนหลัก {APP_ORIGIN})
        </p>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label className="text-xs">LIFF ID</Label>
            <Input
              value={clLiffId}
              onChange={(e) => setClLiffId(e.target.value)}
              placeholder="เช่น 2010762305-5Yqzh5tB"
              className="rounded-xl mt-1 font-mono"
            />
          </div>
          <div>
            <Label className="text-xs">Endpoint URL</Label>
            <Input
              value={clEndpoint}
              onChange={(e) => setClEndpoint(e.target.value)}
              placeholder={CANONICAL}
              className="rounded-xl mt-1 font-mono"
            />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">Callback URL (บรรทัดละ 1 รายการ)</Label>
            <Textarea
              value={clCallbacks}
              onChange={(e) => setClCallbacks(e.target.value)}
              placeholder={DEFAULT_CBS.join("\n")}
              className="rounded-xl mt-1 font-mono text-xs"
              rows={4}
            />
          </div>
        </div>

        {clResult ? (
          <div className="space-y-2 pt-1">
            <div className={`rounded-xl border p-3 text-sm flex items-center gap-2 ${clResult.problemCount === 0 ? "border-green-300 bg-green-50 text-green-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}>
              {clResult.problemCount === 0 ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              {clResult.problemCount === 0 ? "ค่าที่กรอกถูกต้องทั้งหมด" : `พบปัญหา ${clResult.problemCount} รายการ`}
            </div>

            <ChecklistRow item={clResult.liff} onCopy={copy} />
            <ChecklistRow item={clResult.endpoint} onCopy={copy} />
            <ChecklistRow item={clResult.callbacks} onCopy={copy}>
              {clResult.callbacks.missing.length > 0 ? (
                <div className="mt-1.5 space-y-1">
                  {clResult.callbacks.missing.map((u) => (
                    <div key={u} className="flex items-center gap-2 text-xs">
                      <span className="text-destructive">⚠ ขาด:</span>
                      <code className="flex-1 px-1.5 py-0.5 rounded bg-background border break-all">{u}</code>
                      <Button size="sm" variant="outline" className="h-7" onClick={() => copy(u, "Callback URL")}>
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
              {clResult.callbacks.extra.length > 0 ? (
                <div className="mt-1.5 space-y-1">
                  {clResult.callbacks.extra.map((u) => (
                    <div key={u} className="text-xs text-amber-700">
                      ⚠ ไม่รู้จัก / ควรลบ: <code className="break-all">{u}</code>
                    </div>
                  ))}
                </div>
              ) : null}
            </ChecklistRow>
          </div>
        ) : null}
      </section>

      {loading && !result ? (
        <div className="flex items-center gap-2 text-muted-foreground py-10 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" /> กำลังตรวจสอบ...
        </div>
      ) : !result ? null : !result.ok ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          ตรวจสอบไม่สำเร็จ: {result.error || "unknown"}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Optional LINE API debug status — not required for LIFF to work. */}
          {(line?.api_check_skipped || (line?.login_token_present && (line?.list?.status === 401 || line?.app?.status === 401))) ? (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 space-y-2">
              <div className="font-semibold text-amber-900 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                {line?.api_check_skipped
                  ? "ข้ามการอ่านค่า LIFF ผ่าน LINE API (ปกติ)"
                  : "อ่านค่า LIFF ผ่าน LINE API ไม่สำเร็จ (debug-only)"}
              </div>
              <div className="text-sm text-amber-900 space-y-1">
                <p>{line?.api_warning || "Token debug ใช้ไม่ได้ จึงตรวจค่าที่ LINE เก็บไว้ผ่าน API ไม่ได้"}</p>
                <p className="text-xs">
                  การใช้งานจริงของ LIFF ไม่ต้องมีช่องนี้ ให้ยืนยันจาก <b>LIFF ID</b>, <b>Endpoint URL</b>, <b>Callback URL</b> และการเปิดลิงก์ <code>https://liff.line.me/{db?.liff_id || "<LIFF_ID>"}</code> กลับมาที่ <code>/l/shop</code>
                </p>
              </div>

              <div className="flex gap-2 pt-1 flex-wrap">
                {db?.liff_id ? (
                  <Button size="sm" asChild className="rounded-lg">
                    <a href={`https://liff.line.me/${db.liff_id}`} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-3.5 h-3.5 mr-1" /> เปิด LIFF URL
                    </a>
                  </Button>
                ) : null}
                <Button size="sm" variant="outline" asChild className="rounded-lg">
                  <a href="https://developers.line.biz/console/" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-3.5 h-3.5 mr-1" /> เปิด LINE Developers
                  </a>
                </Button>
                <Button size="sm" variant="outline" onClick={run} disabled={loading} className="rounded-lg">
                  <RefreshCw className="w-3.5 h-3.5 mr-1" /> ตรวจซ้ำหลังตั้งค่า
                </Button>
              </div>
            </div>
          ) : null}

          {tokenChannelMismatch ? (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 space-y-2">
              <div className="font-semibold text-amber-900 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" /> Token สำหรับตรวจผ่าน LINE API อยู่คนละ channel (debug-only)
              </div>
              <div className="text-sm text-amber-900 space-y-1">
                <p>
                  ระบบอ่านจาก LINE แล้วพบว่า token debug เป็นของ channel{" "}
                  <code className="px-1 rounded bg-background border">{line?.token_channel_id_from_error}</code>
                  แต่ LIFF ID <code className="px-1 rounded bg-background border">{db?.liff_id}</code> อยู่ใต้ channel{" "}
                  <code className="px-1 rounded bg-background border">{match?.liff_channel_id}</code>
                </p>
                <p className="text-xs">
                  ช่องนี้ไม่จำเป็นต่อการเปิด LIFF จริง ถ้า LINE Console ไม่มี access token ให้ข้ามและตรวจจาก LIFF URL / Endpoint / Callback แทน
                </p>
              </div>
              <div className="flex gap-2 pt-1 flex-wrap">
                <Button size="sm" variant="outline" asChild className="rounded-lg">
                  <a href="https://developers.line.biz/console/" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-3.5 h-3.5 mr-1" /> เปิด LINE Developers
                  </a>
                </Button>
                <Button size="sm" variant="outline" onClick={run} disabled={loading} className="rounded-lg">
                  <RefreshCw className="w-3.5 h-3.5 mr-1" /> ตรวจซ้ำหลังแก้
                </Button>
              </div>
            </div>
          ) : null}

          {/* Endpoint mismatch — banner แดงเน้นด้านบน */}
          {match && match.channel_id_matches === false ? (
            <div className="rounded-2xl border-2 border-destructive bg-destructive/10 p-4 space-y-2">
              <div className="font-semibold text-destructive flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" /> LIFF ID กับ LINE_LOGIN_CHANNEL_ID คนละ channel!
              </div>
              <div className="text-sm text-destructive/90 space-y-1">
                <div>
                  LIFF ID ผูกกับ channel <code className="px-1 rounded bg-background border">{match.liff_channel_id}</code>{" "}
                  แต่ระบบตั้ง <code className="px-1 rounded bg-background border">LINE_LOGIN_CHANNEL_ID = {match.login_channel_id}</code>
                </div>
                <p className="text-xs">
                  ผลกระทบ: การ verify <code>id_token</code> ที่ <code>api.line.me/oauth2/v2.1/verify</code> จะถูกปฏิเสธด้วย <code>aud_mismatch</code>{" "}
                  → ผู้ใช้ล็อกอินผ่าน LIFF ไม่ได้ และ token ของ LINE Login channel จะไม่มีสิทธิ์เห็น LIFF app นี้ (จะได้ 404)
                </p>
                <p className="text-xs">
                  วิธีแก้: เลือกอย่างใดอย่างหนึ่ง — (ก) เปลี่ยน <code>LINE_LOGIN_CHANNEL_ID</code> ใน Secret Vault ให้ตรงกับ{" "}
                  <code>{match.liff_channel_id}</code> หรือ (ข) สร้าง LIFF app ใหม่ภายใต้ channel <code>{match.login_channel_id}</code>{" "}
                  แล้วอัปเดต LIFF ID ในหน้าตั้งค่า
                </p>
              </div>
              <div className="flex gap-2 pt-1 flex-wrap">
                <Button size="sm" asChild className="rounded-lg">
                  <Link to="/admin/line-secret-vault">แก้ LINE_LOGIN_CHANNEL_ID →</Link>
                </Button>
                <Button size="sm" variant="outline" asChild className="rounded-lg">
                  <Link to="/admin/line-settings">แก้ LIFF ID →</Link>
                </Button>
              </div>
            </div>
          ) : null}

          {match && db?.endpoint_url && line?.token_present && line?.app?.ok && !match.endpoint_matches ? (
            <div className="rounded-2xl border-2 border-destructive bg-destructive/10 p-4 space-y-2">
              <div className="font-semibold text-destructive flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" /> Endpoint ใน LINE Console ไม่ตรงกับที่ระบบใช้
              </div>
              <div className="text-sm text-destructive/90">
                LINE Console กำลังชี้ไปที่ <code className="px-1 rounded bg-background border break-all">{line.endpoint_from_line || "-"}</code>
                <br />ระบบคาดหวัง: <code className="px-1 rounded bg-background border break-all">{db.endpoint_url}</code>
              </div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={() => copy(db.endpoint_url!, "Endpoint ที่ควรตั้ง")} className="rounded-lg">
                  <Copy className="w-3.5 h-3.5 mr-1" /> คัดลอกค่าที่ควรตั้ง
                </Button>
                <Button size="sm" variant="outline" asChild className="rounded-lg">
                  <a href="https://developers.line.biz/console/" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-3.5 h-3.5 mr-1" /> เปิด LINE Console
                  </a>
                </Button>
              </div>
            </div>
          ) : null}

          {/* Summary */}
          {result.problems && result.problems.length > 0 ? (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 space-y-2">
              <div className="font-semibold text-amber-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> พบปัญหา {result.problems.length} รายการ
              </div>
              <ul className="list-disc pl-5 text-sm text-amber-900 space-y-1">
                {result.problems.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </div>
          ) : (
            <div className="rounded-2xl border border-green-300 bg-green-50 p-4 text-sm text-green-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> ตั้งค่าครบถ้วน ไม่พบปัญหา
            </div>
          )}

          {/* Row A: DB values */}
          <section className="bg-card border border-border rounded-2xl p-5 shadow-card space-y-3">
            <h2 className="font-bold">ค่าที่ระบบใช้อยู่ (ฐานข้อมูล)</h2>
            <StatusRow ok={!!db?.liff_id} label="LIFF ID" value={db?.liff_id || "— ยังไม่ตั้งค่า —"} />
            <StatusRow
              ok={!!db?.liff_id}
              label="LIFF URL (แชร์/Rich Menu)"
              value={
                db?.liff_id ? (
                  <span className="inline-flex items-center gap-1 flex-wrap">
                    <code className="px-1 rounded bg-muted">{`https://liff.line.me/${db.liff_id}`}</code>
                    <button onClick={() => copy(`https://liff.line.me/${db.liff_id}`, "LIFF URL")} className="ml-1 text-primary underline">คัดลอก</button>
                    <a href={`https://liff.line.me/${db.liff_id}`} target="_blank" rel="noopener noreferrer" className="ml-1 text-primary underline inline-flex items-center gap-0.5">
                      เปิดทดสอบ <ExternalLink className="w-3 h-3" />
                    </a>
                  </span>
                ) : "— ยังไม่ตั้งค่า —"
              }
            />
            <StatusRow
              ok={!!(match?.endpoint_uses_our_domain && db?.endpoint_url)}
              warn={!!db?.endpoint_url && !match?.endpoint_uses_our_domain}
              label="LIFF Endpoint URL"
              value={
                db?.endpoint_url ? (
                  <span className="inline-flex items-center gap-1">
                    {db.endpoint_url}
                    <button onClick={() => copy(db.endpoint_url!, "Endpoint URL")} className="ml-1 text-primary underline">คัดลอก</button>
                    <a href={db.endpoint_url} target="_blank" rel="noopener noreferrer" className="ml-1 text-primary underline inline-flex items-center gap-0.5">
                      เปิด <ExternalLink className="w-3 h-3" />
                    </a>
                  </span>
                ) : "— ยังไม่ตั้งค่า —"
              }
            />
            <StatusRow
              ok={(db?.callback_urls?.length || 0) > 0 && (match?.callbacks_missing?.length || 0) === 0}
              warn={(match?.callbacks_missing?.length || 0) > 0}
              label={`Callback URLs (${db?.callback_urls?.length || 0} รายการ)`}
              value={
                <div className="space-y-0.5">
                  {(db?.callback_urls || []).map((u, i) => (
                    <div key={i}>• {u}</div>
                  ))}
                  {(match?.callbacks_missing || []).map((u, i) => (
                    <div key={`m-${i}`} className="text-destructive">⚠ ขาด: {u}</div>
                  ))}
                </div>
              }
            />
            <StatusRow ok label="Scopes" value={(db?.scopes || []).join(", ") || "-"} />
            <StatusRow ok label="Origin ที่คุณเปิดหน้านี้อยู่" value={currentOrigin} />
            <StatusRow ok label="Canonical endpoint (โดเมนหลัก)" value={result.canonical_endpoint || "-"} />
          </section>

          {/* Row B: LINE console values */}
          <section className="bg-card border border-border rounded-2xl p-5 shadow-card space-y-3">
            <h2 className="font-bold">ค่าที่อ่านจาก LINE Developers Console</h2>
            {line?.api_check_skipped || !line?.token_present ? (
              <div className="text-sm text-amber-700">
                ข้ามการอ่านค่าจาก LINE API เพราะไม่ได้ตั้ง token debug — ไม่ใช่ปัญหาการใช้งาน LIFF จริง
                ให้ตรวจจาก LIFF ID, Endpoint URL, Callback URL และปุ่ม “เปิดทดสอบ” ด้านบนแทน
              </div>
            ) : line?.app?.ok ? (
              <>
                <StatusRow
                  ok={!!match?.endpoint_matches}
                  warn={!match?.endpoint_matches}
                  label="Endpoint URL ที่ตั้งใน LINE Console"
                  value={line.endpoint_from_line || "-"}
                />
                <StatusRow ok label="View type" value={line.app?.view?.type || "-"} />
                {!match?.endpoint_matches && db?.endpoint_url ? (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                    ให้ไปตั้ง Endpoint URL ใน LINE Console เป็น:
                    <div className="mt-1 flex items-center gap-2">
                      <code className="flex-1 px-2 py-1.5 rounded bg-background border break-all">{db.endpoint_url}</code>
                      <Button size="sm" variant="outline" onClick={() => copy(db.endpoint_url!, "Endpoint")}>
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="text-sm text-destructive space-y-1">
                <div>อ่านค่า debug จาก LINE ไม่สำเร็จ: {line?.app_error_th || line?.app?.error || line?.list?.error || "unknown"}</div>
                {line?.token_channel_id_from_error ? (
                  <div className="text-xs">
                    LINE แจ้งว่า token นี้เป็นของ channel <code>{line.token_channel_id_from_error}</code>
                    {match?.liff_channel_id ? <> แต่ LIFF ID นี้ควรอยู่ใต้ channel <code>{match.liff_channel_id}</code></> : null}
                  </div>
                ) : null}
                <div className="text-xs text-amber-700">
                  ช่อง token นี้เป็น debug-only ถ้า LINE Console ไม่มีให้ข้ามและตรวจจาก LIFF URL / Endpoint / Callback แทน
                </div>
                {line?.list?.count != null ? ` (พบ LIFF apps ${line.list.count} รายการใน channel)` : ""}
              </div>
            )}
          </section>

          <div className="pt-1">
            <Button variant="outline" asChild className="rounded-xl">
              <a href="https://developers.line.biz/console/" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4 mr-1" /> เปิด LINE Developers Console
              </a>
            </Button>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
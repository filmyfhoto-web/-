// Grouping / filtering helpers for the LINE login step logs (action = 'line.login_step').

export type LineStepRow = {
  id: string;
  created_at: string;
  detail: {
    step?: string;
    ok?: boolean;
    trace_id?: string | null;
    flow?: "login" | "link" | null;
    source?: string;
    stage_ms?: number | null;
    error?: string | null;
    [k: string]: unknown;
  } | null;
};

export type LineTrace = {
  traceId: string;
  startedAt: string;
  endedAt: string;
  flow: "login" | "link" | null;
  failed: boolean;
  finished: boolean;
  totalMs: number;
  lastStep: string;
  failedStep: string | null;
  error: string | null;
  steps: LineStepRow[];
};

const TERMINAL_OK = new Set(["session_created", "line_linked", "redirected_to_app"]);

/** Group flat rows into one entry per login attempt, newest first. */
export function groupTraces(rows: LineStepRow[]): LineTrace[] {
  const map = new Map<string, LineStepRow[]>();
  rows.forEach((r, i) => {
    const key = r.detail?.trace_id || `ungrouped:${r.id || i}`;
    const list = map.get(key);
    if (list) list.push(r);
    else map.set(key, [r]);
  });

  const traces: LineTrace[] = [];
  for (const [traceId, list] of map) {
    const steps = [...list].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    const failedRow = steps.find((s) => s.detail?.ok === false) || null;
    const last = steps[steps.length - 1];
    const totalMs =
      new Date(last.created_at).getTime() - new Date(steps[0].created_at).getTime();
    traces.push({
      traceId: traceId.startsWith("ungrouped:") ? "—" : traceId,
      startedAt: steps[0].created_at,
      endedAt: last.created_at,
      flow: (steps.find((s) => s.detail?.flow)?.detail?.flow as "login" | "link") ?? null,
      failed: Boolean(failedRow),
      finished: steps.some((s) => TERMINAL_OK.has(String(s.detail?.step || ""))),
      totalMs: Number.isFinite(totalMs) ? totalMs : 0,
      lastStep: String(last.detail?.step || "—"),
      failedStep: failedRow ? String(failedRow.detail?.step || "—") : null,
      error: failedRow ? (failedRow.detail?.error as string) || null : null,
      steps,
    });
  }
  return traces.sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );
}

export type TraceFilter = {
  onlyFailed?: boolean;
  flow?: "all" | "login" | "link";
  search?: string;
};

export function filterTraces(traces: LineTrace[], f: TraceFilter): LineTrace[] {
  const q = (f.search || "").trim().toLowerCase();
  return traces.filter((t) => {
    if (f.onlyFailed && !t.failed) return false;
    if (f.flow && f.flow !== "all" && t.flow !== f.flow) return false;
    if (!q) return true;
    return (
      t.traceId.toLowerCase().includes(q) ||
      (t.error || "").toLowerCase().includes(q) ||
      t.steps.some((s) => String(s.detail?.step || "").toLowerCase().includes(q))
    );
  });
}

export function tracesToCsv(traces: LineTrace[]): string {
  const head = ["trace_id", "time", "step", "ok", "stage_ms", "flow", "source", "error"];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [head.join(",")];
  for (const t of traces) {
    for (const s of t.steps) {
      lines.push(
        [
          t.traceId,
          s.created_at,
          s.detail?.step ?? "",
          s.detail?.ok ?? "",
          s.detail?.stage_ms ?? "",
          s.detail?.flow ?? "",
          s.detail?.source ?? "",
          s.detail?.error ?? "",
        ]
          .map(esc)
          .join(","),
      );
    }
  }
  return lines.join("\n");
}

export const STEP_LABEL_TH: Record<string, string> = {
  start_requested: "เริ่มขอเข้าสู่ระบบ",
  start_rejected: "ปฏิเสธตั้งแต่เริ่ม",
  state_created: "สร้าง state/PKCE",
  state_persist_failed: "บันทึก state ไม่สำเร็จ",
  authorize_url_issued: "ส่งลิงก์ไป LINE",
  callback_received: "LINE ส่ง code กลับ",
  state_consumed: "ตรวจ state ผ่าน",
  state_invalid: "state ไม่ถูกต้อง/หมดอายุ",
  token_exchanged: "แลก token สำเร็จ",
  token_exchange_failed: "แลก token ไม่สำเร็จ",
  id_token_verified: "ยืนยัน id_token สำเร็จ",
  id_token_rejected: "id_token ไม่ผ่าน",
  user_resolved: "หา/สร้างบัญชีผู้ใช้",
  line_linked: "เชื่อมบัญชี LINE",
  link_rejected: "เชื่อมบัญชีไม่สำเร็จ",
  magiclink_generated: "สร้างลิงก์ session",
  magiclink_failed: "สร้างลิงก์ session ไม่สำเร็จ",
  handoff_persisted: "บันทึกรหัสส่งต่อ",
  redirected_to_app: "ส่งกลับหน้าเว็บ",
  handoff_consumed: "ใช้รหัสส่งต่อ",
  handoff_invalid: "รหัสส่งต่อไม่ถูกต้อง",
  session_created: "สร้าง session สำเร็จ",
  session_failed: "สร้าง session ไม่สำเร็จ",
  client_start_requested: "ผู้ใช้กดเข้าสู่ระบบ (เบราว์เซอร์)",
  client_start_failed: "ขอลิงก์ LINE ไม่สำเร็จ (เบราว์เซอร์)",
  client_callback_failed: "กลับจาก LINE แล้วล้มเหลว (เบราว์เซอร์)",
  client_error_returned: "กลับมาหน้าเข้าสู่ระบบพร้อม error",
  client_retry: "เริ่ม OAuth ใหม่อัตโนมัติ",
};

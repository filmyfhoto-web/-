export type ValidationLevel = "ok" | "warn" | "error";
export type ValidationResult = { level: ValidationLevel; issues: string[] };

function merge(a: ValidationLevel, b: ValidationLevel): ValidationLevel {
  const order: ValidationLevel[] = ["ok", "warn", "error"];
  return order[Math.max(order.indexOf(a), order.indexOf(b))];
}

export function validateWebhookUrl(
  url: string,
  opts: { projectRef?: string; channelSecretShape?: string } = {},
): ValidationResult {
  const issues: string[] = [];
  let level: ValidationLevel = "ok";

  if (!url) return { level: "error", issues: ["ยังไม่ได้ตั้ง Webhook URL"] };
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { level: "error", issues: ["รูปแบบ URL ไม่ถูกต้อง"] };
  }
  if (u.protocol !== "https:") {
    issues.push("ต้องเป็น https:// เท่านั้น");
    level = merge(level, "error");
  }
  const hostOk =
    /\.functions\.supabase\.co$/i.test(u.hostname) ||
    (/\.supabase\.co$/i.test(u.hostname) && u.pathname.startsWith("/functions/v1/"));
  if (!hostOk) {
    issues.push("host ควรลงท้ายด้วย .functions.supabase.co หรือ .supabase.co/functions/v1");
    level = merge(level, "warn");
  }
  if (!u.pathname.endsWith("/line-webhook")) {
    issues.push("path ต้องลงท้ายด้วย /line-webhook");
    level = merge(level, "error");
  }
  if (opts.projectRef && !url.includes(opts.projectRef)) {
    issues.push("URL ไม่ตรงกับ project ปัจจุบัน — ตรวจ project ref อีกครั้ง");
    level = merge(level, "warn");
  }
  if (opts.channelSecretShape && opts.channelSecretShape !== "hex32_ok") {
    issues.push(
      opts.channelSecretShape === "missing"
        ? "ต้องตั้ง LINE_CHANNEL_SECRET ก่อน มิฉะนั้น webhook จะถูก reject"
        : "LINE_CHANNEL_SECRET รูปแบบผิด (ต้องเป็น hex 32 ตัว)",
    );
    level = merge(level, "error");
  }
  return { level, issues };
}

export function validateLiffEndpoint(
  url: string,
  opts: { expectedOrigin?: string; allowList?: string[]; liffId?: string | null } = {},
): ValidationResult {
  const issues: string[] = [];
  let level: ValidationLevel = "ok";

  if (!url) return { level: "error", issues: ["ยังไม่ได้ตั้ง LIFF Endpoint URL"] };
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { level: "error", issues: ["รูปแบบ URL ไม่ถูกต้อง"] };
  }
  if (u.protocol !== "https:") {
    issues.push("LINE บังคับใช้ https:// เท่านั้น");
    level = merge(level, "error");
  }
  if (opts.expectedOrigin) {
    try {
      const eo = new URL(opts.expectedOrigin);
      if (eo.hostname !== u.hostname) {
        issues.push(`host ไม่ตรงกับโดเมนที่เผยแพร่ (${eo.hostname})`);
        level = merge(level, "warn");
      }
    } catch { /* ignore */ }
  }
  const pathOk =
    u.pathname.endsWith("/liff/link") ||
    (opts.allowList ?? []).some((allowed) => {
      try {
        return new URL(allowed).pathname === u.pathname;
      } catch {
        return false;
      }
    });
  if (!pathOk) {
    issues.push("path ควรลงท้าย /liff/link หรืออยู่ใน allow-list");
    level = merge(level, "warn");
  }
  if (opts.liffId != null) {
    if (!opts.liffId) {
      issues.push("ยังไม่ได้ตั้ง LIFF ID");
      level = merge(level, "error");
    } else if (!/^\d{10}-[A-Za-z0-9]+$/.test(opts.liffId)) {
      issues.push("รูปแบบ LIFF ID ไม่ถูกต้อง (คาดว่าเป็น 1234567890-xxxxxxxx)");
      level = merge(level, "warn");
    }
  }
  return { level, issues };
}

export function summarize(results: ValidationResult[]): { level: ValidationLevel; count: number } {
  const level = results.reduce<ValidationLevel>((acc, r) => merge(acc, r.level), "ok");
  const count = results.reduce((n, r) => n + r.issues.length, 0);
  return { level, count };
}
// Multi-OA LINE channel registry.
//
// Both shops' LINE Official Accounts point at the same webhook URL. Each OA
// signs its payload with its OWN channel secret and needs its OWN access
// token for replies, so we keep a list of channels and pick the one whose
// secret validates the incoming signature.
//
// Sources (merged, ENVIRONMENT WINS):
//   - env per channel id: LINE_SECRET_<ID> / LINE_TOKEN_<ID>
//     (e.g. LINE_SECRET_RUNQUEUE / LINE_TOKEN_RUNQUEUE)
//   - legacy env: LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN (id "default")
//                 NW_LINE_CHANNEL_SECRET / NW_LINE_CHANNEL_ACCESS_TOKEN (id "shop2")
//   - public.line_credentials rows — metadata always, secrets only as a
//     fallback for channels that do not have env values yet. Secrets should be
//     purged from the table once the matching env values are in place.
import { createHmac, timingSafeEqual } from "node:crypto";

export interface LineChannel {
  id: string;
  label: string | null;
  secret: string;
  token: string;
  botBasicId?: string | null;
  /**
   * ช่องที่มาจาก env ซึ่งซ้ำ id กับแถวใน DB — เก็บไว้เพื่อตรวจลายเซ็น webhook
   * เท่านั้น ไม่ใช่ร้านจริง จึงต้องไม่แสดงในหน้าสถานะ/รายงาน
   */
  signatureOnly?: boolean;
}

export const LINE_CHANNEL_LABELS: Record<string, string> = {
  default: "ร้านที่ 1 (หลัก)",
  shop2: "ร้านที่ 2",
  runqueue: "รันคิว (NATTA.Q AI)",
  natta: "น้องนัตต้า (ผู้ช่วยบัญชี Film Shop)",
};

/** ชื่อ env ต่อช่อง เช่น "runqueue" → LINE_SECRET_RUNQUEUE / LINE_TOKEN_RUNQUEUE */
export function envKeysFor(id: string): { secret: string; token: string } {
  const key = String(id).toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  return { secret: `LINE_SECRET_${key}`, token: `LINE_TOKEN_${key}` };
}

export function envCredentials(id: string): { secret: string; token: string } {
  const k = envKeysFor(id);
  let secret = Deno.env.get(k.secret) || "";
  let token = Deno.env.get(k.token) || "";
  if (id === "default") {
    secret ||= Deno.env.get("LINE_CHANNEL_SECRET") || "";
    token ||= Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") || "";
  }
  if (id === "shop2") {
    secret ||= Deno.env.get("NW_LINE_CHANNEL_SECRET") || "";
    token ||= Deno.env.get("NW_LINE_CHANNEL_ACCESS_TOKEN") || "";
  }
  return { secret, token };
}

export async function loadLineChannels(admin: any): Promise<LineChannel[]> {
  const byId = new Map<string, LineChannel>();

  const envPairs: Array<[string, string, string]> = [
    ...["natta", "default", "shop2", "runqueue"].map((id) => {
      const c = envCredentials(id);
      return [id, c.secret, c.token] as [string, string, string];
    }),
  ];
  for (const [id, secret, token] of envPairs) {
    if (!secret && !token) continue;
    byId.set(id, { id, label: LINE_CHANNEL_LABELS[id] ?? id, secret, token });
  }

  try {
    const { data } = await admin
      .from("line_credentials")
      .select("id, channel_secret, channel_access_token, bot_display_name, bot_basic_id");
    for (const r of (data ?? []) as any[]) {
      const id = String(r.id);
      const prev = byId.get(id);
      const env = envCredentials(id);
      byId.set(id, {
        id,
        label: r.bot_display_name || LINE_CHANNEL_LABELS[id] || prev?.label || id,
        // env ชนะเสมอ — ค่าใน DB เป็นแค่ fallback ระหว่างย้ายค่าเข้า env
        secret: env.secret || prev?.secret || (r.channel_secret as string) || "",
        token: env.token || prev?.token || (r.channel_access_token as string) || "",
        botBasicId: (r.bot_basic_id as string) ?? null,
      });
    }
  } catch (e) {
    console.warn("loadLineChannels: db read failed, using env only", e);
  }

  // A DB row with the same id must not hide a secret that has a DIFFERENT
  // value — otherwise webhooks signed by that channel fail the signature
  // check. Keep every known secret as a signature candidate.
  const out = Array.from(byId.values());
  for (const [id, secret, token] of envPairs) {
    if (!secret) continue;
    if (out.some((c) => c.secret === secret)) continue;
    out.push({ id: `${id}:env`, label: `${LINE_CHANNEL_LABELS[id] ?? id} (env)`, secret, token, signatureOnly: true });
  }
  return out;
}

/** Returns the channel whose secret produces the given x-line-signature. */
export function matchChannelBySignature(
  channels: LineChannel[],
  rawBody: string,
  signature: string | null,
): LineChannel | null {
  if (!signature) return null;
  let provided: Uint8Array;
  try { provided = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0)); }
  catch { return null; }
  for (const ch of channels) {
    if (!ch.secret) continue;
    const expected = createHmac("sha256", ch.secret).update(rawBody).digest();
    if (provided.length !== expected.length) continue;
    try { if (timingSafeEqual(expected, provided)) return ch; } catch { /* next */ }
  }
  return null;
}

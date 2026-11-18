/**
 * POS receipt note encoding.
 *
 * `pos_receipts.notes` is a single free-text column, so structured extras
 * (sale channel, ครู's โรงเรียน/หน่วยงาน, and the cashier's reason for a
 * "ลงบัญชี" bill) are encoded as `key: value` segments joined by " · ".
 * Parsing is tolerant: unknown segments are kept as the free-text note so
 * nothing typed by a cashier is ever lost.
 */

export type PosNoteParts = {
  channel?: string | null;
  org?: string | null;
  note?: string | null;
};

const CHANNEL_KEY = "ช่องทาง";
const ORG_KEY = "หน่วยงาน";
const NOTE_KEY = "หมายเหตุ";

export function buildPosNotes(parts: PosNoteParts): string {
  return [
    parts.channel?.trim() ? `${CHANNEL_KEY}: ${parts.channel.trim()}` : null,
    parts.org?.trim() ? `${ORG_KEY}: ${parts.org.trim()}` : null,
    parts.note?.trim() ? `${NOTE_KEY}: ${parts.note.trim()}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function parsePosNotes(notes: string | null | undefined): Required<PosNoteParts> {
  const out = { channel: null as string | null, org: null as string | null, note: null as string | null };
  if (!notes) return out;
  const free: string[] = [];
  for (const raw of String(notes).split(/[·|]/)) {
    const seg = raw.trim();
    if (!seg) continue;
    const m = /^([^:]+):\s*(.*)$/.exec(seg);
    const key = m?.[1]?.trim();
    const val = m?.[2]?.trim() ?? "";
    if (key === CHANNEL_KEY) out.channel = val || null;
    else if (key === ORG_KEY) out.org = val || null;
    else if (key === NOTE_KEY) out.note = val || null;
    else free.push(seg);
  }
  if (free.length) out.note = [out.note, ...free].filter(Boolean).join(" · ");
  return out;
}

/** Bucket label for reports — unnamed orgs group together instead of vanishing. */
export function orgLabel(org: string | null | undefined): string {
  const v = (org || "").trim();
  return v || "ไม่ระบุโรงเรียน/หน่วยงาน";
}

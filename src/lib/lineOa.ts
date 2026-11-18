/**
 * LINE Official Account helpers.
 *
 * Every store has its own OA Basic ID (e.g. "@756bvbvq"). Opening a chat must
 * always use the Basic ID of the store the customer wrote to — never a shared
 * or hard-coded one.
 */

/** Normalise any stored value ("756bvbvq", "@756bvbvq", " @x ") to "@id". */
export function normalizeLineBasicId(input: string | null | undefined): string | null {
  const v = (input ?? '').trim();
  if (!v) return null;
  const withAt = v.startsWith('@') ? v : `@${v}`;
  return /^@[a-zA-Z0-9._-]+$/.test(withAt) ? withAt : null;
}

/** Throws when the Basic ID is invalid — use `canOpenLineOa` to guard the UI. */
export function getLineOaChatUrl(basicId: string) {
  const normalized = basicId.trim();

  if (!/^@[a-zA-Z0-9._-]+$/.test(normalized)) {
    throw new Error('LINE Basic ID ไม่ถูกต้อง');
  }

  return `https://line.me/R/oaMessage/${encodeURIComponent(normalized)}`;
}

/** True when this store has a usable LINE Basic ID. */
export function canOpenLineOa(basicId: string | null | undefined): boolean {
  return normalizeLineBasicId(basicId) !== null;
}

/** Chat URL or null (never throws) — works on iOS, Android and desktop. */
export function safeLineOaChatUrl(basicId: string | null | undefined): string | null {
  const id = normalizeLineBasicId(basicId);
  return id ? getLineOaChatUrl(id) : null;
}

export const LINE_OA_NOT_CONFIGURED_TH = 'กรุณาตั้งค่า LINE OA ของร้านนี้';

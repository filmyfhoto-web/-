/**
 * Helpers for the customer LINE profile shown on "ฉัน" / "บัญชีของฉัน".
 *
 * Source of truth is `profiles` (line_user_id / line_display_name /
 * line_picture_url, written server-side by the audited LINE OAuth + link
 * flows) plus the server-verified binding lookup. Nothing here invents a
 * new auth flow.
 */

/**
 * Accounts created by LINE login get a synthetic auth identifier such as
 * `line.u4f98...@line-login.local`. It is NOT an email address and must
 * never be shown or pre-filled into an email field.
 */
export function isSyntheticLineEmail(email: string | null | undefined): boolean {
  const v = (email || "").trim().toLowerCase();
  if (!v) return false;
  return v.endsWith("@line-login.local") || /^line\.u[0-9a-f]{32}@/.test(v);
}

/** Real email or null when the stored value is a synthetic LINE identifier. */
export function realEmail(email: string | null | undefined): string | null {
  const v = (email || "").trim();
  if (!v || isSyntheticLineEmail(v)) return null;
  return v;
}

export const NO_EMAIL_PLACEHOLDER = "ยังไม่ได้เพิ่มอีเมล";

/** Neat initial fallback when LINE has no picture. */
export function profileInitial(name: string | null | undefined): string {
  const v = (name || "").trim();
  if (!v) return "?";
  return Array.from(v)[0]!.toUpperCase();
}

/** Only https pictures (LINE CDN) are ever rendered. */
export function safePictureUrl(url: string | null | undefined): string | null {
  const v = (url || "").trim();
  if (!v || !/^https:\/\//i.test(v)) return null;
  return v;
}

// Shared helpers for the customer LINE Login (OAuth 2.1 + OIDC) web flow.
// No client-supplied identity is ever trusted: the code is exchanged
// server-side and the id_token is validated with LINE's official endpoint.

export const LINE_AUTHORIZE_URL = "https://access.line.me/oauth2/v2.1/authorize";
export const LINE_TOKEN_URL = "https://api.line.me/oauth2/v2.1/token";
export const LINE_VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";
export const LINE_ISSUER = "https://access.line.me";

/** This project's identifiers — never allow other Lovable projects. */
const LOVABLE_PROJECT_ID = "fc0147af-4678-4fa7-b23f-43d82e8ddfe9";
const LOVABLE_PROD_HOST = "www-filmyynatta-com.lovable.app";

const CUSTOM_DOMAINS = ["filmyynatta.com", "nattafilmyy.today", "yynatta-admin.com"];

function isOwnLovableHost(host: string): boolean {
  if (host === LOVABLE_PROD_HOST) return true;
  // Preview hosts always end with .lovable.app or .lovableproject.com and must
  // contain this project's id as a label (id-preview--<id>, <sha>--<id>, <id>).
  if (!host.endsWith(".lovable.app") && !host.endsWith(".lovableproject.com")) return false;
  const sub = host.split(".")[0];
  if (sub === LOVABLE_PROJECT_ID) return true;
  const parts = sub.split("--");
  return parts.length >= 2 && parts[parts.length - 1] === LOVABLE_PROJECT_ID;
}

/** Origins allowed to start / finish a customer LINE login. */
export function allowedOrigin(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const ok =
    host === "localhost" ||
    host === "127.0.0.1" ||
    CUSTOM_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`)) ||
    isOwnLovableHost(host);
  if (!ok) return null;
  return url.origin;
}

/**
 * Strict same-origin relative path. Rejects absolute URLs, protocol-relative
 * paths, backslash tricks and anything that is not a plain in-app path.
 */
export function safeNextPath(raw: unknown, fallback = "/account"): string {
  if (typeof raw !== "string") return fallback;
  const v = raw.trim();
  if (!v) return fallback;
  if (!v.startsWith("/")) return fallback;
  if (v.startsWith("//") || v.startsWith("/\\")) return fallback;
  if (v.includes("\\")) return fallback;
  if (/^\/+[a-z][a-z0-9+.-]*:/i.test(v)) return fallback;
  if (/[\u0000-\u001f\s]/.test(v)) return fallback;
  if (v.length > 512) return fallback;
  return v;
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomToken(size = 32): string {
  const buf = new Uint8Array(size);
  crypto.getRandomValues(buf);
  return b64url(buf);
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(digest));
}

export type LineIdTokenClaims = {
  iss?: string;
  sub?: string;
  aud?: string;
  exp?: number;
  nonce?: string;
  name?: string;
  picture?: string;
  email?: string;
};

/**
 * Validate id_token claims: issuer, audience, expiry and nonce.
 * Signature validity comes from LINE's official /oauth2/v2.1/verify endpoint,
 * which is what produced these claims.
 */
export function validateIdTokenClaims(
  claims: LineIdTokenClaims,
  opts: { channelId: string; nonce: string; now?: number },
): { ok: true } | { ok: false; error: string } {
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (!claims?.sub) return { ok: false, error: "id_token_missing_sub" };
  if (claims.iss !== LINE_ISSUER) return { ok: false, error: "id_token_issuer_mismatch" };
  if (String(claims.aud || "") !== String(opts.channelId)) return { ok: false, error: "id_token_aud_mismatch" };
  if (typeof claims.exp !== "number" || claims.exp <= now) return { ok: false, error: "id_token_expired" };
  if (!claims.nonce || claims.nonce !== opts.nonce) return { ok: false, error: "id_token_nonce_mismatch" };
  return { ok: true };
}
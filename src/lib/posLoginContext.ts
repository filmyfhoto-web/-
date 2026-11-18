/**
 * Keeps the POS PWA (🏪) context alive across the staff sign-in round trip.
 *
 * The installed register icon opens `/launch?app=pos`. When nobody is signed
 * in we must send the user to the staff login *without* losing `app=pos` —
 * otherwise the document swaps to the staff manifest mid-login and the user
 * lands on `/staff/home` instead of the register.
 *
 * `next` is attacker-controllable (it rides in the URL), so it is read through
 * a strict allowlist: no absolute URLs, no protocol-relative paths, no
 * arbitrary in-app routes.
 */
import type { PwaApp } from "./pwaManifest";

export const POS_LOGIN_PATH = "/staff?app=pos&next=%2Fpos%2Fregister";

/** Only these in-app destinations may be requested via `?next=`. */
export const SAFE_NEXT_PATHS = [
  "/pos/register",
  "/pos",
  "/pos/stock",
  "/staff/inbox",
  "/staff/home",
  "/admin/home",
  "/admin/today",
  "/receipts",
  "/film-shop",
  "/film-shop/app",
] as const;

export type SafeNext = string;

const APPS: PwaApp[] = ["customer", "staff", "admin", "pos", "receipts", "film-shop"];

/**
 * Returns the `next` path only when it is a known, same-origin app route.
 * The query string is preserved (e.g. `/film-shop/app?p=orders&order=…`) so a
 * deep link from a LINE notification still lands on the exact record.
 */
export function safeNext(next: string | null | undefined): SafeNext | null {
  if (!next) return null;
  let value = next.trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    /* keep the raw value — the allowlist below rejects anything odd */
  }
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (value.includes("\\")) return null;
  const path = value.split("?")[0].split("#")[0];
  return (SAFE_NEXT_PATHS as readonly string[]).includes(path) ? (value as SafeNext) : null;
}

export type LoginContext = { app: PwaApp | null; next: SafeNext | null };

/** Read `app` + `next` out of a location search string, allowlisted. */
export function readLoginContext(search: string): LoginContext {
  const q = new URLSearchParams(search || "");
  const raw = q.get("app");
  const app = (APPS as string[]).includes(raw ?? "") ? (raw as PwaApp) : null;
  return { app, next: safeNext(q.get("next")) };
}

/** `/pos/register` → `/pos/register?app=pos` so the manifest stays on POS. */
export function withApp(path: string, app: PwaApp | null): string {
  if (!app) return path;
  const [p, hash] = path.split("#");
  const [base, query] = p.split("?");
  const q = new URLSearchParams(query || "");
  q.set("app", app);
  return `${base}?${q.toString()}${hash ? `#${hash}` : ""}`;
}

export type LoginRole = {
  isOwner?: boolean;
  isAdmin?: boolean;
  isStaffAny?: boolean;
  canPos?: boolean;
  canStock?: boolean;
};

function roleAllows(path: SafeNext, r: LoginRole): boolean {
  const base = path.split("?")[0].split("#")[0];
  const admin = !!r.isOwner || !!r.isAdmin;
  if (base === "/admin/home" || base === "/admin/today") return admin;
  if (base === "/pos/register" || base === "/pos") return admin || !!r.canPos;
  if (base === "/pos/stock") return admin || !!r.canStock;
  if (base === "/receipts" || base === "/film-shop" || base === "/film-shop/app") return admin || !!r.isStaffAny;
  return admin || !!r.isStaffAny;
}

/** Fallback home for a signed-in staff member that may not open the register. */
export function allowedHome(r: LoginRole): string {
  if (r.isOwner || r.isAdmin) return "/admin/home";
  if (r.isStaffAny) {
    if (r.canPos) return "/pos";
    if (r.canStock) return "/pos/stock";
    return "/staff/inbox";
  }
  return "/shop";
}

/**
 * Where a freshly signed-in staff member should land, honouring the installed
 * app + requested `next`, but never granting access their role lacks.
 */
export function resolvePostLoginTarget(ctx: LoginContext, r: LoginRole): string {
  const wanted = ctx.next
    ?? (ctx.app === "pos" ? "/pos/register"
      : ctx.app === "receipts" ? "/receipts"
        : ctx.app === "film-shop" ? "/admin/home"
          : null);
  if (wanted && roleAllows(wanted, r)) return withApp(wanted, ctx.app);
  return withApp(allowedHome(r), ctx.app === "pos" ? null : ctx.app);
}

/**
 * Magic-link return URL. POS users come back through `/launch?app=pos` so the
 * manifest + role check run again instead of dumping them on `/staff/home`.
 */
export function magicLinkRedirect(origin: string, ctx: LoginContext): string {
  if (ctx.app) return `${origin}/launch?app=${ctx.app}`;
  return `${origin}/staff/home`;
}

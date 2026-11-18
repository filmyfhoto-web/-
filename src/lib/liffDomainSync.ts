// Keeps LIFF endpoint + callback allowlist in sync with the domain the app is
// actually served from, so switching/adding a domain never breaks LINE login.
import { STAFF_CALLBACK_URLS } from "@/lib/lineCallbacks";

export const LIFF_ENDPOINT_PATH = "/l/shop";

export function normalizeOrigin(origin: string): string {
  return (origin || "").trim().replace(/\/+$/, "");
}

/** Only stable public https hosts should be written into LINE settings. */
export function isSyncableOrigin(origin: string): boolean {
  const o = normalizeOrigin(origin);
  if (!o.startsWith("https://")) return false;
  const host = o.slice("https://".length).split("/")[0];
  if (!host || host.startsWith("localhost") || host.startsWith("127.")) return false;
  return host.includes(".");
}

export function endpointForOrigin(origin: string): string {
  return `${normalizeOrigin(origin)}${LIFF_ENDPOINT_PATH}`;
}

/** Callback URLs this origin needs, merged with the known static hosts. */
export function expectedCallbackUrls(origin: string, serverCallbackUrl?: string | null): string[] {
  const o = normalizeOrigin(origin);
  const list = [
    ...(serverCallbackUrl ? [serverCallbackUrl.replace(/\/+$/, "")] : []),
    ...STAFF_CALLBACK_URLS,
  ];
  if (isSyncableOrigin(o)) {
    list.push(`${o}/staff`, `${o}/customer/login`, endpointForOrigin(o));
  }
  return Array.from(new Set(list));
}

export function missingCallbackUrls(current: string[] | null | undefined, expected: string[]): string[] {
  const have = new Set((current ?? []).map((u) => u.trim().replace(/\/+$/, "")));
  return expected.filter((u) => !have.has(u));
}

export type LiffSyncPlan = {
  origin: string;
  syncable: boolean;
  endpoint: string;
  endpointChanged: boolean;
  missing: string[];
  nextCallbacks: string[];
  needsSync: boolean;
};

export function buildSyncPlan(opts: {
  origin: string;
  currentEndpoint?: string | null;
  currentCallbacks?: string[] | null;
  serverCallbackUrl?: string | null;
}): LiffSyncPlan {
  const origin = normalizeOrigin(opts.origin);
  const syncable = isSyncableOrigin(origin);
  const endpoint = endpointForOrigin(origin);
  const expected = expectedCallbackUrls(origin, opts.serverCallbackUrl);
  const missing = missingCallbackUrls(opts.currentCallbacks, expected);
  const endpointChanged =
    syncable && (opts.currentEndpoint ?? "").trim().replace(/\/+$/, "") !== endpoint;
  const nextCallbacks = Array.from(
    new Set([...(opts.currentCallbacks ?? []).map((u) => u.trim().replace(/\/+$/, "")), ...expected]),
  ).filter(Boolean);
  return {
    origin,
    syncable,
    endpoint,
    endpointChanged,
    missing,
    nextCallbacks,
    needsSync: syncable && (endpointChanged || missing.length > 0),
  };
}

/**
 * Admin-configurable home-screen identity per installable app.
 *
 * Owners/admins can rename the shortcut and swap its icon in
 * /admin/app-shortcuts; the values live in `pwa_app_profiles` and override the
 * static manifests in /public at runtime (via a generated Blob manifest).
 * `start_url`, `scope` and `id` are never overridden — changing those would
 * orphan already-installed icons.
 */
import { supabase } from "@/integrations/supabase/client";
import { PWA_APPS, type PwaApp } from "./pwaManifest";

export type PwaAppProfile = {
  app: "admin" | "staff" | "pos";
  name: string | null;
  short_name: string | null;
  description: string | null;
  theme_color: string | null;
  icon_192_url: string | null;
  icon_512_url: string | null;
  apple_icon_url: string | null;
};

export const PWA_ICON_BUCKET = "pwa-icons";
const ICON_URL_TTL = 60 * 60 * 24 * 365 * 5;
const CACHE_KEY = "pwa.appProfiles.v1";

export const CONFIGURABLE_APPS: PwaAppProfile["app"][] = ["admin", "staff", "pos"];

export function emptyAppProfile(app: PwaAppProfile["app"]): PwaAppProfile {
  return {
    app,
    name: null,
    short_name: null,
    description: null,
    theme_color: null,
    icon_192_url: null,
    icon_512_url: null,
    apple_icon_url: null,
  };
}

function readCache(): Record<string, PwaAppProfile> {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, PwaAppProfile>) : {};
  } catch {
    return {};
  }
}

function writeCache(map: Record<string, PwaAppProfile>) {
  try { window.localStorage.setItem(CACHE_KEY, JSON.stringify(map)); } catch { /* ignore */ }
}

/** Cached copy — used on first paint and when offline. */
export function cachedAppProfile(app: PwaApp): PwaAppProfile | null {
  if (typeof window === "undefined") return null;
  return readCache()[app] ?? null;
}

export async function fetchAppProfiles(): Promise<PwaAppProfile[]> {
  const { data, error } = await supabase
    .from("pwa_app_profiles" as any)
    .select("app,name,short_name,description,theme_color,icon_192_url,icon_512_url,apple_icon_url");
  if (error || !data) return [];
  const rows = data as unknown as PwaAppProfile[];
  const map = readCache();
  for (const r of rows) map[r.app] = r;
  writeCache(map);
  return rows;
}

export async function saveAppProfile(p: PwaAppProfile): Promise<void> {
  const { error } = await supabase
    .from("pwa_app_profiles" as any)
    .upsert({ ...p, updated_at: new Date().toISOString() } as any, { onConflict: "app" });
  if (error) throw error;
  const map = readCache();
  map[p.app] = p;
  writeCache(map);
}

/** Upload one icon size and return a durable signed URL. */
export async function uploadAppIcon(app: string, size: number, blob: Blob): Promise<string> {
  const path = `${app}/icon-${size}-${Date.now()}.png`;
  const { error } = await supabase.storage
    .from(PWA_ICON_BUCKET)
    .upload(path, blob, { upsert: true, contentType: "image/png" });
  if (error) throw error;
  const { data, error: sErr } = await supabase.storage.from(PWA_ICON_BUCKET).createSignedUrl(path, ICON_URL_TTL);
  if (sErr || !data?.signedUrl) throw sErr ?? new Error("สร้างลิงก์ไอคอนไม่สำเร็จ");
  return data.signedUrl;
}

type ManifestJson = Record<string, unknown> & { icons?: { src: string; sizes: string; type: string; purpose: string }[] };

/**
 * Merge the admin overrides into the static manifest JSON. Only name,
 * short_name, description, theme_color and icons may change.
 */
export function mergeManifest(base: ManifestJson, p: PwaAppProfile | null): ManifestJson {
  if (!p) return base;
  const out: ManifestJson = { ...base };
  if (p.name?.trim()) out.name = p.name.trim();
  if (p.short_name?.trim()) out.short_name = p.short_name.trim();
  if (p.description?.trim()) out.description = p.description.trim();
  if (p.theme_color?.trim()) out.theme_color = p.theme_color.trim();
  const i192 = p.icon_192_url;
  const i512 = p.icon_512_url;
  if (i192 || i512) {
    const src192 = i192 ?? i512!;
    const src512 = i512 ?? i192!;
    out.icons = [
      { src: src192, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: src192, sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: src512, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: src512, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ];
  }
  return out;
}

let blobUrl: string | null = null;

/**
 * Rewrite `<link rel="manifest">` to a Blob manifest built from the DB
 * overrides. Does nothing when the app has no overrides configured.
 */
export async function applyAppProfileOverrides(app: PwaApp, profile?: PwaAppProfile | null): Promise<boolean> {
  if (typeof document === "undefined") return false;
  const base = PWA_APPS[app];
  if (!base.manifest) return false;
  const p = profile ?? cachedAppProfile(app);
  if (!p || (!p.name && !p.short_name && !p.theme_color && !p.icon_192_url && !p.icon_512_url && !p.apple_icon_url)) {
    return false;
  }

  let json: ManifestJson;
  try {
    const res = await fetch(base.manifest, { cache: "no-cache" });
    json = (await res.json()) as ManifestJson;
  } catch {
    return false;
  }

  const merged = mergeManifest(json, p);
  const link = document.head.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (!link) return false;
  if (blobUrl) URL.revokeObjectURL(blobUrl);
  blobUrl = URL.createObjectURL(new Blob([JSON.stringify(merged)], { type: "application/manifest+json" }));
  link.setAttribute("href", blobUrl);

  if (p.theme_color?.trim()) {
    const theme = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (theme) theme.content = p.theme_color.trim();
  }
  const title = (p.short_name || p.name)?.trim();
  if (title) {
    const m = document.head.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');
    if (m) m.content = title;
  }
  const apple = p.apple_icon_url || p.icon_512_url || p.icon_192_url;
  if (apple) {
    document.head.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')?.setAttribute("href", apple);
  }
  return true;
}

/** Apply cached overrides now, then refresh from the database. */
export function syncAppProfileOverrides(app: PwaApp): void {
  void applyAppProfileOverrides(app);
  void fetchAppProfiles()
    .then((rows) => {
      const row = rows.find((r) => r.app === (app as string));
      if (row) void applyAppProfileOverrides(app, row);
    })
    .catch(() => { /* offline: cached overrides stay in place */ });
}
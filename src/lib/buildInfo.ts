/**
 * Single source of truth for the running build's identity.
 *
 * The three values are injected at build time by Vite (see `defineBuildInfo`
 * in vite.config.ts / vitest.config.ts) so nobody has to type a release date
 * by hand and the UI can never show a stale hard-coded value.
 */
declare const __APP_VERSION__: string;
declare const __APP_BUILT_AT__: string;
declare const __APP_COMMIT__: string;
declare const __APP_ENV__: string;

function read(name: string, value: () => string, fallback: string): string {
  try {
    const v = value();
    return typeof v === "string" && v.length > 0 ? v : fallback;
  } catch {
    return fallback;
  }
}

export interface BuildInfo {
  /** Semantic version of this release (package.json) */
  version: string;
  /** ISO timestamp of when this bundle was built */
  builtAt: string;
  /** Short commit/build identifier for support & debugging */
  commit: string;
  /** Deploy environment this bundle was built for (production / preview / development) */
  env: string;
}

export const BUILD_INFO: BuildInfo = {
  version: read("version", () => __APP_VERSION__, "0.0.0"),
  builtAt: read("builtAt", () => __APP_BUILT_AT__, new Date(0).toISOString()),
  commit: read("commit", () => __APP_COMMIT__, "dev"),
  env: read("env", () => __APP_ENV__, "development"),
};

/** Human label for the environment badge — never hard-coded in a page. */
export function envLabel(env: string = BUILD_INFO.env): string {
  const e = env.toLowerCase();
  if (e === "production" || e === "prod") return "Production";
  if (e === "preview" || e === "staging") return "Preview";
  return "Development";
}

/** "28 ก.ค. 2569 15:04 น." — Thai calendar, Asia/Bangkok. */
export function formatThaiDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || d.getTime() === 0) return "ไม่ทราบ";
  const s = new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return `${s} น.`;
}

/** Short, copy-friendly identifier shown to support: "1.1.0+8b276bab" */
export function buildLabel(info: BuildInfo = BUILD_INFO): string {
  return `${info.version}+${info.commit}`;
}

/**
 * True when the bundle that is running matches the build metadata compiled
 * into it — i.e. the user is not looking at a stale cached shell.
 */
export function isCurrentBuild(
  running: BuildInfo = BUILD_INFO,
  current: BuildInfo = BUILD_INFO,
): boolean {
  return running.version === current.version && running.commit === current.commit;
}
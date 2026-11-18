import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * Build-time constants shared by the app build (vite.config.ts) and the test
 * runner (vitest.config.ts) so UI and tests can never drift apart.
 */
export function defineBuildInfo(): Record<string, string> {
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as { version: string };
  let commit = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || "";
  if (!commit) {
    try {
      commit = execSync("git rev-parse HEAD", { cwd: root, stdio: ["ignore", "pipe", "ignore"] })
        .toString()
        .trim();
    } catch {
      commit = "";
    }
  }
  return {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_BUILT_AT__: JSON.stringify(new Date().toISOString()),
    __APP_COMMIT__: JSON.stringify((commit || "local").slice(0, 8)),
    __PWA_ASSET_VERSION__: JSON.stringify(`${pkg.version}-${(commit || "local").slice(0, 8)}`),
    __APP_ENV__: JSON.stringify(
      process.env.LOVABLE_ENV ||
        process.env.VERCEL_ENV ||
        (process.env.NODE_ENV === "production" ? "production" : process.env.NODE_ENV || "development"),
    ),
  };
}

/**
 * Release tag used as a cache-busting query (`?v=1.1.0-8b276bab`) on the
 * manifest and app icons. iOS caches both very aggressively, so a new
 * release must change the URL for the phone to re-fetch them.
 */
export function buildVersionTag(): string {
  const d = defineBuildInfo();
  const version = JSON.parse(d.__APP_VERSION__) as string;
  const commit = JSON.parse(d.__APP_COMMIT__) as string;
  return `${version}-${commit}`;
}
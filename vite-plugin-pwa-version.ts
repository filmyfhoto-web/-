import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";
import { buildVersionTag } from "./build-info.define";

/**
 * Cache-busting for installable-app assets.
 *
 * iOS (and Android to a lesser degree) caches `manifest.webmanifest` and the
 * icons it references by URL, so a new release can keep showing the old app
 * name/icon indefinitely. After the build we rewrite every emitted manifest
 * so its icon URLs carry the release tag (`/icon-192.png?v=1.1.0-8b276bab`).
 * The runtime (`src/lib/pwaManifest.ts`) appends the same tag to the
 * `<link rel="manifest">` and `apple-touch-icon` hrefs.
 *
 * `start_url`, `id`, `scope` and `display` are deliberately left untouched —
 * changing those breaks already-installed apps.
 */
export function pwaAssetVersion(): Plugin {
  return pwaAssetVersionBuild();
}

/**
 * Dev/preview server endpoint for `/version.json` so the update check and the
 * diagnostics page work outside a production build too. In `vite build` the
 * real file is emitted by `pwaAssetVersion()`.
 */
export function versionEndpoint(): Plugin {
  return {
    name: "version-endpoint",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/version.json", (_req, res) => {
        res.setHeader("content-type", "application/json");
        res.setHeader("cache-control", "no-store");
        res.end(JSON.stringify({ tag: buildVersionTag(), builtAt: new Date().toISOString(), env: "development" }));
      });
    },
  };
}

function pwaAssetVersionBuild(): Plugin {
  return {
    name: "pwa-asset-version",
    apply: "build",
    async closeBundle() {
      const tag = buildVersionTag();
      const outDir = path.resolve(process.cwd(), "dist");
      let entries: string[] = [];
      try {
        entries = await readdir(outDir);
      } catch {
        return;
      }
      // Tiny, never-precached probe file the running app polls to detect that
      // a newer build is live (see src/lib/buildUpdate.ts).
      try {
        await writeFile(
          path.join(outDir, "version.json"),
          JSON.stringify(
            {
              tag,
              builtAt: new Date().toISOString(),
              env:
                process.env.LOVABLE_ENV ||
                process.env.VERCEL_ENV ||
                "production",
            },
            null,
            2,
          ),
        );
      } catch {
        // never fail a build over the probe file
      }
      for (const file of entries.filter((f) => f.endsWith(".webmanifest"))) {
        const full = path.join(outDir, file);
        try {
          const json = JSON.parse(await readFile(full, "utf8")) as {
            icons?: { src?: string }[];
          };
          if (!Array.isArray(json.icons)) continue;
          json.icons = json.icons.map((icon) => {
            if (!icon.src || icon.src.includes("?v=")) return icon;
            return { ...icon, src: `${icon.src}?v=${encodeURIComponent(tag)}` };
          });
          await writeFile(full, JSON.stringify(json, null, 2));
        } catch {
          // a malformed manifest should never fail the build
        }
      }
    },
  };
}

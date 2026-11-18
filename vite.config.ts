import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";
import { VitePWA } from "vite-plugin-pwa";
import { defineBuildInfo } from "./build-info.define";
import { pwaAssetVersion, versionEndpoint } from "./vite-plugin-pwa-version";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: defineBuildInfo(),
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    mcpPlugin(),
    pwaAssetVersion(),
    versionEndpoint(),
    VitePWA({
      // The three workspaces each ship their own manifest file in /public,
      // swapped at runtime by src/lib/pwaManifest.ts — the plugin only
      // generates the service worker.
      injectRegister: null,
      registerType: "autoUpdate",
      manifest: false,
      devOptions: { enabled: false },
      filename: "sw.js",
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"],
        // The SPA shell must NEVER be served from the (cache-first) precache:
        // once index.html sits there, a phone keeps booting the old build and
        // route changes appear frozen until the SW happens to update.
        // Navigations go through the NetworkFirst "html-nav" route below.
        globIgnores: ["**/index.html"],
        // the main bundle is ~6 MB; precaching it keeps the app usable offline
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        // No precache navigation fallback: a Workbox NavigationRoute is
        // matched before runtimeCaching and would pin every navigation to the
        // precached shell. Offline navigations fall back to the html-nav
        // cache (warmed by src/lib/offlineWarm.ts).
        navigateFallback: undefined,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            // OAuth / auth callbacks and functions must always hit the
            // network — never a cached response.
            urlPattern: ({ url, sameOrigin }) =>
              !!sameOrigin && /^\/(~oauth|auth\/callback|functions)\//.test(`${url.pathname}/`),
            handler: "NetworkOnly",
          },
          {
            // The manifest and app icons decide the installed app's name and
            // home-screen icon: always prefer the network so a new release is
            // reflected as soon as the phone is online.
            urlPattern: ({ url, sameOrigin }) =>
              !!sameOrigin && (/\.webmanifest$/.test(url.pathname) || /^\/(icon-\d+|apple-touch-icon)\.png$/.test(url.pathname)),
            handler: "NetworkFirst",
            options: {
              cacheName: "pwa-assets",
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            // HTML navigations: always try the network first so a deploy is
            // picked up immediately; fall back to cache/offline page.
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "html-nav",
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            urlPattern: ({ url, request, sameOrigin }) =>
              sameOrigin && ["script", "style", "font"].includes(request.destination) && !!url,
            handler: "CacheFirst",
            options: {
              cacheName: "static-assets",
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // วิดีโอสอน + ไฟล์คำบรรยาย: เก็บไว้ดูซ้ำ/ออฟไลน์ได้
            urlPattern: ({ url }) =>
              /\/tutorials\/.+\.(mp4|vtt|srt)$/.test(url.pathname) ||
              (/^\/__l5e\/assets-v1\//.test(url.pathname) && /\.mp4$/.test(url.pathname)),
            handler: "CacheFirst",
            options: {
              cacheName: "tutorial-media",
              rangeRequests: true,
              expiration: { maxEntries: 24, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200, 206] },
            },
          },
          {
            urlPattern: ({ request }) => request.destination === "image",
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "images",
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 14 },
            },
          },

          {
            // Read-only backend GETs — lets lists still render when offline.
            // Cache keys include the auth token so users never see each
            // other's rows, and only GET is ever cached.
            urlPattern: ({ url, request }) =>
              request.method === "GET" && /\/rest\/v1\//.test(url.pathname),
            handler: "NetworkFirst",
            options: {
              cacheName: "api-read",
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 6 },
              cacheableResponse: { statuses: [200] },
              plugins: [
                {
                  cacheKeyWillBeUsed: async ({ request }: { request: Request }) => {
                    const auth = request.headers.get("authorization") || "anon";
                    // short, non-reversible-ish scope suffix per session token
                    const scope = auth.slice(-24);
                    const u = new URL(request.url);
                    u.searchParams.set("__u", scope);
                    return u.toString();
                  },
                },
              ],
            },
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    // Split the heavy, rarely-needed libraries out of the main bundle so the
    // first screen (and every route change) stays fast on mobile.
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return;
          if (/[\\/](jspdf|jspdf-autotable|html2canvas)[\\/]/.test(id)) return "vendor-pdf";
          if (/[\\/]pdfjs-dist[\\/]/.test(id)) return "vendor-pdfjs";
          if (/[\\/](xlsx|papaparse|jszip)[\\/]/.test(id)) return "vendor-sheets";
          if (/[\\/](recharts|d3-[^\\/]+|victory-vendor)[\\/]/.test(id)) return "vendor-charts";
          if (/[\\/](@zxing|qrcode|qrcode\.react)[\\/]/.test(id)) return "vendor-scan";
          if (/[\\/]@imgly[\\/]/.test(id)) return "vendor-imgly";
          // Let Rollup keep React, React DOM, Router and their transitive UI
          // dependencies in their natural graph. Forcing them together can
          // produce a circular production chunk where React is uninitialised.
          if (/[\\/]@supabase[\\/]/.test(id)) return "vendor-supabase";
          // everything else: let Rollup split per-route so no page downloads
          // libraries it does not use.
        },
      },
    },
  },
}));

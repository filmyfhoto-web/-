// ต้องมาก่อนทุก import ที่แตะ storage (supabase client) — iOS โหมดส่วนตัว /
// เบราว์เซอร์ใน LINE อาจโยน error ทันทีที่อ่าน localStorage แล้วแอปดับตั้งแต่บูต
import { installMobileRuntimeGuards } from "./lib/mobileRuntime";
installMobileRuntimeGuards();

import { createRoot } from "react-dom/client";
import { HelmetProvider } from "@/lib/head";
import App from "./App.tsx";
import "./index.css";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { registerAppServiceWorker } from "./lib/registerSW";
import { warmOfflineCache } from "./lib/offlineWarm";
import { toast } from "sonner";
import { applyMotionPref, watchMotionPref } from "./lib/motionPref";
import { applyDisplayPrefs } from "./lib/displayPref";
import { applyLayoutPref } from "./lib/layoutPref";

import { enforceCanonicalHost } from "./lib/hostMode";
import { syncBuildCaches } from "./lib/appUpdate";
import { RUNNING_TAG } from "./lib/buildUpdate";
import { rescueStaleShell } from "./lib/staleShellRescue";

// Never serve the shop from the Lovable mirror host — LINE round-trips and
// installed icons must stay on filmyynatta.com.
const movingToCanonicalHost = enforceCanonicalHost();

// Older builds appended a `?v=<ts>` cache-buster when refreshing. It sticks to
// every link the user then shares and re-triggers refresh logic, so clean it
// out of the address bar without reloading.
if (typeof window !== "undefined" && !movingToCanonicalHost) {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has("v")) {
      url.searchParams.delete("v");
      window.history.replaceState(window.history.state, "", url.toString());
    }
  } catch { /* ignore */ }
}

// Apply the reduced-motion preference before first paint.
applyMotionPref();
watchMotionPref();
applyDisplayPrefs();
applyLayoutPref();


// Handle lazy loading errors (Module script runtime error) by forcing a reload.
// This happens when a new deploy prunes old chunks but the client has old cache.
if (typeof window !== "undefined") {
  window.addEventListener("error", (e) => {
    const msg = e.message || "";
    if (msg.includes("Importing a module script failed") || msg.includes("Failed to fetch dynamically imported module")) {
      console.warn("Module load failure detected, forcing app update...");
      window.location.reload();
    }
  }, true);
}

if (!movingToCanonicalHost) {
  createRoot(document.getElementById("root")!).render(
    <HelmetProvider>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </HelmetProvider>
  );
}

// Offline support for the published app only (never in dev/preview iframes).
registerAppServiceWorker(() => {
  toast("มีเวอร์ชันใหม่", {
    description: "แตะเพื่อโหลดเวอร์ชันล่าสุด",
    action: { label: "รีเฟรช", onClick: () => window.location.reload() },
    duration: 15000,
  });
});

// Pre-cache the pages used when the shop's connection drops (home, /order, POS).
if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  navigator.serviceWorker.ready.then(() => warmOfflineCache()).catch(() => {});
}

// เปิดแอปด้วยเวอร์ชันใหม่ → ทิ้งแคชไฟล์เก่าครั้งเดียว (ไม่แตะเซสชันล็อกอิน)
void syncBuildCaches(RUNNING_TAG);

// เครื่องที่ยังค้าง shell เก่า (แชร์ลิงก์ให้ลูกค้าแล้วเห็นหน้าเดิม) → กู้ให้อัตโนมัติ
if (import.meta.env.PROD && !movingToCanonicalHost) {
  void rescueStaleShell();
}


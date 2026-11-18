import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { logPwa } from "@/lib/pwaDiagnostics";

/** Thin banner shown while the device has no connection. */
export default function OfflineBanner() {
  const [offline, setOffline] = useState(
    typeof navigator !== "undefined" ? !navigator.onLine : false,
  );

  useEffect(() => {
    const on = () => { setOffline(false); logPwa("info", "network_online"); };
    const off = () => { setOffline(true); logPwa("warn", "network_offline"); };
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (!offline) return null;
  return (
    <div
      role="status"
      data-testid="offline-banner"
      className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-amber-500 px-3 py-1.5 text-[12px] font-bold text-amber-950"
    >
      <WifiOff className="h-4 w-4" />
      กำลังออฟไลน์ — ข้อมูลอาจไม่ล่าสุด และยังบันทึกไม่ได้
    </div>
  );
}

/** true while the browser reports no connection (for disabling write actions). */
export function useIsOffline() {
  const [offline, setOffline] = useState(
    typeof navigator !== "undefined" ? !navigator.onLine : false,
  );
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return offline;
}
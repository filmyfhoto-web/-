import { supabase } from "@/integrations/supabase/client";

/**
 * iOS standalone PWAs get frozen when backgrounded: supabase-js' auto-refresh
 * timer stops ticking, so a user returning after >1h finds an expired access
 * token and gets bounced to the login screen even though a valid refresh token
 * is still stored. This re-arms auto-refresh and rotates the token on resume.
 */
export function startSessionKeepAlive(): () => void {
  let refreshing = false;
  // ตรวจเป็นระยะระหว่างที่หน้าเปิดอยู่ ไม่พึ่งเฉพาะ visibility/focus event
  // (เดสก์ท็อปแอดมินที่เปิดค้างทั้งวันไม่ยิง event เหล่านี้เลย)
  const CHECK_MS = 5 * 60 * 1000;
  let timer: number | undefined;

  const refreshNow = async (attempt = 0): Promise<void> => {
    if (refreshing) return;
    refreshing = true;
    try {
      const { data } = await supabase.auth.getSession();
      const s = data.session;
      if (!s) return;
      // Rotate when the access token is expired or expires within 5 minutes.
      const expiresAt = (s.expires_at ?? 0) * 1000;
      if (expiresAt - Date.now() > 5 * 60 * 1000) return;
      const { error } = await supabase.auth.refreshSession();
      if (error && attempt < 1) {
        // Retry once after a short network hiccup, then let auth state decide.
        refreshing = false;
        await new Promise((r) => setTimeout(r, 1500));
        return refreshNow(attempt + 1);
      }
    } catch {
      /* offline — keep the stored refresh token and try again on next resume */
    } finally {
      refreshing = false;
    }
  };

  // supabase-js บางเวอร์ชัน/บาง mock ไม่มีเมธอดนี้ และ throw ที่นี่จะเป็น
  // uncaught error ตอนสลับแอปบนมือถือ → แอปดับทั้งจอ
  const safe = (fn: "startAutoRefresh" | "stopAutoRefresh") => {
    try {
      const auth = supabase.auth as unknown as Record<string, unknown>;
      if (typeof auth[fn] === "function") void (auth[fn] as () => unknown)();
    } catch { /* ignore */ }
  };

  const onVisible = () => {
    try {
      if (document.visibilityState !== "visible") {
        safe("stopAutoRefresh");
        if (timer) { window.clearInterval(timer); timer = undefined; }
        return;
      }
      safe("startAutoRefresh");
      if (!timer) timer = window.setInterval(() => void refreshNow(), CHECK_MS);
      void refreshNow();
    } catch { /* ห้าม throw ออกจาก event listener */ }
  };

  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("pageshow", onVisible);
  window.addEventListener("focus", onVisible);
  window.addEventListener("online", onVisible);
  onVisible();

  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("pageshow", onVisible);
    window.removeEventListener("focus", onVisible);
    window.removeEventListener("online", onVisible);
    if (timer) window.clearInterval(timer);
    timer = undefined;
  };
}

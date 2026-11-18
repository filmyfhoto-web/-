import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { readOrderAlertPrefs, writeOrderAlertPrefs } from "@/lib/orderAlertPrefs";

export function isOrderAlertSoundOn(): boolean {
  return readOrderAlertPrefs().sound;
}
export function setOrderAlertSound(on: boolean) {
  writeOrderAlertPrefs({ sound: on });
}

/** Short WebAudio beep — no audio asset needed. Silent if the browser blocks it. */
export function playOrderBeep() {
  if (!isOrderAlertSoundOn()) return false;
  try {
    const Ctx: typeof AudioContext | undefined =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return false;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.36);
    osc.onended = () => { try { ctx.close(); } catch { /* ignore */ } };
    return true;
  } catch { return false; }
}

export type NewOrderAlertsOptions = {
  /** Called when a new order row arrives (after toast/sound). */
  onOrder?: (order: any) => void;
  /** Navigate handler used by the toast action button. */
  onView?: () => void;
};

/**
 * Subscribes once to INSERT on `orders` and surfaces in-app alerts
 * (toast + beep) plus an unread counter sourced from `notifications`.
 */
export function useNewOrderAlerts(opts: NewOrderAlertsOptions = {}) {
  const [unread, setUnread] = useState(0);
  const cb = useRef(opts);
  cb.current = opts;
  // Realtime can replay the same INSERT after a reconnect or deliver it to
  // several tabs. Dedupe by order id so one order = one alert.
  const seen = useRef<Set<string>>(new Set());

  const refreshUnread = useCallback(async () => {
    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("for_staff", true)
      .eq("read", false)
      .eq("type", "new_order");
    setUnread(count ?? 0);
  }, []);

  useEffect(() => { void refreshUnread(); }, [refreshUnread]);

  useEffect(() => {
    // Unique topic per subscriber: reusing a fixed name makes supabase-js hand
    // back an already-subscribed channel, which throws
    // "cannot add `postgres_changes` callbacks ... after `subscribe()`".
    const topic = `admin-new-order-alerts-${Math.random().toString(36).slice(2)}-${Date.now()}`;
    const ch = supabase
      .channel(topic)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, (payload: any) => {
        const order = payload?.new ?? {};
        if (order.id) {
          if (seen.current.has(order.id)) return;
          seen.current.add(order.id);
        }
        const prefs = readOrderAlertPrefs();
        setUnread((n) => n + 1);
        playOrderBeep();
        if (prefs.toast) {
          toast.success(`ออเดอร์ใหม่ ${order.order_no ?? ""}`.trim(), {
            description: `${order.guest_name || order.school_name || "ลูกค้า"} · ${Number(order.total ?? 0).toLocaleString("th-TH")} บาท`,
            action: cb.current.onView ? { label: "ดู", onClick: () => cb.current.onView?.() } : undefined,
            duration: 8000,
          });
        }
        // NOTE: no LINE sending happens here. Delivery is owned server-side by
        // the notification outbox (`notify-dispatch`) so a browser tab can
        // never fan out duplicate messages.
        cb.current.onOrder?.(order);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => {
        void refreshUnread();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refreshUnread]);

  return { unread, refreshUnread, setUnread };
}

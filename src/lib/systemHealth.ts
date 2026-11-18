/**
 * Live system health probes used by `/diagnostics`.
 *
 * Every probe hits the real backend — no mocked values — and returns a plain
 * status so the page can render "ok / ช้า / ล่ม" without leaking any secret.
 */
import { supabase } from "@/integrations/supabase/client";

export type ProbeState = "ok" | "warn" | "fail" | "checking";

export interface Probe {
  id: string;
  label: string;
  state: ProbeState;
  detail: string;
  ms?: number;
}

async function timed<T>(fn: () => Promise<T>): Promise<{ ms: number; value?: T; error?: unknown }> {
  const started = Date.now();
  try {
    const value = await fn();
    return { ms: Date.now() - started, value };
  } catch (error) {
    return { ms: Date.now() - started, error };
  }
}

export function internetProbe(): Probe {
  const online = typeof navigator === "undefined" ? true : navigator.onLine !== false;
  return {
    id: "internet",
    label: "อินเทอร์เน็ต",
    state: online ? "ok" : "fail",
    detail: online ? "เชื่อมต่ออยู่" : "ออฟไลน์",
  };
}

export async function apiProbe(): Promise<Probe> {
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!base) return { id: "api", label: "API", state: "warn", detail: "ไม่ได้ตั้งค่า endpoint" };
  const r = await timed(async () => {
    const res = await fetch(`${base}/auth/v1/health`, { cache: "no-store" });
    return res.ok;
  });
  return {
    id: "api",
    label: "API (backend)",
    state: r.value ? (r.ms > 2000 ? "warn" : "ok") : "fail",
    detail: r.value ? "ตอบสนองปกติ" : "ติดต่อไม่ได้",
    ms: r.ms,
  };
}

export async function databaseProbe(): Promise<Probe> {
  const r = await timed(async () => {
    const { error } = await supabase.rpc("get_public_settings");
    if (error) throw error;
    return true;
  });
  return {
    id: "database",
    label: "ฐานข้อมูล",
    state: r.value ? (r.ms > 2500 ? "warn" : "ok") : "fail",
    detail: r.value ? "อ่านข้อมูลได้" : "อ่านข้อมูลไม่ได้",
    ms: r.ms,
  };
}

export async function authProbe(): Promise<Probe> {
  const r = await timed(async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session;
  });
  if (r.error) return { id: "auth", label: "ระบบเข้าสู่ระบบ", state: "fail", detail: "ตรวจสอบ session ไม่ได้", ms: r.ms };
  return {
    id: "auth",
    label: "ระบบเข้าสู่ระบบ",
    state: "ok",
    detail: r.value ? "มี session ที่ใช้งานได้" : "ยังไม่เข้าสู่ระบบ (ปกติ)",
    ms: r.ms,
  };
}

/** Opens a throwaway realtime channel and waits for SUBSCRIBED. */
export async function realtimeProbe(timeoutMs = 6000): Promise<Probe> {
  const started = Date.now();
  const channel = supabase.channel(`health-${Math.random().toString(36).slice(2, 8)}`);
  const status = await new Promise<string>((resolve) => {
    const timer = window.setTimeout(() => resolve("TIMED_OUT"), timeoutMs);
    channel.subscribe((s: string) => {
      if (s === "SUBSCRIBED" || s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
        window.clearTimeout(timer);
        resolve(s);
      }
    });
  });
  try { await supabase.removeChannel(channel); } catch { /* ignore */ }
  return {
    id: "realtime",
    label: "Realtime / WebSocket",
    state: status === "SUBSCRIBED" ? "ok" : "fail",
    detail: status === "SUBSCRIBED" ? "เชื่อมต่อแล้ว" : `ขาดการเชื่อมต่อ (${status})`,
    ms: Date.now() - started,
  };
}

export async function runSystemHealth(): Promise<Probe[]> {
  const [api, db, auth, realtime] = await Promise.all([
    apiProbe(),
    databaseProbe(),
    authProbe(),
    realtimeProbe(),
  ]);
  return [internetProbe(), api, db, auth, realtime];
}
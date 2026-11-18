import { useEffect, useState } from "react";

export type PoStatus =
  | "draft"
  | "pending_approval"
  | "approved_waiting_receipt"
  | "ordered";

export interface PosBadgeSettings {
  enabled: boolean;
  delivery: {
    enabled: boolean;
    statuses: Array<"preparing" | "shipping" | "delivered">;
  };
  lowStock: {
    enabled: boolean;
    defaultThreshold: number;
  };
  pendingPo: {
    enabled: boolean;
    statuses: PoStatus[];
  };
  pendingReceipts: {
    enabled: boolean;
  };
}

export const DEFAULT_BADGE_SETTINGS: PosBadgeSettings = {
  enabled: true,
  delivery: { enabled: true, statuses: ["preparing", "shipping"] },
  lowStock: { enabled: true, defaultThreshold: 5 },
  pendingPo: {
    enabled: true,
    statuses: ["draft", "pending_approval", "approved_waiting_receipt", "ordered"],
  },
  pendingReceipts: { enabled: true },
};

export const BADGE_SETTINGS_KEY = "pos.badge.settings.v1";
const EVENT = "pos-badge-settings-change";

function deepMerge<T>(base: T, override: unknown): T {
  if (!override || typeof override !== "object") return base;
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...(base as any) };
  for (const k of Object.keys(override as any)) {
    const v = (override as any)[k];
    const b = (base as any)?.[k];
    if (v && typeof v === "object" && !Array.isArray(v) && b && typeof b === "object") {
      out[k] = deepMerge(b, v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

export function loadBadgeSettings(): PosBadgeSettings {
  if (typeof localStorage === "undefined") return DEFAULT_BADGE_SETTINGS;
  try {
    const raw = localStorage.getItem(BADGE_SETTINGS_KEY);
    if (!raw) return DEFAULT_BADGE_SETTINGS;
    return deepMerge(DEFAULT_BADGE_SETTINGS, JSON.parse(raw));
  } catch {
    return DEFAULT_BADGE_SETTINGS;
  }
}

export function saveBadgeSettings(s: PosBadgeSettings): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(BADGE_SETTINGS_KEY, JSON.stringify(s));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENT));
  }
}

export function resetBadgeSettings(): void {
  saveBadgeSettings(DEFAULT_BADGE_SETTINGS);
}

export function useBadgeSettings(): PosBadgeSettings {
  const [s, setS] = useState<PosBadgeSettings>(() => loadBadgeSettings());
  useEffect(() => {
    const reload = () => setS(loadBadgeSettings());
    window.addEventListener("storage", reload);
    window.addEventListener(EVENT, reload as EventListener);
    return () => {
      window.removeEventListener("storage", reload);
      window.removeEventListener(EVENT, reload as EventListener);
    };
  }, []);
  return s;
}
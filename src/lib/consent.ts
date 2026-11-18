import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMemo } from "react";

/**
 * เพิ่มวันที่นี้เมื่อแก้เนื้อหานโยบาย — ลูกค้าจะถูกบังคับให้ยอมรับใหม่ก่อนสั่งซื้อ
 */
export const CURRENT_TERMS_VERSION = "2026-06-29";
export const CURRENT_PRIVACY_VERSION = "2026-06-29";

export type ConsentKind = "terms" | "privacy";
export type ConsentSource = "signup" | "pre_order" | "re_consent" | "manual";

export type ConsentProfileFields = {
  accepted_terms_at?: string | null;
  accepted_privacy_at?: string | null;
  accepted_terms_version?: string | null;
  accepted_privacy_version?: string | null;
};

export function hasValidConsent(profile?: ConsentProfileFields | null): boolean {
  if (!profile) return false;
  return (
    profile.accepted_terms_version === CURRENT_TERMS_VERSION &&
    profile.accepted_privacy_version === CURRENT_PRIVACY_VERSION
  );
}

/** Detects the server's "consent_required" error from RPC/trigger */
export function isConsentRequiredError(err: unknown): boolean {
  if (!err) return false;
  const e = err as { message?: string; code?: string; details?: string };
  return (
    (typeof e.message === "string" && e.message.includes("consent_required")) ||
    (typeof e.details === "string" && e.details.includes("consent_required"))
  );
}

/** Fetch the authoritative current policy versions from the server */
export async function fetchServerConsentVersions(): Promise<{ terms: string | null; privacy: string | null }> {
  try {
    const { data } = await supabase.rpc("get_current_consent_versions");
    const row = Array.isArray(data) ? data[0] : data;
    return { terms: row?.terms ?? null, privacy: row?.privacy ?? null };
  } catch {
    return { terms: CURRENT_TERMS_VERSION, privacy: CURRENT_PRIVACY_VERSION };
  }
}

/** React hook — เช็คสถานะ consent จาก AuthContext แบบ realtime */
export function useConsentStatus() {
  const { profile, user } = useAuth();
  return useMemo(() => {
    const ok = hasValidConsent(profile);
    const missing: ConsentKind[] = [];
    if (profile?.accepted_terms_version !== CURRENT_TERMS_VERSION) missing.push("terms");
    if (profile?.accepted_privacy_version !== CURRENT_PRIVACY_VERSION) missing.push("privacy");
    return {
      ok,
      missing,
      userId: user?.id ?? null,
      currentTermsVersion: CURRENT_TERMS_VERSION,
      currentPrivacyVersion: CURRENT_PRIVACY_VERSION,
      acceptedTermsAt: profile?.accepted_terms_at ?? null,
      acceptedPrivacyAt: profile?.accepted_privacy_at ?? null,
      acceptedTermsVersion: profile?.accepted_terms_version ?? null,
      acceptedPrivacyVersion: profile?.accepted_privacy_version ?? null,
    };
  }, [profile, user]);
}

/**
 * บันทึกการยอมรับ — อัปเดต profiles + insert activity_logs (parallel)
 */
export async function recordConsent(
  userId: string,
  kinds: ConsentKind[],
  source: ConsentSource
): Promise<void> {
  if (!userId || kinds.length === 0) return;
  const now = new Date().toISOString();
  const patch: {
    accepted_terms_at?: string;
    accepted_terms_version?: string;
    accepted_privacy_at?: string;
    accepted_privacy_version?: string;
  } = {};
  if (kinds.includes("terms")) {
    patch.accepted_terms_at = now;
    patch.accepted_terms_version = CURRENT_TERMS_VERSION;
  }
  if (kinds.includes("privacy")) {
    patch.accepted_privacy_at = now;
    patch.accepted_privacy_version = CURRENT_PRIVACY_VERSION;
  }
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const logs = kinds.map((kind) => ({
    user_id: userId,
    action: kind === "terms" ? "accept_terms" : "accept_privacy",
    target_type: "profile",
    target_id: userId,
    detail: {
      version: kind === "terms" ? CURRENT_TERMS_VERSION : CURRENT_PRIVACY_VERSION,
      source,
      user_agent: ua.slice(0, 300),
    },
  }));
  await Promise.all([
    supabase.from("profiles").update(patch).eq("id", userId),
    supabase.from("activity_logs").insert(logs),
  ]);
}

export async function revokeConsent(userId: string): Promise<void> {
  if (!userId) return;
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  await Promise.all([
    supabase
      .from("profiles")
      .update({
        accepted_terms_at: null,
        accepted_privacy_at: null,
        accepted_terms_version: null,
        accepted_privacy_version: null,
      })
      .eq("id", userId),
    supabase.from("activity_logs").insert({
      user_id: userId,
      action: "revoke_consent",
      target_type: "profile",
      target_id: userId,
      detail: { user_agent: ua.slice(0, 300) },
    }),
  ]);
}
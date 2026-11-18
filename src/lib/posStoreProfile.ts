/**
 * Store branding shown on the touch POS (/pos/register) and on printed
 * receipts. Edited by owners/admins in /admin/pos-store, stored in
 * `pos_store_profile` (one row per POS branch key) and streamed to every
 * register via realtime so a rename/logo swap lands without a reload.
 */
import { useCallback, useEffect, useState } from "react";
import { liveChannel } from "@/lib/realtimeChannel";
import { supabase } from "@/integrations/supabase/client";
import { readOfflineSnapshot, saveOfflineSnapshot } from "@/lib/posOfflineCache";

export type PosStoreProfile = {
  store_key: string;
  shop_name: string;
  logo_url: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
};

export const POS_BRANDING_BUCKET = "pos-branding";
/** Signed URLs are long-lived: the logo is branding, not user data. */
const LOGO_URL_TTL = 60 * 60 * 24 * 365 * 5;

export function emptyProfile(storeKey: string): PosStoreProfile {
  return { store_key: storeKey, shop_name: "", logo_url: null, address: null, phone: null, email: null };
}

export async function fetchStoreProfile(storeKey: string): Promise<PosStoreProfile | null> {
  const cached = () => readOfflineSnapshot<PosStoreProfile>(`pos.storeProfile.${storeKey}`)?.data ?? null;
  let data: unknown = null;
  let error: unknown = null;
  try {
    const q = supabase
      .from("pos_store_profile" as any)
      .select("store_key, shop_name, logo_url, address, phone, email")
      .eq("store_key", storeKey) as unknown as { maybeSingle?: () => Promise<{ data: unknown; error: unknown }> };
    // Stubbed clients (tests/offline shims) may not implement maybeSingle().
    if (typeof q.maybeSingle !== "function") return cached();
    ({ data, error } = await q.maybeSingle());
  } catch {
    return cached();
  }
  if (error) return cached();
  const row = (data as PosStoreProfile) ?? null;
  if (row) saveOfflineSnapshot(`pos.storeProfile.${storeKey}`, row);
  return row;
}

export async function saveStoreProfile(p: PosStoreProfile): Promise<void> {
  const { error } = await supabase
    .from("pos_store_profile" as any)
    .upsert(
      {
        store_key: p.store_key,
        shop_name: p.shop_name,
        logo_url: p.logo_url,
        address: p.address,
        phone: p.phone,
        email: p.email,
        updated_at: new Date().toISOString(),
      } as any,
      { onConflict: "store_key" },
    );
  if (error) throw error;
}

/** Upload a (already cropped) logo blob and return a durable signed URL. */
export async function uploadStoreLogo(storeKey: string, blob: Blob): Promise<string> {
  const path = `${storeKey}/logo-${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from(POS_BRANDING_BUCKET)
    .upload(path, blob, { upsert: true, contentType: blob.type || "image/jpeg" });
  if (error) throw error;
  const { data, error: sErr } = await supabase.storage
    .from(POS_BRANDING_BUCKET)
    .createSignedUrl(path, LOGO_URL_TTL);
  if (sErr || !data?.signedUrl) throw sErr ?? new Error("ไม่สามารถสร้างลิงก์รูปโลโก้ได้");
  return data.signedUrl;
}

/** Live store profile for a POS branch (refetched on realtime changes). */
export function useStoreProfile(storeKey: string) {
  const [profile, setProfile] = useState<PosStoreProfile | null>(
    () => readOfflineSnapshot<PosStoreProfile>(`pos.storeProfile.${storeKey}`)?.data ?? null,
  );
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const p = await fetchStoreProfile(storeKey);
    setProfile(p);
    setLoading(false);
  }, [storeKey]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void fetchStoreProfile(storeKey).then((p) => {
      if (alive) { setProfile(p); setLoading(false); }
    });
    // Degrade gracefully when the client has no Realtime (tests / shims).
    const canRealtime = typeof (supabase as { channel?: unknown }).channel === "function";
    const ch = canRealtime
      ? liveChannel(`pos-store-profile-${storeKey}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "pos_store_profile", filter: `store_key=eq.${storeKey}` },
            () => { void reload(); },
          )
          .subscribe()
      : null;
    return () => { alive = false; if (ch) void supabase.removeChannel(ch); };
  }, [storeKey, reload]);

  return { profile, loading, reload };
}

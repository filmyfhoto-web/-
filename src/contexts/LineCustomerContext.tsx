import { createContext, ReactNode, useCallback, useContext, useState } from "react";

/**
 * Verified LINE customer profile — populated ONLY by `RequireLineLink` from
 * the server response of `line-link-lookup`. Never read from browser
 * storage for authorization. `picture_url` is a display-only hint sourced
 * from the LIFF profile that the user's own browser produced.
 */
export type LineCustomerProfile = {
  line_user_id: string;
  display_name: string | null;
  customer_id: string | null;
  customer_source: string | null;
  customer_name: string | null;
  phone: string | null;
  picture_url: string | null;
  verified_at: string | null;
};

interface LineCustomerCtx {
  profile: LineCustomerProfile | null;
  setProfile: (p: LineCustomerProfile | null) => void;
  clear: () => void;
}

const Ctx = createContext<LineCustomerCtx | null>(null);

export function LineCustomerProvider({ children }: { children: ReactNode }) {
  const [profile, setProfileState] = useState<LineCustomerProfile | null>(null);
  const setProfile = useCallback((p: LineCustomerProfile | null) => setProfileState(p), []);
  const clear = useCallback(() => setProfileState(null), []);
  return <Ctx.Provider value={{ profile, setProfile, clear }}>{children}</Ctx.Provider>;
}

export function useLineCustomer(): LineCustomerCtx {
  const v = useContext(Ctx);
  if (!v) {
    // Safe stub so components outside the customer surface (staff/admin
    // pages that also render CustomerLayout in error boundaries) don't
    // crash. All setters become no-ops.
    return { profile: null, setProfile: () => {}, clear: () => {} };
  }
  return v;
}

/** Read the LIFF display-only picture hint stashed by /l/shop. */
export function readLiffPictureHint(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem("liff_profile");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const url = typeof parsed?.pictureUrl === "string" ? parsed.pictureUrl : null;
    // Only allow https URLs from LINE CDN as a defense-in-depth.
    if (!url || !/^https:\/\//i.test(url)) return null;
    return url;
  } catch { return null; }
}
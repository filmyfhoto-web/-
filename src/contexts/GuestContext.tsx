import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface GuestSession {
  guest_id: string;
  name: string;
  phone: string;
  project: string;
  org_slug: string | null;
  org_id: string | null;
  org_name: string | null;
  org_approved: boolean;
  price_group_id: string | null;
  school_token: string | null;
  created_at: string;
}

interface GuestCtx {
  session: GuestSession | null;
  loading: boolean;
  setSession: (s: Partial<GuestSession>) => void;
  clear: () => void;
  resolveOrg: (slug: string | null) => Promise<{ id: string | null; name: string | null; approved: boolean; price_group_id: string | null }>;
  resolveToken: (token: string | null) => Promise<{ id: string | null; name: string | null; price_group_id: string | null; slug: string | null }>;
}

const KEY = "guest_session_v1";
const Ctx = createContext<GuestCtx | null>(null);

function newGuestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function readStored(): GuestSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj?.guest_id || !obj?.name || !obj?.phone) return null;
    return obj as GuestSession;
  } catch { return null; }
}

export function GuestProvider({ children }: { children: ReactNode }) {
  const [session, setSess] = useState<GuestSession | null>(() => readStored());
  const [loading] = useState(false);

  useEffect(() => {
    if (session) localStorage.setItem(KEY, JSON.stringify(session));
  }, [session]);

  const resolveOrg = useCallback(async (slug: string | null) => {
    if (!slug) return { id: null, name: null, approved: true, price_group_id: null };
    const { data } = await supabase.rpc("resolve_org_slug", { p_slug: slug });
    const row = Array.isArray(data) ? data[0] : (data as any);
    return {
      id: row?.id ?? null,
      name: row?.name ?? null,
      approved: row?.approved ?? false,
      price_group_id: row?.price_group_id ?? null,
    };
  }, []);

  const resolveToken = useCallback(async (token: string | null) => {
    if (!token) return { id: null, name: null, price_group_id: null, slug: null };
    const { data } = await supabase.rpc("resolve_school_token" as any, { p_token: token });
    const row = Array.isArray(data) ? data[0] : (data as any);
    return {
      id: row?.id ?? null,
      name: row?.name ?? null,
      price_group_id: row?.price_group_id ?? null,
      slug: row?.slug ?? null,
    };
  }, []);

  const setSession = useCallback((s: Partial<GuestSession>) => {
    setSess((prev) => {
      const base: GuestSession = prev ?? {
        guest_id: (s as any)?.guest_id || newGuestId(),
        name: "", phone: "", project: "",
        org_slug: null, org_id: null, org_name: null, org_approved: true, price_group_id: null, school_token: null,
        created_at: new Date().toISOString(),
      };
      return { ...base, ...s, guest_id: base.guest_id, created_at: base.created_at };
    });
  }, []);

  const clear = useCallback(() => {
    try { localStorage.removeItem(KEY); } catch {}
    setSess(null);
  }, []);

  const value = useMemo<GuestCtx>(() => ({ session, loading, setSession, clear, resolveOrg, resolveToken }), [session, loading, setSession, clear, resolveOrg, resolveToken]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGuest() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useGuest outside GuestProvider");
  return v;
}

export { newGuestId };
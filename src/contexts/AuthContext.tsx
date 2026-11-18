import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import { startSessionKeepAlive } from "@/lib/sessionKeepAlive";

export type Role = "owner" | "admin" | "stock_staff" | "photo_staff" | "customer";

export type StaffModule = "pos" | "stock" | "po" | "history";

export type StaffPerms = Record<StaffModule, boolean>;

/**
 * Defaults for staff without an explicit permission row. These mirror the
 * server function has_staff_perm — PO stays on until an owner turns it off,
 * so existing stock staff keep the access they had before per-module gating.
 */
const DEFAULT_PERMS: StaffPerms = { pos: true, stock: true, po: true, history: true };
const ALL_PERMS: StaffPerms = { pos: true, stock: true, po: true, history: true };

interface AuthCtx {
  session: Session | null;
  user: User | null;
  profile: any | null;
  roles: Role[];
  loading: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  isStaff: boolean;          // owner/admin (เดิม)
  isStaffAny: boolean;       // owner/admin/stock_staff/photo_staff
  canEditProduct: boolean;   // owner/admin/stock_staff
  canApprove: boolean;       // owner/admin
  canSeeCost: boolean;       // owner/admin หรือ stock_staff ที่มี cost_visible
  isPhotoOnly: boolean;
  perms: StaffPerms;         // สิทธิ์รายโมดูลที่เจ้าของกำหนด
  hasPerm: (m: StaffModule) => boolean;
  /** True when roles/permissions could not be loaded (network/RLS error). */
  loadError: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

// Keep a single context instance even if this module is evaluated twice
// (Vite HMR / duplicate module graph). Two instances would make useAuth()
// read an empty context and throw "useAuth outside AuthProvider".
const GLOBAL_KEY = "__rds_auth_ctx__";
const g = globalThis as any;
const Ctx: ReturnType<typeof createContext<AuthCtx | null>> =
  g[GLOBAL_KEY] ?? (g[GLOBAL_KEY] = createContext<AuthCtx | null>(null));

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permRow, setPermRow] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  // Role/permission query failed and we have nothing cached. Guards must
  // show a retry screen instead of redirecting (a network blip must never
  // look like "you are not staff").
  const [loadError, setLoadError] = useState(false);
  // Guards against out-of-order responses: getSession() and onAuthStateChange
  // both trigger a load, and a stale reply must never clear a fresher one
  // (an empty roles array would bounce staff out of their own pages).
  const loadSeq = useRef(0);
  // A cold iOS PWA can deliver an auth callback before the explicit
  // getSession() bootstrap settles. Keep a monotonic sequence for auth state
  // itself too, so an older empty bootstrap result can never overwrite a
  // session restored a moment later from persistent storage.
  const authSeq = useRef(0);

  const loadExtras = async (uid: string | undefined) => {
    const seq = ++loadSeq.current;
    if (!uid) { setProfile(null); setRoles([]); setPermRow(null); setLoadError(false); return seq; }
    const [{ data: p }, { data: r, error: rErr }, { data: sp }] = await Promise.all([
      supabase.from("profiles").select("*, organizations(*)").eq("id", uid).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase.from("staff_permissions").select("*").eq("user_id", uid).maybeSingle(),
    ]);
    if (seq !== loadSeq.current) return seq; // a newer load already won
    setProfile(p);
    // Keep previously known roles if the role query failed (offline/transient),
    // otherwise a network blip would look like "not staff" and redirect away.
    if (!rErr) {
      setRoles((r ?? []).map((x: any) => x.role as Role));
      setLoadError(false);
    } else {
      setLoadError(true);
    }
    setPermRow(sp ?? null);
    return seq;
  };

  /**
   * Only the newest load may clear `loading`. getSession() and
   * onAuthStateChange both kick off a load; if the *older* one settles last it
   * would otherwise reveal the app with an empty roles array and route guards
   * would bounce a real staff member to /shop before their roles arrive.
   */
  const finishLoad = (seq: number | undefined) => {
    if (seq === undefined || seq === loadSeq.current) setLoading(false);
  };

  useEffect(() => {
    let currentUid: string | undefined;
    let disposed = false;
    const applySession = (s: Session | null, event?: string) => {
      if (disposed) return;
      const seq = ++authSeq.current;
      setSession(s);
      const uid = s?.user?.id;
      if (uid) {
        // Token refreshes keep the same user — don't flip back to a loading
        // screen (guards would re-run and could bounce mid-navigation).
        if (uid === currentUid && event === "TOKEN_REFRESHED") return;
        const isSameUser = uid === currentUid;
        currentUid = uid;
        if (!isSameUser) setLoading(true);
        setTimeout(() => {
          if (disposed || seq !== authSeq.current) return;
          loadExtras(uid).then(finishLoad, () => finishLoad(undefined));
        }, 0);
      } else {
        currentUid = undefined;
        setProfile(null);
        setRoles([]);
        setPermRow(null);
        setLoading(false);
      }
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      applySession(s, event);
    });
    // Watchdog: บนมือถือ (iOS PWA เย็น, เน็ตหลุด, storage ถูกบล็อก) getSession()
    // อาจไม่ resolve เลย ทำให้ทุก guard ค้างที่ "กำลังโหลด..." ตลอดกาล
    // ถ้าเกินเวลานี้ ให้ปิดสถานะโหลด → ผู้ใช้ได้หน้าเข้าสู่ระบบแทนหน้าค้าง
    const watchdog = window.setTimeout(() => {
      if (!disposed) setLoading(false);
    }, 8000);
    const bootstrapSeq = authSeq.current;
    supabase.auth.getSession().then(({ data }) => {
      // An auth event that arrived after bootstrap started is newer and wins.
      if (disposed || authSeq.current !== bootstrapSeq) return;
      applySession(data.session, "INITIAL_SESSION");
    }, () => {
      if (!disposed && authSeq.current === bootstrapSeq) setLoading(false);
    });
    return () => {
      disposed = true;
      window.clearTimeout(watchdog);
      sub.subscription.unsubscribe();
    };
  }, []);

  // Keep the refresh token rotating across iOS PWA freeze/resume cycles so an
  // installed app never falls back to the login screen with a valid session.
  useEffect(() => startSessionKeepAlive(), []);

  // A disabled employee keeps their login but loses every staff capability —
  // the same rule the database enforces (staff_is_active / has_role).
  const staffActive = profile?.staff_active !== false;
  const isOwner = staffActive && roles.includes("owner");
  // The owner is always an admin — never gate an owner out of an admin-only
  // surface just because the explicit `admin` row is missing.
  const isAdmin = isOwner || (staffActive && roles.includes("admin"));
  const isStaff = isOwner || isAdmin;
  const isStaffAny = isStaff || (staffActive && (roles.includes("stock_staff") || roles.includes("photo_staff")));
  const canEditProduct = isStaff || (staffActive && roles.includes("stock_staff"));
  const canApprove = isStaff;
  const canSeeCost = isStaff || (staffActive && roles.includes("stock_staff") && !!profile?.cost_visible);
  const isPhotoOnly = staffActive && roles.includes("photo_staff") && !isStaff && !roles.includes("stock_staff");

  const perms: StaffPerms = isStaff
    ? ALL_PERMS
    : permRow
      ? {
          pos: !!permRow.can_pos,
          stock: !!permRow.can_stock,
          po: !!permRow.can_po,
          history: !!permRow.can_history,
        }
      : DEFAULT_PERMS;

  const value: AuthCtx = {
    session,
    user: session?.user ?? null,
    profile,
    roles,
    loading,
    isOwner, isAdmin, isStaff, isStaffAny,
    canEditProduct, canApprove, canSeeCost, isPhotoOnly,
    perms,
    hasPerm: (m: StaffModule) => perms[m],
    loadError,
    signOut: async () => {
      await supabase.auth.signOut();
      // Clear per-user UI caches that could leak between accounts on shared
      // devices (especially mobile). Auth tokens themselves are managed by
      // supabase-js.
      try {
        const keys = [
          "cart_items", "cart", "shop_view_mode", "line_oauth_state",
          "rds_active_store_id", "shop_active_store",
        ];
        keys.forEach((k) => { try { localStorage.removeItem(k); } catch {} });
        // Best-effort: clear anything user-scoped we cached.
        Object.keys(localStorage).forEach((k) => {
          if (/^(profile|account|customer|orders?)[:_-]/i.test(k)) {
            try { localStorage.removeItem(k); } catch {}
          }
        });
        sessionStorage.clear();
      } catch {}
      setProfile(null); setRoles([]); setPermRow(null); setSession(null);
    },
    refresh: async () => { await loadExtras(session?.user?.id); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}

/** Like useAuth() but returns null outside a provider (safe in isolated tests). */
export function useAuthOptional() {
  return useContext(Ctx);
}
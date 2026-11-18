/**
 * Read the real role + module permissions for a user right after sign-in,
 * before AuthContext has refreshed. Login screens must not route on stale
 * (signed-out) context — an installed POS icon never grants POS access.
 */
import { supabase } from "@/integrations/supabase/client";
import type { LoginRole } from "./posLoginContext";

export async function fetchLoginRole(uid: string | undefined): Promise<LoginRole & { active: boolean }> {
  if (!uid) return { active: false, isStaffAny: false };
  const [{ data: rows }, { data: prof }, { data: perm }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", uid),
    supabase.from("profiles").select("staff_active").eq("id", uid).maybeSingle(),
    supabase.from("staff_permissions").select("can_pos,can_stock").eq("user_id", uid).maybeSingle(),
  ]);
  const roles = ((rows ?? []) as { role: string }[]).map((r) => r.role);
  const active = (prof as { staff_active?: boolean } | null)?.staff_active !== false;
  const isOwner = active && roles.includes("owner");
  const isAdmin = active && roles.includes("admin");
  const isStaffAny = isOwner || isAdmin || (active && (roles.includes("stock_staff") || roles.includes("photo_staff")));
  const row = perm as { can_pos?: boolean; can_stock?: boolean } | null;
  // Canonical default when no staff_permissions row exists (AuthContext
  // DEFAULT_PERMS and the database has_staff_perm() both COALESCE to true for
  // pos/stock/history). Never invent a grant the core system would refuse, and
  // never withhold one it would give — a non-staff account still gets nothing.
  return {
    active,
    isOwner,
    isAdmin,
    isStaffAny,
    canPos: isOwner || isAdmin || (isStaffAny && (row ? !!row.can_pos : true)),
    canStock: isOwner || isAdmin || (isStaffAny && (row ? !!row.can_stock : true)),
  };
}

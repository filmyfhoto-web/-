import { useState, useEffect } from 'react';
import { supabase } from '@/film-shop/lib/supabase';
import { useAuth } from './useAuth';

type AppRole = 'admin' | 'staff';

interface UserRoleState {
  role: AppRole | null;
  isAdmin: boolean;
  isStaff: boolean;
  loading: boolean;
}

/**
 * Roles live in `public.user_roles` with the project-wide enum
 * (owner/admin/stock_staff/photo_staff/customer). The film-shop UI only cares
 * about two buckets, so map them:
 *   owner, admin              → 'admin'  (full access)
 *   stock_staff, photo_staff  → 'staff'
 * A user can hold several rows, so read them all instead of `maybeSingle()`
 * (which errors on multiple rows and used to leave owners with no role at all
 * — that is what produced spurious "ไม่มีสิทธิ์" states).
 */
export function mapFilmShopRole(roles: string[]): AppRole | null {
  if (roles.some((r) => r === 'owner' || r === 'admin')) return 'admin';
  if (roles.some((r) => r === 'stock_staff' || r === 'photo_staff' || r === 'staff')) return 'staff';
  return null;
}

export function useUserRole(): UserRoleState {
  const { user } = useAuth();
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setRole(null);
      setLoading(false);
      return;
    }

    let alive = true;
    const fetchRole = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id);

        if (!alive) return;
        if (error) {
          console.error('Error fetching user role:', error);
          setRole(null);
        } else {
          setRole(mapFilmShopRole((data ?? []).map((r: { role: string }) => String(r.role))));
        }
      } catch (err) {
        if (!alive) return;
        console.error('Error fetching user role:', err);
        setRole(null);
      } finally {
        if (alive) setLoading(false);
      }
    };

    fetchRole();
    return () => { alive = false; };
  }, [user]);

  return {
    role,
    isAdmin: role === 'admin',
    isStaff: role === 'staff' || role === 'admin',
    loading,
  };
}

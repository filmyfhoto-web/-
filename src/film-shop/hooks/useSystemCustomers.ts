import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/film-shop/lib/supabase';
import { useAppData } from '@/film-shop/hooks/useAppData';

/**
 * System-wide customer directory for FILM SHOP forms.
 *
 * Merges local `film_customers` (editable in this shop) with the cross-shop
 * directory (`v_unified_customers`) and `organizations`, deduplicated by
 * phone number, so document forms show the same customers as the rest of
 * the system.
 */
export type SystemCustomer = {
  id: string;
  name: string;
  phone: string;
  address: string;
  taxId: string;
  taxBranch: string;
  /** 'film' rows come from this shop; others are read-only directory rows. */
  origin: 'film' | 'shop' | 'org';
};

const digits = (v?: string | null) => (v || '').replace(/\D/g, '');

export function useSystemCustomers() {
  const { customers } = useAppData();
  const [external, setExternal] = useState<SystemCustomer[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [unifiedRes, orgRes] = await Promise.all([
      (supabase as any)
        .from('v_unified_customers')
        .select('source, source_id, name, phone, address')
        .neq('source', 'film')
        .order('name'),
      (supabase as any)
        .from('organizations')
        .select('id, name, contact_name, phone, address')
        .is('deleted_at', null)
        .order('name'),
    ]);
    const rows: SystemCustomer[] = [];
    for (const r of ((unifiedRes?.data as any[]) ?? [])) {
      rows.push({
        id: `u:${r.source}:${r.source_id}`,
        name: r.name || '(ไม่ระบุชื่อ)',
        phone: r.phone || '',
        address: r.address || '',
        taxId: '',
        taxBranch: '',
        origin: 'shop',
      });
    }
    for (const o of ((orgRes?.data as any[]) ?? [])) {
      rows.push({
        id: `o:${o.id}`,
        name: o.name || '(ไม่ระบุชื่อ)',
        phone: o.phone || '',
        address: o.address || '',
        taxId: '',
        taxBranch: '',
        origin: 'org',
      });
    }
    setExternal(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const onRefresh = () => void load();
    window.addEventListener('unified-customers:refresh', onRefresh);
    return () => window.removeEventListener('unified-customers:refresh', onRefresh);
  }, [load]);

  const local: SystemCustomer[] = customers.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone || '',
    address: c.address || '',
    taxId: c.taxId || '',
    taxBranch: c.taxBranch || '',
    origin: 'film' as const,
  }));

  const localPhones = new Set(local.map((c) => digits(c.phone)).filter(Boolean));
  const seen = new Set<string>();
  const merged = [
    ...local,
    ...external.filter((r) => {
      const p = digits(r.phone);
      if (p && localPhones.has(p)) return false;
      const key = `${r.name}|${p}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  ];

  return { customers: merged, loading, reload: load };
}

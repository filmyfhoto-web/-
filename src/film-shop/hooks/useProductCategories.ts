import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/film-shop/lib/supabase';
import { toast } from 'sonner';

export interface ProductCategory {
  key: string;
  name: string;
  color: string;
  enabled?: boolean; // default true; treat undefined as enabled for backward compat
}

const DEFAULT_CATS: ProductCategory[] = [
  { key: 'stamp', name: 'ตรายาง', color: 'hsl(340 70% 92%)' },
  { key: 'sticker', name: 'สติ๊กเกอร์', color: 'hsl(45 80% 90%)' },
  { key: 'frame', name: 'กรอบรูป', color: 'hsl(200 70% 90%)' },
  { key: 'copy', name: 'ถ่ายเอกสาร', color: 'hsl(150 50% 90%)' },
  { key: 'vinyl', name: 'ไวนิล', color: 'hsl(270 60% 92%)' },
  { key: 'foamboard', name: 'โฟมบอร์ด', color: 'hsl(20 70% 90%)' },
];

export function useProductCategories() {
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('shop_settings')
      .select('id, product_categories')
      .limit(1)
      .maybeSingle();
    if (data) {
      setSettingsId(data.id);
      const cats = (data.product_categories as any) || [];
      setCategories(Array.isArray(cats) && cats.length > 0 ? cats : DEFAULT_CATS);
    } else {
      setCategories(DEFAULT_CATS);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase.channel('product-categories-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shop_settings' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const persist = async (next: ProductCategory[]) => {
    setCategories(next);
    if (!settingsId) return;
    const { error } = await supabase
      .from('shop_settings')
      .update({ product_categories: next as any })
      .eq('id', settingsId);
    if (error) toast.error('บันทึกหมวดสินค้าล้มเหลว');
  };

  const addCategory = async (name: string, color: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now().toString(36);
    await persist([...categories, { key, name: trimmed, color, enabled: true }]);
  };

  const updateCategory = async (key: string, patch: Partial<ProductCategory>) => {
    await persist(categories.map(c => (c.key === key ? { ...c, ...patch } : c)));
  };

  const deleteCategory = async (key: string) => {
    await persist(categories.filter(c => c.key !== key));
  };

  const toggleCategoryEnabled = async (key: string, enabled: boolean) => {
    await persist(categories.map(c => (c.key === key ? { ...c, enabled } : c)));
  };

  // Categories available for selection in forms (enabled !== false)
  const enabledCategories = categories.filter(c => c.enabled !== false);

  return { categories, enabledCategories, loading, addCategory, updateCategory, deleteCategory, toggleCategoryEnabled };
}


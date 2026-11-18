import { useState, useEffect } from 'react';
import { supabase } from '@/film-shop/lib/supabase';
import { toast } from 'sonner';

export interface POSProductDB {
  id: string;
  name: string;
  price: number;
  unit: string;
  category: string;
  color: string;
  icon: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export function usePOSProducts() {
  const [products, setProducts] = useState<POSProductDB[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('pos_products')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) throw error;

      setProducts((data || []).map(p => ({
        ...p,
        price: Number(p.price),
        icon: p.icon || '📦',
      })));
    } catch (error) {
      console.error('Error fetching POS products:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAllProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('pos_products')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) throw error;

      return (data || []).map(p => ({
        ...p,
        price: Number(p.price),
        icon: p.icon || '📦',
      }));
    } catch (error) {
      console.error('Error fetching all POS products:', error);
      return [];
    }
  };

  const addProduct = async (product: Omit<POSProductDB, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      const { data, error } = await supabase
        .from('pos_products')
        .insert(product)
        .select()
        .single();

      if (error) throw error;

      toast.success('เพิ่มสินค้าเรียบร้อย');
      await fetchProducts();
      return data;
    } catch (error) {
      console.error('Error adding POS product:', error);
      toast.error('ไม่สามารถเพิ่มสินค้าได้');
      return null;
    }
  };

  const updateProduct = async (id: string, updates: Partial<POSProductDB>) => {
    try {
      const { error } = await supabase
        .from('pos_products')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      toast.success('อัปเดตสินค้าเรียบร้อย');
      await fetchProducts();
    } catch (error) {
      console.error('Error updating POS product:', error);
      toast.error('ไม่สามารถอัปเดตสินค้าได้');
    }
  };

  const deleteProduct = async (id: string) => {
    try {
      const { error } = await supabase
        .from('pos_products')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('ลบสินค้าเรียบร้อย');
      await fetchProducts();
    } catch (error) {
      console.error('Error deleting POS product:', error);
      toast.error('ไม่สามารถลบสินค้าได้');
    }
  };

  useEffect(() => {
    fetchProducts();

    const channel = supabase.channel('pos_products_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pos_products' }, () => {
        fetchProducts();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return {
    products,
    isLoading,
    fetchAllProducts,
    addProduct,
    updateProduct,
    deleteProduct,
    refetch: fetchProducts,
  };
}

import { useState, useEffect } from 'react';
import { supabase } from '@/film-shop/lib/supabase';
import { useToast } from '@/film-shop/hooks/use-toast';
import { POSReceipt, POSItem, PaymentStatus, POSPaymentType } from '@/film-shop/types/pos';

export function usePOSData() {
  const [receipts, setReceipts] = useState<POSReceipt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const fetchReceipts = async () => {
    try {
      const { data, error } = await supabase
        .from('pos_receipts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const mappedReceipts: POSReceipt[] = (data || []).map((receipt: any) => ({
        id: receipt.id,
        receiptNumber: receipt.receipt_number,
        customerName: receipt.customer_name || '',
        customerId: receipt.customer_id || undefined,
        receiptDate: new Date(receipt.receipt_date),
        paymentType: receipt.payment_type as POSPaymentType,
        paymentStatus: (receipt.payment_status || 'pending') as PaymentStatus,
        items: receipt.items as unknown as POSItem[],
        subtotal: Number(receipt.subtotal),
        deposit: Number(receipt.deposit),
        total: Number(receipt.total),
        notes: receipt.notes || undefined,
        cashReceived: receipt.cash_received ? Number(receipt.cash_received) : undefined,
        changeAmount: receipt.change_amount ? Number(receipt.change_amount) : undefined,
        createdAt: new Date(receipt.created_at),
        updatedAt: new Date(receipt.updated_at),
      }));

      setReceipts(mappedReceipts);
    } catch (error) {
      console.error('Error fetching POS receipts:', error);
      toast({
        title: 'เกิดข้อผิดพลาด',
        description: 'ไม่สามารถโหลดข้อมูลใบเสร็จได้',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const generateReceiptNumber = async (): Promise<string> => {
    const { data } = await supabase
      .from('pos_receipts')
      .select('receipt_number')
      .order('created_at', { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      const lastNumber = data[0].receipt_number;
      const numericPart = parseInt(lastNumber.replace('F', ''), 10);
      return `F${String(numericPart + 1).padStart(4, '0')}`;
    }
    return 'F0001';
  };

  const addReceipt = async (receipt: Omit<POSReceipt, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const insertData = {
        receipt_number: receipt.receiptNumber,
        customer_name: receipt.customerName,
        customer_id: receipt.customerId || null,
        receipt_date: receipt.receiptDate.toISOString(),
        payment_type: receipt.paymentType,
        payment_status: receipt.paymentStatus || 'pending',
        items: receipt.items as unknown as Record<string, unknown>[],
        subtotal: receipt.subtotal,
        deposit: receipt.deposit,
        total: receipt.total,
        notes: receipt.notes || null,
      };

      const { data, error } = await supabase
        .from('pos_receipts')
        .insert(insertData as any)
        .select()
        .single();

      if (error) throw error;

      toast({
        title: 'บันทึกสำเร็จ',
        description: `บันทึกใบเสร็จ ${receipt.receiptNumber} แล้ว`,
      });

      await fetchReceipts();
      return data;
    } catch (error) {
      console.error('Error adding POS receipt:', error);
      throw error;
    }
  };

  const updateReceipt = async (id: string, updates: Partial<POSReceipt>, options?: { silent?: boolean }) => {
    try {
      const updateData: Record<string, unknown> = {};
      
      if (updates.customerName !== undefined) updateData.customer_name = updates.customerName;
      if (updates.customerId !== undefined) updateData.customer_id = updates.customerId || null;
      if (updates.receiptDate !== undefined) updateData.receipt_date = updates.receiptDate.toISOString();
      if (updates.paymentType !== undefined) updateData.payment_type = updates.paymentType;
      if (updates.paymentStatus !== undefined) updateData.payment_status = updates.paymentStatus;
      if (updates.items !== undefined) updateData.items = updates.items as unknown as Record<string, unknown>[];
      if (updates.subtotal !== undefined) updateData.subtotal = updates.subtotal;
      if (updates.deposit !== undefined) updateData.deposit = updates.deposit;
      if (updates.total !== undefined) updateData.total = updates.total;
      if (updates.notes !== undefined) updateData.notes = updates.notes || null;
      if (updates.cashReceived !== undefined) updateData.cash_received = updates.cashReceived;
      if (updates.changeAmount !== undefined) updateData.change_amount = updates.changeAmount;

      const { error } = await supabase
        .from('pos_receipts')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;

      if (!options?.silent) {
        toast({
          title: 'บันทึกสำเร็จ',
          description: 'อัปเดตใบเสร็จแล้ว',
        });
      }

      await fetchReceipts();
    } catch (error) {
      console.error('Error updating POS receipt:', error);
      const message = error instanceof Error ? error.message : 'ไม่ทราบสาเหตุ';
      if (!options?.silent) {
        toast({
          title: 'เกิดข้อผิดพลาด',
          description: `ไม่สามารถอัปเดตใบเสร็จได้: ${message}`,
          variant: 'destructive',
        });
      }
      throw error;
    }
  };

  const deleteReceipt = async (id: string, options?: { silent?: boolean }) => {
    try {
      const { error } = await supabase
        .from('pos_receipts')
        .delete()
        .eq('id', id);

      if (error) throw error;

      if (!options?.silent) {
        toast({
          title: 'ลบสำเร็จ',
          description: 'ลบใบเสร็จแล้ว',
        });
      }

      await fetchReceipts();
    } catch (error) {
      console.error('Error deleting POS receipt:', error);
      if (!options?.silent) {
        toast({
          title: 'เกิดข้อผิดพลาด',
          description: 'ไม่สามารถลบใบเสร็จได้',
          variant: 'destructive',
        });
      }
      throw error;
    }
  };

  useEffect(() => {
    fetchReceipts();

    const channelName = `pos-receipts-changes-${Math.random().toString(36).slice(2, 10)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pos_receipts' }, () => {
        fetchReceipts();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return {
    receipts,
    isLoading,
    generateReceiptNumber,
    addReceipt,
    updateReceipt,
    deleteReceipt,
    refetch: fetchReceipts,
  };
}

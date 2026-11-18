import { useState, useEffect, useCallback } from 'react';
import { useRealtimeTable } from './useRealtimeTable';
import { supabase } from '@/film-shop/lib/supabase';
import { useToast } from '@/film-shop/hooks/use-toast';
import { CashDrawerShift, CashDrawerTransaction, CashDrawerTransactionType } from '@/film-shop/types/cashDrawer';

async function logAudit(params: {
  shiftId: string;
  action: string;
  fieldChanged?: string;
  oldValue?: string | number | null;
  newValue?: string | number | null;
  notes?: string;
}) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const name = (user?.user_metadata as any)?.full_name
      || (user?.user_metadata as any)?.name
      || user?.email
      || 'unknown';
    await supabase.from('cash_drawer_audit').insert({
      shift_id: params.shiftId,
      action: params.action,
      field_changed: params.fieldChanged ?? null,
      old_value: params.oldValue !== undefined && params.oldValue !== null ? String(params.oldValue) : null,
      new_value: params.newValue !== undefined && params.newValue !== null ? String(params.newValue) : null,
      notes: params.notes ?? null,
      changed_by: user?.id ?? null,
      changed_by_name: name,
    });
  } catch (e) {
    console.error('logAudit failed', e);
  }
}

export function useCashDrawer() {
  const [currentShift, setCurrentShift] = useState<CashDrawerShift | null>(null);
  const [transactions, setTransactions] = useState<CashDrawerTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const fetchCurrentShift = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('cash_drawer_shifts')
        .select('*')
        .eq('status', 'open')
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setCurrentShift({
          id: data.id,
          openedAt: new Date(data.opened_at),
          closedAt: data.closed_at ? new Date(data.closed_at) : undefined,
          openingAmount: Number(data.opening_amount),
          expectedAmount: Number(data.expected_amount),
          actualAmount: data.actual_amount ? Number(data.actual_amount) : undefined,
          difference: data.difference ? Number(data.difference) : undefined,
          status: data.status as 'open' | 'closed',
          notes: data.notes || undefined,
          createdAt: new Date(data.created_at),
        });
      } else {
        setCurrentShift(null);
      }
    } catch (error) {
      console.error('Error fetching current shift:', error);
    }
  }, []);

  const fetchTransactions = useCallback(async (shiftId: string) => {
    try {
      const { data, error } = await supabase
        .from('cash_drawer_transactions')
        .select('*')
        .eq('shift_id', shiftId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const mapped: CashDrawerTransaction[] = (data || []).map((t: any) => ({
        id: t.id,
        shiftId: t.shift_id,
        type: t.type as CashDrawerTransactionType,
        amount: Number(t.amount),
        description: t.description || undefined,
        posReceiptId: t.pos_receipt_id || undefined,
        createdAt: new Date(t.created_at),
      }));

      setTransactions(mapped);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    }
  }, []);

  const calculateExpectedAmount = useCallback((shift: CashDrawerShift, txns: CashDrawerTransaction[]) => {
    let expected = shift.openingAmount;
    for (const t of txns) {
      if (t.type === 'cash_in' || t.type === 'sale') {
        expected += t.amount;
      } else if (t.type === 'cash_out' || t.type === 'refund') {
        expected -= t.amount;
      }
    }
    return expected;
  }, []);

  const openShift = async (openingAmount: number, notes?: string) => {
    try {
      // Check if there's already an open shift
      if (currentShift) {
        toast({
          title: 'ไม่สามารถเปิดกะได้',
          description: 'มีกะที่เปิดอยู่แล้ว กรุณาปิดกะก่อน',
          variant: 'destructive',
        });
        return null;
      }

      const { data, error } = await supabase
        .from('cash_drawer_shifts')
        .insert({
          opening_amount: openingAmount,
          expected_amount: openingAmount,
          status: 'open',
          notes: notes || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Add opening transaction
      await supabase
        .from('cash_drawer_transactions')
        .insert({
          shift_id: data.id,
          type: 'opening',
          amount: openingAmount,
          description: 'เงินเริ่มต้น',
        });

      await logAudit({
        shiftId: data.id,
        action: 'open',
        fieldChanged: 'opening_amount',
        newValue: openingAmount,
        notes: notes,
      });

      toast({
        title: 'เปิดกะสำเร็จ',
        description: `เริ่มกะด้วยเงิน ฿${openingAmount.toLocaleString()}`,
      });

      await fetchCurrentShift();
      return data;
    } catch (error) {
      console.error('Error opening shift:', error);
      toast({
        title: 'เกิดข้อผิดพลาด',
        description: 'ไม่สามารถเปิดกะได้',
        variant: 'destructive',
      });
      return null;
    }
  };

  const closeShift = async (actualAmount: number, notes?: string) => {
    try {
      if (!currentShift) {
        toast({
          title: 'ไม่มีกะที่เปิดอยู่',
          description: 'กรุณาเปิดกะก่อน',
          variant: 'destructive',
        });
        return null;
      }

      const expectedAmount = calculateExpectedAmount(currentShift, transactions);
      const difference = actualAmount - expectedAmount;

      const { error } = await supabase
        .from('cash_drawer_shifts')
        .update({
          closed_at: new Date().toISOString(),
          expected_amount: expectedAmount,
          actual_amount: actualAmount,
          difference: difference,
          status: 'closed',
          notes: notes || null,
        })
        .eq('id', currentShift.id);

      if (error) throw error;

      await logAudit({
        shiftId: currentShift.id,
        action: 'close',
        fieldChanged: 'actual_amount',
        oldValue: currentShift.actualAmount ?? null,
        newValue: actualAmount,
        notes: `ยอดคาด ${expectedAmount} • ส่วนต่าง ${difference}${notes ? ` • ${notes}` : ''}`,
      });

      const diffText = difference === 0 
        ? 'ยอดตรง!' 
        : difference > 0 
          ? `เกิน ฿${difference.toLocaleString()}` 
          : `ขาด ฿${Math.abs(difference).toLocaleString()}`;

      toast({
        title: 'ปิดกะสำเร็จ',
        description: diffText,
      });

      setCurrentShift(null);
      setTransactions([]);
      return true;
    } catch (error) {
      console.error('Error closing shift:', error);
      toast({
        title: 'เกิดข้อผิดพลาด',
        description: 'ไม่สามารถปิดกะได้',
        variant: 'destructive',
      });
      return null;
    }
  };

  const addCashIn = async (amount: number, description: string) => {
    try {
      if (!currentShift) {
        toast({
          title: 'ไม่มีกะที่เปิดอยู่',
          description: 'กรุณาเปิดกะก่อน',
          variant: 'destructive',
        });
        return null;
      }

      const { error } = await supabase
        .from('cash_drawer_transactions')
        .insert({
          shift_id: currentShift.id,
          type: 'cash_in',
          amount: amount,
          description: description,
        });

      if (error) throw error;

      // Update expected amount
      const newExpected = currentShift.expectedAmount + amount;
      await supabase
        .from('cash_drawer_shifts')
        .update({ expected_amount: newExpected })
        .eq('id', currentShift.id);

      toast({
        title: 'เพิ่มเงินสำเร็จ',
        description: `เพิ่ม ฿${amount.toLocaleString()} - ${description}`,
      });

      await fetchCurrentShift();
      await fetchTransactions(currentShift.id);
      return true;
    } catch (error) {
      console.error('Error adding cash in:', error);
      toast({
        title: 'เกิดข้อผิดพลาด',
        description: 'ไม่สามารถเพิ่มเงินได้',
        variant: 'destructive',
      });
      return null;
    }
  };

  const addCashOut = async (amount: number, description: string) => {
    try {
      if (!currentShift) {
        toast({
          title: 'ไม่มีกะที่เปิดอยู่',
          description: 'กรุณาเปิดกะก่อน',
          variant: 'destructive',
        });
        return null;
      }

      const { error } = await supabase
        .from('cash_drawer_transactions')
        .insert({
          shift_id: currentShift.id,
          type: 'cash_out',
          amount: amount,
          description: description,
        });

      if (error) throw error;

      // Update expected amount
      const newExpected = currentShift.expectedAmount - amount;
      await supabase
        .from('cash_drawer_shifts')
        .update({ expected_amount: newExpected })
        .eq('id', currentShift.id);

      toast({
        title: 'ถอนเงินสำเร็จ',
        description: `ถอน ฿${amount.toLocaleString()} - ${description}`,
      });

      await fetchCurrentShift();
      await fetchTransactions(currentShift.id);
      return true;
    } catch (error) {
      console.error('Error adding cash out:', error);
      toast({
        title: 'เกิดข้อผิดพลาด',
        description: 'ไม่สามารถถอนเงินได้',
        variant: 'destructive',
      });
      return null;
    }
  };

  const recordSale = async (receiptId: string, receiptNumber: string, amount: number) => {
    try {
      if (!currentShift) {
        // No open shift, silently skip recording
        return null;
      }

      const { error } = await supabase
        .from('cash_drawer_transactions')
        .insert({
          shift_id: currentShift.id,
          type: 'sale',
          amount: amount,
          description: receiptNumber,
          pos_receipt_id: receiptId,
        });

      if (error) throw error;

      // Update expected amount
      const newExpected = currentShift.expectedAmount + amount;
      await supabase
        .from('cash_drawer_shifts')
        .update({ expected_amount: newExpected })
        .eq('id', currentShift.id);

      await fetchCurrentShift();
      await fetchTransactions(currentShift.id);
      return true;
    } catch (error) {
      console.error('Error recording sale:', error);
      return null;
    }
  };

  const updateTransaction = async (transactionId: string, amount: number, description: string) => {
    try {
      if (!currentShift) {
        toast({
          title: 'ไม่มีกะที่เปิดอยู่',
          variant: 'destructive',
        });
        return null;
      }

      // Get the old transaction to calculate difference
      const oldTransaction = transactions.find(t => t.id === transactionId);
      if (!oldTransaction) return null;

      const amountDiff = amount - oldTransaction.amount;

      const { error } = await supabase
        .from('cash_drawer_transactions')
        .update({ amount, description })
        .eq('id', transactionId);

      if (error) throw error;

      await logAudit({
        shiftId: currentShift.id,
        action: 'edit_transaction',
        fieldChanged: `${oldTransaction.type} (${oldTransaction.description ?? ''})`,
        oldValue: oldTransaction.amount,
        newValue: amount,
        notes: description !== oldTransaction.description ? `รายละเอียด: "${oldTransaction.description ?? ''}" → "${description}"` : undefined,
      });

      // Update expected amount based on transaction type
      let newExpected = currentShift.expectedAmount;
      if (oldTransaction.type === 'cash_in' || oldTransaction.type === 'sale') {
        newExpected += amountDiff;
      } else if (oldTransaction.type === 'cash_out' || oldTransaction.type === 'refund') {
        newExpected -= amountDiff;
      }

      await supabase
        .from('cash_drawer_shifts')
        .update({ expected_amount: newExpected })
        .eq('id', currentShift.id);

      toast({
        title: 'แก้ไขรายการสำเร็จ',
      });

      await fetchCurrentShift();
      await fetchTransactions(currentShift.id);
      return true;
    } catch (error) {
      console.error('Error updating transaction:', error);
      toast({
        title: 'เกิดข้อผิดพลาด',
        description: 'ไม่สามารถแก้ไขรายการได้',
        variant: 'destructive',
      });
      return null;
    }
  };

  const deleteTransaction = async (transactionId: string) => {
    try {
      if (!currentShift) {
        toast({
          title: 'ไม่มีกะที่เปิดอยู่',
          variant: 'destructive',
        });
        return null;
      }

      // Get the transaction to reverse the amount
      const transaction = transactions.find(t => t.id === transactionId);
      if (!transaction) return null;

      // Don't allow deleting opening transaction
      if (transaction.type === 'opening') {
        toast({
          title: 'ไม่สามารถลบรายการเปิดกะได้',
          variant: 'destructive',
        });
        return null;
      }

      const { error } = await supabase
        .from('cash_drawer_transactions')
        .delete()
        .eq('id', transactionId);

      if (error) throw error;

      await logAudit({
        shiftId: currentShift.id,
        action: 'delete_transaction',
        fieldChanged: `${transaction.type} (${transaction.description ?? ''})`,
        oldValue: transaction.amount,
        newValue: null,
      });

      // Reverse the expected amount
      let newExpected = currentShift.expectedAmount;
      if (transaction.type === 'cash_in' || transaction.type === 'sale') {
        newExpected -= transaction.amount;
      } else if (transaction.type === 'cash_out' || transaction.type === 'refund') {
        newExpected += transaction.amount;
      }

      await supabase
        .from('cash_drawer_shifts')
        .update({ expected_amount: newExpected })
        .eq('id', currentShift.id);

      toast({
        title: 'ลบรายการสำเร็จ',
      });

      await fetchCurrentShift();
      await fetchTransactions(currentShift.id);
      return true;
    } catch (error) {
      console.error('Error deleting transaction:', error);
      toast({
        title: 'เกิดข้อผิดพลาด',
        description: 'ไม่สามารถลบรายการได้',
        variant: 'destructive',
      });
      return null;
    }
  };

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await fetchCurrentShift();
      setIsLoading(false);
    };
    init();
  }, [fetchCurrentShift]);

  useEffect(() => {
    if (currentShift) {
      fetchTransactions(currentShift.id);
    }
  }, [currentShift?.id, fetchTransactions]);

  // Realtime: refresh on any change to shifts or transactions
  useRealtimeTable('cash_drawer_shifts', () => { fetchCurrentShift(); });
  useRealtimeTable('cash_drawer_transactions', () => {
    if (currentShift?.id) fetchTransactions(currentShift.id);
  });

  return {
    currentShift,
    transactions,
    isLoading,
    openShift,
    closeShift,
    addCashIn,
    addCashOut,
    recordSale,
    updateTransaction,
    deleteTransaction,
    refetch: fetchCurrentShift,
  };
}

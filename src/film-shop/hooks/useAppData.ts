import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/film-shop/lib/supabase';
import { reportChannelStatus, unregisterChannel, onGlobalRefresh, getRealtimeState, markSynced } from '@/film-shop/lib/realtimeStatus';
import { Customer, Invoice, Employee, Transaction, ShopSettings, VinylItem, ProductPricing } from '@/film-shop/types';
type RubberStampOrder = any;
import { toast } from 'sonner';
import { Json } from '@/integrations/supabase/types';

const DEFAULT_PRODUCT_LABELS = {
  vinyl: 'ไวนิล',
  paswood: 'พาสวูด',
  sticker: 'สติ๊กเกอร์',
  foamboard: 'โฟมบอร์ด',
};

const defaultSettings: ShopSettings = {
  shopName: 'ร้านไวนิลดีไซน์',
  shopAddress: '123/45 ถ.สุขุมวิท แขวงคลองตัน เขตคลองเตย กรุงเทพฯ 10110',
  shopPhone: '02-123-4567',
  shopTaxId: '1234567890123',
  defaultPricePerSqm: 150,
  productPricing: {
    vinyl: 150,
    paswood: 200,
    sticker: 120,
    foamboard: 180,
  },
  productLabels: { ...DEFAULT_PRODUCT_LABELS },
  receiptHeader: 'ใบเสร็จรับเงิน',
  receiptFooter: 'ขอบคุณที่ใช้บริการ',
};

export function useAppData() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [settings, setSettings] = useState<ShopSettings>(defaultSettings);
  const [rubberStampOrders, setRubberStampOrders] = useState<RubberStampOrder[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch all data on mount
  useEffect(() => {
    fetchAllData();
    const channelId = Math.random().toString(36).slice(2, 10);
    
    // Set up realtime subscriptions
    const customersChannel = supabase.channel(`customers-changes-${channelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, () => fetchCustomers())
      .subscribe((status: string) => reportChannelStatus(`customers-${channelId}`, status));

    // Cross-shop customer directory: react to rds_customers changes so the
    // unified view rendered by CustomerManager stays in sync when the other
    // shop adds or edits a customer.
    const rdsCustomersChannel = (supabase as any)
      .channel(`rds-customers-changes-${channelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rds_customers' }, () => {
        window.dispatchEvent(new CustomEvent('unified-customers:refresh'));
      })
      .subscribe();

    const organizationsChannel = (supabase as any)
      .channel(`organizations-changes-${channelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'organizations' }, () => {
        window.dispatchEvent(new CustomEvent('unified-customers:refresh'));
      })
      .subscribe();

    const invoicesChannel = supabase.channel(`invoices-changes-${channelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, () => fetchInvoices())
      .subscribe();

    const employeesChannel = supabase.channel(`employees-changes-${channelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, () => fetchEmployees())
      .subscribe();

    const transactionsChannel = supabase.channel(`transactions-changes-${channelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => fetchTransactions())
      .subscribe();

    // rubber stamp removed

    const settingsChannel = supabase.channel(`settings-changes-${channelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shop_settings' }, () => fetchSettings())
      .subscribe();

    // New LINE-paste / customer-submitted job requests: surface a global
    // event + toast so any screen (sidebar badge, dashboards) can refresh.
    const jobRequestsChannel = (supabase as any)
      .channel(`job-requests-changes-${channelId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'job_requests' }, (payload: any) => {
        try {
          const row = payload?.new;
          if (row?.status === 'new') {
            toast.info('มีคำสั่งงานจาก LINE ใหม่', {
              description: row.customer_name || row.title || 'ตรวจสอบในเมนู "คำสั่งงานจาก LINE"',
            });
          }
        } catch {}
        window.dispatchEvent(new CustomEvent('job-requests:refresh'));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'job_requests' }, () => {
        window.dispatchEvent(new CustomEvent('job-requests:refresh'));
      })
      .subscribe();

    const offGlobalRefresh = onGlobalRefresh(() => { void fetchAllData(); });
    const onVisibleRefresh = () => {
      if (document.visibilityState === 'visible') void fetchAllData();
    };
    document.addEventListener('visibilitychange', onVisibleRefresh);
    window.addEventListener('online', onVisibleRefresh);
    const fallbackPoll = window.setInterval(() => {
      if (getRealtimeState() !== 'connected') void fetchAllData();
    }, 45000);

    return () => {
      offGlobalRefresh();
      document.removeEventListener('visibilitychange', onVisibleRefresh);
      window.removeEventListener('online', onVisibleRefresh);
      window.clearInterval(fallbackPoll);
      unregisterChannel(`customers-${channelId}`);
      supabase.removeChannel(customersChannel);
      supabase.removeChannel(rdsCustomersChannel);
      supabase.removeChannel(organizationsChannel);
      supabase.removeChannel(invoicesChannel);
      supabase.removeChannel(employeesChannel);
      supabase.removeChannel(transactionsChannel);
      supabase.removeChannel(settingsChannel);
      supabase.removeChannel(jobRequestsChannel);
    };
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    await Promise.all([
      fetchCustomers(),
      fetchInvoices(),
      fetchEmployees(),
      fetchTransactions(),
      fetchSettings(),
    ]);
    setLoading(false);
    markSynced();
  };

  const fetchCustomers = async () => {
    const { data, error } = await supabase.from('customers').select('*').order('created_at', { ascending: false });
    if (error) {
      console.error('Error fetching customers:', error);
      return;
    }
    setCustomers(data.map(c => ({
      id: c.id,
      name: c.name,
      taxId: c.tax_id || undefined,
      taxBranch: (c as any).tax_branch || undefined,
      phone: c.phone || undefined,
      address: c.address || undefined,
      createdAt: new Date(c.created_at),
    })));
  };

  const fetchInvoices = async () => {
    const { data, error } = await supabase.from('invoices').select('*').order('created_at', { ascending: false });
    if (error) {
      console.error('Error fetching invoices:', error);
      return;
    }
    setInvoices(data.map(i => ({
      id: i.id,
      invoiceNumber: i.invoice_number,
      type: i.type as 'quotation' | 'invoice' | 'receipt' | 'job_order',
      customerId: i.customer_id || undefined,
      customerName: i.customer_name,
      customerTaxId: i.customer_tax_id || undefined,
      customerBranch: (i as any).customer_branch || undefined,
      customerPhone: i.customer_phone || undefined,
      customerAddress: i.customer_address || undefined,
      items: (i.items as unknown as VinylItem[]) || [],
      subtotal: Number(i.subtotal),
      deposit: Number(i.deposit),
      discount: Number(i.discount),
      total: Number(i.total),
      amountDue: Number(i.amount_due),
      status: i.status as Invoice['status'],
      jobStatus: i.job_status as 'pending' | 'in-progress' | 'printing' | 'completed' | 'delivered',
      salesPerson: i.sales_person || undefined,
      referenceDoc: i.reference_doc || undefined,
      notes: i.notes || undefined,
      headerText: (i as any).header_text || undefined,
      createdAt: new Date(i.created_at),
      documentDate: (i as any).document_date ? new Date((i as any).document_date) : new Date(i.created_at),
      dueDate: i.due_date ? new Date(i.due_date) : undefined,
      paidAt: i.paid_at ? new Date(i.paid_at) : undefined,
      paymentMethod: i.payment_method as 'cash' | 'transfer' | 'credit' | undefined,
      attachments: (Array.isArray(i.attachments) ? (i.attachments as any) : undefined) as Invoice['attachments'],
      isDraft: (i as any).is_draft ?? false,
      createdVia: ((i as any).created_via as 'app' | 'line') || 'app',
      createdViaLineUserId: (i as any).created_via_line_user_id || undefined,
    })));
  };

  const fetchEmployees = async () => {
    const { data, error } = await supabase.from('employees').select('*').order('created_at', { ascending: false });
    if (error) {
      console.error('Error fetching employees:', error);
      return;
    }
    setEmployees(data.map(e => ({
      id: e.id,
      name: e.name,
      position: e.position,
      phone: e.phone || undefined,
      email: e.email || undefined,
      startDate: new Date(e.start_date),
      isActive: e.is_active,
    })));
  };

  const fetchTransactions = async () => {
    const { data, error } = await supabase.from('transactions').select('*').order('date', { ascending: false });
    if (error) {
      console.error('Error fetching transactions:', error);
      return;
    }
    setTransactions(data
      .filter((t: any) => !t.voided_at)
      .map((t: any) => ({
        id: t.id,
        type: t.type as 'income' | 'expense',
        category: t.category,
        description: t.description,
        amount: Number(t.amount),
        date: new Date(t.date),
        invoiceId: t.invoice_id || undefined,
        source: t.source ?? null,
        evidence: Array.isArray(t.evidence) ? t.evidence : [],
        createdAt: t.created_at ? new Date(t.created_at) : undefined,
      })));
  };

  const fetchRubberStampOrders = async () => {
    // rubber stamp module removed
  };

  const fetchSettings = async () => {
    // Try full table first (admin), fall back to public view (staff - excludes webhook URL)
    let data: any = null;
    let error: any = null;
    const result = await supabase.from('shop_settings').select('*').limit(1).single();
    if (result.error) {
      const fallback = await (supabase as any).from('shop_settings_public').select('*').limit(1).single();
      data = fallback.data;
      error = fallback.error;
    } else {
      data = result.data;
      error = result.error;
    }
    if (error) {
      console.error('Error fetching settings:', error);
      return;
    }
    if (data) {
      const pricing = data.product_pricing as unknown as ProductPricing;
      const labels = ((data as any).product_labels as unknown as Record<string, string>) || {};
      setSettings({
        shopName: data.shop_name,
        shopAddress: data.shop_address,
        shopPhone: data.shop_phone,
        shopTaxId: data.shop_tax_id,
        shopLogo: data.shop_logo || undefined,
        defaultPricePerSqm: Number(data.default_price_per_sqm),
        productPricing: pricing || defaultSettings.productPricing,
        productLabels: { ...DEFAULT_PRODUCT_LABELS, ...labels },
        receiptHeader: data.receipt_header || undefined,
        receiptFooter: data.receipt_footer || undefined,
        quotationHeaderText: (data as any).quotation_header_text || undefined,
      });
    }
  };

  // Customer functions
  const addCustomer = async (customer: Omit<Customer, 'id' | 'createdAt'>) => {
    const { data, error } = await supabase.from('customers').insert({
      name: customer.name,
      tax_id: customer.taxId || null,
      tax_branch: customer.taxBranch || null,
      phone: customer.phone || null,
      address: customer.address || null,
    }).select().single();
    
    if (error) {
      toast.error('ไม่สามารถเพิ่มลูกค้าได้');
      console.error('Error adding customer:', error);
      return null;
    }
    
    const newCustomer: Customer = {
      id: data.id,
      name: data.name,
      taxId: data.tax_id || undefined,
      taxBranch: (data as any).tax_branch || undefined,
      phone: data.phone || undefined,
      address: data.address || undefined,
      createdAt: new Date(data.created_at),
    };
    return newCustomer;
  };

  const updateCustomer = async (id: string, updates: Partial<Customer>) => {
    const { error } = await supabase.from('customers').update({
      name: updates.name,
      tax_id: updates.taxId || null,
      tax_branch: updates.taxBranch || null,
      phone: updates.phone || null,
      address: updates.address || null,
    }).eq('id', id);
    
    if (error) {
      toast.error('ไม่สามารถอัปเดตลูกค้าได้');
      console.error('Error updating customer:', error);
    }
  };

  const deleteCustomer = async (id: string) => {
    const { error } = await supabase.from('customers').delete().eq('id', id);
    if (error) {
      toast.error('ไม่สามารถลบลูกค้าได้');
      console.error('Error deleting customer:', error);
    }
  };

  // Auto-record income transaction for an invoice based on payment status.
  // status='credit' or 'pending' -> no income (only outstanding receivable).
  // status='paid' -> income = total. status='deposit'/'partial' -> income = total - amountDue.
  const syncInvoiceTransaction = async (inv: {
    id: string; type: 'quotation' | 'invoice' | 'receipt' | 'job_order';
    invoiceNumber: string; customerName: string;
    total: number; amountDue: number; status: Invoice['status'];
    paidAt?: Date;
  }) => {
    try {
      // Always remove prior income rows for this invoice (idempotent)
      await supabase.from('transactions').delete().eq('invoice_id', inv.id).eq('type', 'income');

      if (inv.status === 'pending' || inv.status === 'credit') return;

      const paidAmount = inv.status === 'paid'
        ? Number(inv.total) || 0
        : Math.max(0, (Number(inv.total) || 0) - (Number(inv.amountDue) || 0));
      if (paidAmount <= 0) return;

      const typeLabel = inv.type === 'quotation' ? 'ใบเสนอราคา'
        : inv.type === 'invoice' ? 'ใบวางบิล' : 'ใบเสร็จ';
      const category = inv.status === 'deposit' || inv.status === 'partial'
        ? `มัดจำ-${typeLabel}` : `ขาย-${typeLabel}`;

      await supabase.from('transactions').insert({
        type: 'income',
        category,
        description: `${inv.invoiceNumber} - ${inv.customerName || '-'}`,
        amount: paidAmount,
        date: (inv.paidAt || new Date()).toISOString(),
        invoice_id: inv.id,
      });
    } catch (e) {
      console.error('syncInvoiceTransaction error', e);
    }
  };

  // Invoice functions
  const addInvoice = async (invoice: Omit<Invoice, 'id' | 'createdAt'> & { sourceJobRequestId?: string }) => {
    // For job orders, always mint the number server-side so concurrent staff
    // can never collide (and the sequence is separate from invoice numbers).
    let invoiceNumber = invoice.invoiceNumber;
    if (invoice.type === 'job_order') {
      const { data: nextNo, error: rpcErr } = await (supabase as any).rpc('film_next_job_order_number');
      if (rpcErr) {
        console.warn('film_next_job_order_number rpc failed, falling back:', rpcErr);
      } else if (typeof nextNo === 'string' && nextNo.length > 0) {
        invoiceNumber = nextNo;
      }
    }
    const { data, error } = await supabase.from('invoices').insert({
      source_job_request_id: invoice.sourceJobRequestId || null,
      invoice_number: invoiceNumber,
      type: invoice.type,
      customer_id: invoice.customerId || null,
      customer_name: invoice.customerName,
      customer_tax_id: invoice.customerTaxId || null,
      customer_branch: invoice.customerBranch || null,
      customer_phone: invoice.customerPhone || null,
      customer_address: invoice.customerAddress || null,
      items: invoice.items as unknown as Json,
      subtotal: invoice.subtotal,
      deposit: invoice.deposit,
      discount: invoice.discount,
      total: invoice.total,
      amount_due: invoice.amountDue,
      status: invoice.status,
      job_status: invoice.jobStatus,
      sales_person: invoice.salesPerson || null,
      reference_doc: invoice.referenceDoc || null,
      notes: invoice.notes || null,
      header_text: invoice.headerText || null,
      document_date: (invoice.documentDate || new Date()).toISOString(),
      due_date: invoice.dueDate?.toISOString() || null,
      paid_at: invoice.paidAt?.toISOString() || null,
      payment_method: invoice.paymentMethod || null,
      attachments: (invoice.attachments as unknown as Json) || null,
    }).select().single();
    
    if (error) {
      toast.error('ไม่สามารถเพิ่มใบเสร็จได้');
      console.error('Error adding invoice:', error);
      return null;
    }
    
    // Auto-record income transaction (paid/deposit only) — skip drafts
    if (!invoice.isDraft) {
      await syncInvoiceTransaction({
        id: data.id, type: invoice.type, invoiceNumber: invoice.invoiceNumber,
        customerName: invoice.customerName, total: Number(data.total) || 0,
        amountDue: Number(data.amount_due) || 0, status: invoice.status,
        paidAt: invoice.paidAt,
      });
    }

    return {
      id: data.id,
      invoiceNumber: data.invoice_number,
      type: data.type as 'quotation' | 'invoice' | 'receipt' | 'job_order',
      customerId: data.customer_id || undefined,
      customerName: data.customer_name,
      customerTaxId: data.customer_tax_id || undefined,
      customerBranch: (data as any).customer_branch || undefined,
      customerPhone: data.customer_phone || undefined,
      customerAddress: data.customer_address || undefined,
      items: (data.items as unknown as VinylItem[]) || [],
      subtotal: Number(data.subtotal),
      deposit: Number(data.deposit),
      discount: Number(data.discount),
      total: Number(data.total),
      amountDue: Number(data.amount_due),
      status: data.status as Invoice['status'],
      jobStatus: data.job_status as 'pending' | 'in-progress' | 'printing' | 'completed' | 'delivered',
      salesPerson: data.sales_person || undefined,
      referenceDoc: data.reference_doc || undefined,
      notes: data.notes || undefined,
      headerText: (data as any).header_text || undefined,
      createdAt: new Date(data.created_at),
      documentDate: (data as any).document_date ? new Date((data as any).document_date) : new Date(data.created_at),
      dueDate: data.due_date ? new Date(data.due_date) : undefined,
      paidAt: data.paid_at ? new Date(data.paid_at) : undefined,
      paymentMethod: data.payment_method as 'cash' | 'transfer' | 'credit' | undefined,
      attachments: (Array.isArray(data.attachments) ? (data.attachments as any) : undefined) as Invoice['attachments'],
    } as Invoice;
  };

  const updateInvoice = async (id: string, updates: Partial<Invoice>) => {
    const updateData: Record<string, Json | string | number | null> = {};
    if (updates.invoiceNumber !== undefined) updateData.invoice_number = updates.invoiceNumber;
    if (updates.type !== undefined) updateData.type = updates.type;
    if (updates.customerId !== undefined) updateData.customer_id = updates.customerId || null;
    if (updates.customerName !== undefined) updateData.customer_name = updates.customerName;
    if (updates.customerTaxId !== undefined) updateData.customer_tax_id = updates.customerTaxId || null;
    if (updates.customerBranch !== undefined) updateData.customer_branch = updates.customerBranch || null;
    if (updates.customerPhone !== undefined) updateData.customer_phone = updates.customerPhone || null;
    if (updates.customerAddress !== undefined) updateData.customer_address = updates.customerAddress || null;
    if (updates.items !== undefined) updateData.items = updates.items as unknown as Json;
    if (updates.subtotal !== undefined) updateData.subtotal = updates.subtotal;
    if (updates.deposit !== undefined) updateData.deposit = updates.deposit;
    if (updates.discount !== undefined) updateData.discount = updates.discount;
    if (updates.total !== undefined) updateData.total = updates.total;
    if (updates.amountDue !== undefined) updateData.amount_due = updates.amountDue;
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.jobStatus !== undefined) updateData.job_status = updates.jobStatus;
    if (updates.salesPerson !== undefined) updateData.sales_person = updates.salesPerson || null;
    if (updates.referenceDoc !== undefined) updateData.reference_doc = updates.referenceDoc || null;
    if (updates.notes !== undefined) updateData.notes = updates.notes || null;
    if (updates.headerText !== undefined) (updateData as any).header_text = updates.headerText || null;
    if (updates.documentDate !== undefined) updateData.document_date = updates.documentDate?.toISOString() || null;
    if (updates.dueDate !== undefined) updateData.due_date = updates.dueDate?.toISOString() || null;
    if (updates.paidAt !== undefined) updateData.paid_at = updates.paidAt?.toISOString() || null;
    if (updates.paymentMethod !== undefined) updateData.payment_method = updates.paymentMethod || null;
    if (updates.attachments !== undefined) updateData.attachments = (updates.attachments as unknown as Json) || null;
    if (updates.isDraft !== undefined) (updateData as any).is_draft = updates.isDraft;

    const { error } = await supabase.from('invoices').update(updateData).eq('id', id);
    
    if (error) {
      toast.error(`ไม่สามารถอัปเดตใบเสร็จได้: ${error.message}`);
      console.error('Error updating invoice:', error);
      throw error;
    }

    // Re-sync transaction after update (read fresh row to get authoritative numbers)
    const { data: fresh, error: freshError } = await supabase.from('invoices').select('*').eq('id', id).maybeSingle();
    if (freshError) {
      toast.error(`อัปเดตแล้ว แต่โหลดข้อมูลล่าสุดไม่สำเร็จ: ${freshError.message}`);
      console.error('Error refetching invoice:', freshError);
      throw freshError;
    }
    if (fresh && !(fresh as any).is_draft) {
      await syncInvoiceTransaction({
        id: fresh.id,
        type: fresh.type as any,
        invoiceNumber: fresh.invoice_number,
        customerName: fresh.customer_name,
        total: Number(fresh.total) || 0,
        amountDue: Number(fresh.amount_due) || 0,
        status: fresh.status as Invoice['status'],
        paidAt: fresh.paid_at ? new Date(fresh.paid_at) : undefined,
      });
    }
  };

  const deleteInvoice = async (id: string, options?: { silent?: boolean }) => {
    const { error: transactionError } = await supabase
      .from('transactions')
      .delete()
      .eq('invoice_id', id);

    if (transactionError) {
      if (!options?.silent) toast.error(`ไม่สามารถลบรายการรายรับที่เกี่ยวข้องได้: ${transactionError.message}`);
      console.error('Error deleting related transactions:', transactionError);
      throw transactionError;
    }

    const { error } = await supabase.from('invoices').delete().eq('id', id);
    if (error) {
      if (!options?.silent) toast.error(`ไม่สามารถลบเอกสารได้: ${error.message}`);
      console.error('Error deleting invoice:', error);
      throw error;
    }

    await Promise.all([fetchInvoices(), fetchTransactions()]);
  };

  // Employee functions
  const addEmployee = async (employee: Omit<Employee, 'id'>) => {
    const { data, error } = await supabase.from('employees').insert({
      name: employee.name,
      position: employee.position,
      phone: employee.phone || null,
      email: employee.email || null,
      start_date: employee.startDate.toISOString(),
      is_active: employee.isActive,
    }).select().single();
    
    if (error) {
      toast.error('ไม่สามารถเพิ่มพนักงานได้');
      console.error('Error adding employee:', error);
      return null;
    }
    
    return {
      id: data.id,
      name: data.name,
      position: data.position,
      phone: data.phone || undefined,
      email: data.email || undefined,
      startDate: new Date(data.start_date),
      isActive: data.is_active,
    } as Employee;
  };

  const updateEmployee = async (id: string, updates: Partial<Employee>) => {
    const updateData: Record<string, string | boolean | null> = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.position !== undefined) updateData.position = updates.position;
    if (updates.phone !== undefined) updateData.phone = updates.phone || null;
    if (updates.email !== undefined) updateData.email = updates.email || null;
    if (updates.startDate !== undefined) updateData.start_date = updates.startDate.toISOString();
    if (updates.isActive !== undefined) updateData.is_active = updates.isActive;

    const { error } = await supabase.from('employees').update(updateData).eq('id', id);
    
    if (error) {
      toast.error('ไม่สามารถอัปเดตพนักงานได้');
      console.error('Error updating employee:', error);
    }
  };

  const deleteEmployee = async (id: string) => {
    const { error } = await supabase.from('employees').delete().eq('id', id);
    if (error) {
      toast.error('ไม่สามารถลบพนักงานได้');
      console.error('Error deleting employee:', error);
    }
  };

  // Transaction functions
  const addTransaction = async (transaction: Omit<Transaction, 'id'>) => {
    const { data, error } = await supabase.from('transactions').insert({
      type: transaction.type,
      category: transaction.category,
      description: transaction.description,
      amount: transaction.amount,
      date: transaction.date.toISOString(),
      invoice_id: transaction.invoiceId || null,
    }).select().single();
    
    if (error) {
      toast.error('ไม่สามารถเพิ่มธุรกรรมได้');
      console.error('Error adding transaction:', error);
      return null;
    }
    
    return {
      id: data.id,
      type: data.type as 'income' | 'expense',
      category: data.category,
      description: data.description,
      amount: Number(data.amount),
      date: new Date(data.date),
      invoiceId: data.invoice_id || undefined,
    } as Transaction;
  };

  const deleteTransaction = async (id: string) => {
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if (error) {
      toast.error('ไม่สามารถลบธุรกรรมได้');
      console.error('Error deleting transaction:', error);
    }
  };

  // Rubber Stamp Order functions (removed - keep stubs for back-compat)
  const addRubberStampOrder = async (_order: any) => null;
  const updateRubberStampOrder = async (_id: string, _updates: any) => {};
  const deleteRubberStampOrder = async (_id: string) => {};

  // Update settings
  const updateSettings = async (newSettings: ShopSettings) => {
    const { error } = await supabase.from('shop_settings').update({
      shop_name: newSettings.shopName,
      shop_address: newSettings.shopAddress,
      shop_phone: newSettings.shopPhone,
      shop_tax_id: newSettings.shopTaxId,
      shop_logo: newSettings.shopLogo || null,
      default_price_per_sqm: newSettings.defaultPricePerSqm,
      product_pricing: newSettings.productPricing as unknown as Json,
      product_labels: newSettings.productLabels as unknown as Json,
      receipt_header: newSettings.receiptHeader || null,
      receipt_footer: newSettings.receiptFooter || null,
      quotation_header_text: newSettings.quotationHeaderText || null,
      updated_at: new Date().toISOString(),
    }).neq('id', '00000000-0000-0000-0000-000000000000');

    if (error) {
      toast.error('ไม่สามารถอัปเดตการตั้งค่าได้');
      console.error('Error updating settings:', error);
    } else {
      setSettings(newSettings);
    }
  };

  const getRubberStampStats = useCallback((year: number, month: number) => {
    const orders = rubberStampOrders.filter(o => {
      const date = new Date(o.createdAt);
      return date.getFullYear() === year && date.getMonth() === month;
    });
    
    const totalSales = orders.reduce((sum, o) => sum + o.total, 0);
    const paidSales = orders.filter(o => o.paymentStatus === 'paid').reduce((sum, o) => sum + (o.total - o.amountDue), 0);
    const pendingSales = orders.reduce((sum, o) => sum + o.amountDue, 0);
    const totalOrders = orders.length;
    const completedOrders = orders.filter(o => o.status === 'completed' || o.status === 'delivered').length;
    
    return { totalSales, paidSales, pendingSales, totalOrders, completedOrders };
  }, [rubberStampOrders]);

  // Generate rubber stamp order number
  const generateRubberStampOrderNumber = useCallback((type: 'quotation' | 'invoice' | 'receipt') => {
    const prefix = type === 'quotation' ? 'RS-QT' : type === 'invoice' ? 'RS-INV' : 'RS-RC';
    const year = new Date().getFullYear().toString().slice(-2);
    const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
    const count = rubberStampOrders.filter(o => o.type === type).length + 1;
    return `${prefix}-${year}${month}${count.toString().padStart(4, '0')}`;
  }, [rubberStampOrders]);

  // Generate invoice number
  const generateInvoiceNumber = useCallback((type: 'quotation' | 'invoice' | 'receipt' | 'job_order') => {
    const prefix = type === 'quotation' ? 'QT' : type === 'invoice' ? 'INV' : type === 'job_order' ? 'JO' : 'RC';
    const year = new Date().getFullYear().toString().slice(-2);
    const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
    const count = invoices.filter(i => i.type === type).length + 1;
    return `${prefix}-${year}${month}${count.toString().padStart(4, '0')}`;
  }, [invoices]);

  // Stats
  const getStats = useCallback(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const thisMonth = invoices.filter(i => {
      const date = new Date(i.createdAt);
      return date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
    });

    const totalRevenue = thisMonth.reduce((sum, i) => sum + (i.total - i.amountDue), 0);
    const pendingAmount = invoices.reduce((sum, i) => sum + i.amountDue, 0);
    const paidInvoices = invoices.filter(i => i.status === 'paid').length;
    const unpaidInvoices = invoices.filter(i => i.status !== 'paid').length;

    const monthlyExpenses = transactions
      .filter(t => {
        const date = new Date(t.date);
        return t.type === 'expense' && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
      })
      .reduce((sum, t) => sum + t.amount, 0);

    const rubberStampSales = rubberStampOrders
      .filter(o => {
        const date = new Date(o.createdAt);
        return date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
      })
      .reduce((sum, o) => sum + o.total, 0);

    return {
      totalRevenue: totalRevenue + rubberStampSales,
      pendingAmount,
      paidInvoices,
      unpaidInvoices,
      monthlyExpenses,
      totalCustomers: customers.length,
      activeJobs: invoices.filter(i => i.jobStatus !== 'delivered' && i.jobStatus !== 'completed').length,
      rubberStampSales,
      rubberStampOrders: rubberStampOrders.length,
    };
  }, [invoices, transactions, rubberStampOrders, customers]);

  return {
    customers,
    invoices,
    employees,
    transactions,
    settings,
    rubberStampOrders,
    loading,
    setSettings: updateSettings,
    addCustomer,
    updateCustomer,
    deleteCustomer,
    addInvoice,
    updateInvoice,
    deleteInvoice,
    addEmployee,
    updateEmployee,
    deleteEmployee,
    addTransaction,
    deleteTransaction,
    addRubberStampOrder,
    updateRubberStampOrder,
    deleteRubberStampOrder,
    getRubberStampStats,
    generateRubberStampOrderNumber,
    generateInvoiceNumber,
    getStats,
    refetch: fetchAllData,
  };
}

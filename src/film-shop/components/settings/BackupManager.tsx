import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAppData } from '@/film-shop/hooks/useAppData';
import { Download, Upload, Database, AlertTriangle, Cloud, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/film-shop/lib/supabase';
import { Json } from '@/integrations/supabase/types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export function BackupManager() {
  const { customers, invoices, employees, transactions, settings, rubberStampOrders, refetch, loading } = useAppData();
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleExport = () => {
    const data = {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      customers,
      invoices,
      employees,
      transactions,
      settings,
      rubberStampOrders,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vinyl-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success('สำรองข้อมูลเรียบร้อย');
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        setPendingRestore(content);
        setShowRestoreDialog(true);
      } catch {
        toast.error('ไม่สามารถอ่านไฟล์ได้');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const confirmRestore = async () => {
    if (!pendingRestore) return;
    setIsRestoring(true);

    try {
      const data = JSON.parse(pendingRestore);
      
      // Delete existing data first
      await supabase.from('transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('invoices').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      // rubber_stamp_orders table removed
      await supabase.from('employees').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('customers').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      // Insert customers
      if (data.customers && data.customers.length > 0) {
        const customersToInsert = data.customers.map((c: Record<string, unknown>) => ({
          id: c.id as string,
          name: c.name as string,
          tax_id: (c.taxId as string) || null,
          phone: (c.phone as string) || null,
          address: (c.address as string) || null,
          created_at: c.createdAt ? new Date(c.createdAt as string).toISOString() : new Date().toISOString(),
        }));
        await supabase.from('customers').insert(customersToInsert);
      }

      // Insert employees
      if (data.employees && data.employees.length > 0) {
        const employeesToInsert = data.employees.map((e: Record<string, unknown>) => ({
          id: e.id as string,
          name: e.name as string,
          position: e.position as string,
          phone: (e.phone as string) || null,
          email: (e.email as string) || null,
          start_date: e.startDate ? new Date(e.startDate as string).toISOString() : new Date().toISOString(),
          is_active: e.isActive as boolean ?? true,
        }));
        await supabase.from('employees').insert(employeesToInsert);
      }

      // Insert invoices
      if (data.invoices && data.invoices.length > 0) {
        const invoicesToInsert = data.invoices.map((i: Record<string, unknown>) => ({
          id: i.id as string,
          invoice_number: i.invoiceNumber as string,
          type: i.type as string,
          customer_id: (i.customerId as string) || null,
          customer_name: i.customerName as string,
          customer_tax_id: (i.customerTaxId as string) || null,
          customer_phone: (i.customerPhone as string) || null,
          customer_address: (i.customerAddress as string) || null,
          items: i.items as Json,
          subtotal: i.subtotal as number,
          deposit: i.deposit as number,
          discount: i.discount as number,
          total: i.total as number,
          amount_due: i.amountDue as number,
          status: i.status as string,
          job_status: i.jobStatus as string,
          sales_person: (i.salesPerson as string) || null,
          reference_doc: (i.referenceDoc as string) || null,
          notes: (i.notes as string) || null,
          due_date: i.dueDate ? new Date(i.dueDate as string).toISOString() : null,
          paid_at: i.paidAt ? new Date(i.paidAt as string).toISOString() : null,
          payment_method: (i.paymentMethod as string) || null,
          attachments: (i.attachments as Json) || null,
          created_at: i.createdAt ? new Date(i.createdAt as string).toISOString() : new Date().toISOString(),
        }));
        await supabase.from('invoices').insert(invoicesToInsert);
      }

      // rubber stamp orders removed

      // Insert transactions
      if (data.transactions && data.transactions.length > 0) {
        const transactionsToInsert = data.transactions.map((t: Record<string, unknown>) => ({
          id: t.id as string,
          type: t.type as string,
          category: t.category as string,
          description: t.description as string,
          amount: t.amount as number,
          date: t.date ? new Date(t.date as string).toISOString() : new Date().toISOString(),
          invoice_id: (t.invoiceId as string) || null,
        }));
        await supabase.from('transactions').insert(transactionsToInsert);
      }

      // Update settings
      if (data.settings) {
        const s = data.settings;
        await supabase.from('shop_settings').update({
          shop_name: s.shopName,
          shop_address: s.shopAddress,
          shop_phone: s.shopPhone,
          shop_tax_id: s.shopTaxId,
          shop_logo: s.shopLogo || null,
          default_price_per_sqm: s.defaultPricePerSqm,
          product_pricing: s.productPricing as Json,
          receipt_header: s.receiptHeader || null,
          receipt_footer: s.receiptFooter || null,
        }).neq('id', '00000000-0000-0000-0000-000000000000');
      }

      toast.success('กู้คืนข้อมูลเรียบร้อย');
      refetch();
    } catch (err) {
      console.error('Error restoring data:', err);
      toast.error('ไม่สามารถกู้คืนข้อมูลได้');
    }

    setIsRestoring(false);
    setPendingRestore(null);
    setShowRestoreDialog(false);
  };

  const handleSync = async () => {
    setIsSyncing(true);
    await refetch();
    setIsSyncing(false);
    toast.success('ซิงค์ข้อมูลเรียบร้อย');
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5 text-primary" />
            ข้อมูลออนไลน์
          </CardTitle>
          <CardDescription>
            ข้อมูลถูกเก็บบนฐานข้อมูลออนไลน์ สามารถเข้าถึงได้จากทุกอุปกรณ์
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
            <Cloud className="h-5 w-5 text-green-600" />
            <span className="text-sm text-green-700 dark:text-green-300">
              ข้อมูลซิงค์อัตโนมัติแบบเรียลไทม์ทุกอุปกรณ์
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <h4 className="font-medium">ซิงค์ข้อมูล</h4>
              <p className="text-sm text-muted-foreground">
                โหลดข้อมูลล่าสุดจากฐานข้อมูลออนไลน์
              </p>
              <Button onClick={handleSync} className="w-full" variant="outline" disabled={isSyncing || loading}>
                <RefreshCw className={`h-4 w-4 ${isSyncing || loading ? 'animate-spin' : ''}`} />
                {isSyncing || loading ? 'กำลังซิงค์...' : 'ซิงค์ข้อมูล'}
              </Button>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium">สำรองข้อมูล</h4>
              <p className="text-sm text-muted-foreground">
                ดาวน์โหลดไฟล์สำรองข้อมูลทั้งหมด
              </p>
              <Button onClick={handleExport} className="w-full">
                <Download className="h-4 w-4" />
                ดาวน์โหลดไฟล์สำรอง
              </Button>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium">กู้คืนข้อมูล</h4>
              <p className="text-sm text-muted-foreground">
                อัพโหลดไฟล์สำรองเพื่อกู้คืนข้อมูล
              </p>
              <Button variant="outline" className="w-full" asChild>
                <label className="cursor-pointer">
                  <Upload className="h-4 w-4" />
                  อัพโหลดไฟล์สำรอง
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImport}
                    className="hidden"
                  />
                </label>
              </Button>
            </div>
          </div>

          <div className="bg-muted p-4 rounded-lg">
            <h4 className="font-medium mb-2 flex items-center gap-2">
              <Database className="h-4 w-4" />
              สรุปข้อมูลในระบบ
            </h4>
            <div className="grid gap-2 text-sm sm:grid-cols-3">
              <div>ลูกค้า: {customers.length} รายการ</div>
              <div>ใบเสร็จไวนิล: {invoices.length} รายการ</div>
              <div>ใบเสร็จตรายาง: {rubberStampOrders.length} รายการ</div>
              <div>พนักงาน: {employees.length} คน</div>
              <div>ธุรกรรม: {transactions.length} รายการ</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              ยืนยันการกู้คืนข้อมูล
            </AlertDialogTitle>
            <AlertDialogDescription>
              การกู้คืนข้อมูลจะแทนที่ข้อมูลเดิมทั้งหมดบนฐานข้อมูลออนไลน์ ข้อมูลปัจจุบันจะหายไป
              คุณแน่ใจหรือไม่?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRestoring}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmRestore} 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isRestoring}
            >
              {isRestoring ? 'กำลังกู้คืน...' : 'ยืนยันกู้คืน'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

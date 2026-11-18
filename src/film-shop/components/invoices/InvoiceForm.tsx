import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAppData } from '@/film-shop/hooks/useAppData';

import { Invoice, VinylItem, InvoiceAttachment } from '@/film-shop/types';
import { ArrowLeft, Save, Plus, Trash2, UserPlus, RefreshCw, CalendarIcon, Paperclip, Eye, X, Loader2, Search, Printer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AttachmentInput } from '@/film-shop/components/scanner/AttachmentInput';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { supabase } from '@/film-shop/lib/supabase';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { filmItemTotal, autoLineTotal, lineAreaSqm, resolveLineTotal, type FilmLengthUnit } from '@/film-shop/lib/filmItemPricing';

import { useProductCategories } from '@/film-shop/hooks/useProductCategories';
import { useSystemCustomers } from '@/film-shop/hooks/useSystemCustomers';

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

interface InvoiceFormInitialData {
  type?: Invoice['type'];
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  notes?: string;
  customerTaxId?: string;
  customerBranch?: string;
  customerId?: string;
  referenceDoc?: string;
  deposit?: number;
  discount?: number;
}

interface InvoiceFormProps {
  invoice?: Invoice | null;
  onClose: () => void;
  initialItems?: VinylItem[];
  initialData?: InvoiceFormInitialData;
  sourceJobRequestId?: string;
  onSaved?: (created: { id?: string; invoiceNumber: string; print?: boolean }) => void;
}

export function InvoiceForm({ invoice, onClose, initialItems, initialData, sourceJobRequestId, onSaved }: InvoiceFormProps) {
  const { customers, employees, settings, addInvoice, updateInvoice, generateInvoiceNumber } = useAppData();
  // Customer picker shows the whole system directory (this shop + other
  // shops + organizations), not only film_customers.
  const { customers: systemCustomers } = useSystemCustomers();
  const { categories: allCategories, enabledCategories } = useProductCategories();
  // For input/select use only enabled; for label rendering use all
  const categories = enabledCategories;
  
  const [type, setType] = useState<Invoice['type']>(invoice?.type || initialData?.type || 'invoice');
  const [customerId, setCustomerId] = useState(invoice?.customerId || initialData?.customerId || '');
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [customerName, setCustomerName] = useState(invoice?.customerName || initialData?.customerName || '');
  const [customerTaxId, setCustomerTaxId] = useState(invoice?.customerTaxId || initialData?.customerTaxId || '');
  const [customerBranch, setCustomerBranch] = useState(invoice?.customerBranch || initialData?.customerBranch || '');
  const [customerPhone, setCustomerPhone] = useState(invoice?.customerPhone || initialData?.customerPhone || '');
  const [customerAddress, setCustomerAddress] = useState(invoice?.customerAddress || initialData?.customerAddress || '');
  const [salesPerson, setSalesPerson] = useState(invoice?.salesPerson || '');
  const [referenceDoc, setReferenceDoc] = useState(invoice?.referenceDoc || initialData?.referenceDoc || '');
  const [notes, setNotes] = useState(invoice?.notes || initialData?.notes || '');
  const [headerText, setHeaderText] = useState(invoice?.headerText || '');
  const [items, setItems] = useState<VinylItem[]>(invoice?.items || initialItems || []);
  const [deposit, setDeposit] = useState<string>((invoice?.deposit ?? initialData?.deposit ?? 0).toString());
  const [discount, setDiscount] = useState<string>((invoice?.discount ?? initialData?.discount ?? 0).toString());
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'deposit' | 'credit' | 'paid'>(
    (() => {
      const s = invoice?.status;
      if (s === 'paid') return 'paid';
      if (s === 'credit') return 'credit';
      if (s === 'deposit' || s === 'partial') return 'deposit';
      return 'pending';
    })()
  );
  const [paymentMethod, setPaymentMethod] = useState<Invoice['paymentMethod']>(invoice?.paymentMethod || 'cash');
  const [documentDate, setDocumentDate] = useState<Date>(
    invoice?.documentDate ? new Date(invoice.documentDate) : new Date()
  );
  const [dueDate, setDueDate] = useState<Date | undefined>(
    invoice?.dueDate ? new Date(invoice.dueDate) : undefined
  );
  const [showDimensions, setShowDimensions] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState(invoice?.invoiceNumber || '');
  const [attachments, setAttachments] = useState<InvoiceAttachment[]>(invoice?.attachments || []);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  const uploadOne = async (file: File, invoiceId: string): Promise<InvoiceAttachment | null> => {
    const safeName = file.name.replace(/[^\w.\-]/g, '_');
    const path = `${invoiceId}/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage.from('invoice-attachments').upload(path, file, {
      contentType: file.type || undefined,
      upsert: false,
    });
    if (error) {
      toast.error(`อัปโหลด ${file.name} ไม่สำเร็จ: ${error.message}`);
      return null;
    }
    return { name: file.name, path, size: file.size, type: file.type || undefined };
  };

  const handleAddFiles = async (files: File[]) => {
    if (!files.length) return;
    if (!invoice?.id) {
      // creating new — queue files until invoice is saved
      setPendingFiles(prev => [...prev, ...files]);
      return;
    }
    setUploading(true);
    try {
      const uploaded: InvoiceAttachment[] = [];
      for (const f of files) {
        const meta = await uploadOne(f, invoice.id);
        if (meta) uploaded.push(meta);
      }
      if (uploaded.length) {
        const next = [...attachments, ...uploaded];
        setAttachments(next);
        await updateInvoice(invoice.id, { attachments: next });
        toast.success(`แนบไฟล์ ${uploaded.length} รายการแล้ว`);
      }
    } finally {
      setUploading(false);
    }
  };

  const handleViewAttachment = async (att: InvoiceAttachment) => {
    const { data, error } = await supabase.storage
      .from('invoice-attachments')
      .createSignedUrl(att.path, 3600);
    if (error || !data?.signedUrl) {
      toast.error('เปิดไฟล์ไม่สำเร็จ');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const handleRemoveAttachment = async (att: InvoiceAttachment) => {
    if (!confirm(`ลบไฟล์ "${att.name}" ?`)) return;
    await supabase.storage.from('invoice-attachments').remove([att.path]);
    const next = attachments.filter(a => a.path !== att.path);
    setAttachments(next);
    if (invoice?.id) await updateInvoice(invoice.id, { attachments: next });
    toast.success('ลบไฟล์แล้ว');
  };

  const handleRemovePending = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const fmtSize = (n?: number) => {
    if (!n) return '';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  };



  // New item form
  const [newItem, setNewItem] = useState({
    name: '',
    width: '',
    height: '',
    dimUnit: 'm' as FilmLengthUnit,
    pricePerPiece: '',
    pricePerSqm: settings.defaultPricePerSqm.toString(),
    quantity: '1',
    unit: 'ชิ้น',
    discount: '0',
    category: '',
  });

  const handleCustomerSelect = (id: string) => {
    const customer = systemCustomers.find(c => c.id === id);
    if (customer) {
      setCustomerId(id);
      setCustomerName(customer.name);
      setCustomerTaxId(customer.taxId || '');
      setCustomerBranch(customer.taxBranch || '');
      setCustomerPhone(customer.phone || '');
      setCustomerAddress(customer.address || '');
    }
  };

  const selectedSystemCustomer = systemCustomers.find(c => c.id === customerId);

  const handleAddItem = () => {
    if (!newItem.name) {
      toast.error('กรุณากรอกชื่อรายการ');
      return;
    }

    const width = parseFloat(newItem.width) || 0;
    const height = parseFloat(newItem.height) || 0;
    const pricePerPiece = parseFloat(newItem.pricePerPiece) || 0;
    const pricePerSqm = parseFloat(newItem.pricePerSqm) || 0;
    const quantity = parseInt(newItem.quantity) || 1;
    const itemDiscount = parseFloat(newItem.discount) || 0;

    // งานพื้นที่ = กว้าง(ม.) × ยาว(ม.) × จำนวน × ราคา/ตร.ม. · งานทั่วไป = ราคาต่อหน่วย × จำนวน
    const total = autoLineTotal({
      width, height, unit: newItem.dimUnit, quantity, pricePerPiece, pricePerSqm,
      discount: itemDiscount, areaMode: showDimensions,
    });

    const item: VinylItem = {
      id: crypto.randomUUID(),
      name: newItem.name,
      width,
      height,
      dimUnit: newItem.dimUnit,
      pricePerSqm,
      quantity,
      unit: newItem.unit,
      discount: itemDiscount,
      pricePerPiece,
      total: total > 0 ? total : 0,
      manualPrice: false,
      category: newItem.category || undefined,
    };

    setItems([...items, item]);
    setNewItem({
      name: '',
      width: '',
      height: '',
      dimUnit: newItem.dimUnit,
      pricePerPiece: '',
      pricePerSqm: settings.defaultPricePerSqm.toString(),
      quantity: '1',
      unit: 'ชิ้น',
      discount: '0',
      category: newItem.category, // keep last selection
    });
  };

  const handleRemoveItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
  };

  /**
   * แก้ไขรายการแบบทั่วไป: ถ้าไม่ได้เปิด "แก้ราคาเอง" จะคำนวณ total อัตโนมัติทับให้เสมอ
   * ถ้าเปิด manualPrice ไว้ ค่า total จะไม่ถูกคำนวณทับ (เว้นแต่ patch แก้ total ตรงๆ หรือแก้ manualPrice)
   */
  const updateItem = (id: string, patch: Partial<VinylItem>) => {
    setItems(items.map((i) => {
      if (i.id !== id) return i;
      const next: VinylItem = { ...i, ...patch };
      const manual = !!next.manualPrice;
      if (manual && patch.total === undefined) {
        // manual mode: กว้าง/ยาว/จำนวน/ราคาเปลี่ยนได้ แต่ total (ราคาสุดท้าย) ต้องคงเดิม
        return next;
      }
      const auto = autoLineTotal({
        width: next.width, height: next.height, unit: next.dimUnit,
        quantity: next.quantity, pricePerPiece: next.pricePerPiece, pricePerSqm: next.pricePerSqm,
        discount: next.discount, areaMode: showDimensions,
      });
      return manual ? next : { ...next, total: auto > 0 ? auto : 0 };
    }));
  };

  /** เปิด/ปิดโหมด "แก้ราคาเอง" ของแต่ละแถว โดยไม่ทำลายราคาปัจจุบัน */
  const toggleManualPrice = (item: VinylItem) => {
    updateItem(item.id, { manualPrice: !item.manualPrice });
  };

  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const discountAmount = parseFloat(discount) || 0;
  const depositAmount = parseFloat(deposit) || 0;
  const total = subtotal - discountAmount;
  // amountDue derived from status:
  // - paid    -> 0 (received in full)
  // - deposit -> total - deposit (remaining after partial payment)
  // - credit  -> total (recorded on account, full amount outstanding)
  // - pending -> total - deposit (no payment, deposit shown as informational)
  const amountDue = paymentStatus === 'paid'
    ? 0
    : paymentStatus === 'credit'
      ? total
      : Math.max(0, total - depositAmount);

  const handleSubmit = (printAfterSave = false) => {
    if (!customerName.trim()) {
      toast.error('กรุณาระบุชื่อลูกค้า');
      return;
    }
    if (items.length === 0) {
      toast.error('กรุณาเพิ่มรายการอย่างน้อย 1 รายการ');
      return;
    }

    const invoiceData: Omit<Invoice, 'id' | 'createdAt'> = {
      invoiceNumber: invoiceNumber.trim() || generateInvoiceNumber(type),
      type,
      customerId,
      customerName,
      customerTaxId,
      customerBranch: customerBranch || undefined,
      customerPhone,
      customerAddress,
      items,
      subtotal,
      deposit: depositAmount,
      discount: discountAmount,
      total,
      amountDue,
      status: paymentStatus,
      jobStatus: invoice?.jobStatus || 'pending',
      salesPerson,
      referenceDoc,
      notes,
      headerText: type === 'quotation' ? (headerText || undefined) : undefined,
      documentDate: documentDate || undefined,
      dueDate: dueDate || undefined,
      paymentMethod: paymentStatus === 'paid' || paymentStatus === 'deposit' ? paymentMethod : undefined,
      paidAt: paymentStatus === 'paid' ? new Date() : undefined,
      attachments,
    };

    (async () => {
      if (invoice) {
        await updateInvoice(invoice.id, invoiceData);
        toast.success('อัพเดทใบเสร็จเรียบร้อย');
        onSaved?.({ id: invoice.id, invoiceNumber: invoiceData.invoiceNumber, print: printAfterSave });
      } else {
        const created = await addInvoice({ ...invoiceData, sourceJobRequestId });
        // Upload any pending attachments now that the invoice has an id
        if (created?.id && pendingFiles.length) {
          const uploaded: InvoiceAttachment[] = [];
          for (const f of pendingFiles) {
            const meta = await uploadOne(f, created.id);
            if (meta) uploaded.push(meta);
          }
          if (uploaded.length) {
            await updateInvoice(created.id, { attachments: [...attachments, ...uploaded] });
          }
        }
        toast.success('สร้างใบเสร็จเรียบร้อย');
        onSaved?.({ id: created?.id, invoiceNumber: invoiceData.invoiceNumber, print: printAfterSave });
      }
      onClose();
    })();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={onClose}>
          <ArrowLeft className="h-4 w-4" />
          กลับ
        </Button>
        <h2 className="text-xl font-semibold">
          {invoice ? 'แก้ไขใบเสร็จ' : 'สร้างใบเสร็จใหม่'}
        </h2>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column - Customer & Items */}
        <div className="lg:col-span-2 space-y-6">
          {/* Document Type */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">ประเภทเอกสาร</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>เลขที่เอกสาร</Label>
                <div className="flex gap-2">
                  <Input
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder={generateInvoiceNumber(type)}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setInvoiceNumber(generateInvoiceNumber(type))}
                    title="สร้างเลขที่อัตโนมัติ"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  ปล่อยว่างเพื่อสร้างอัตโนมัติ
                </p>
              </div>

              <Select value={type} onValueChange={(v) => setType(v as Invoice['type'])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="invoice">ใบแจ้งหนี้</SelectItem>
                  <SelectItem value="receipt">ใบเสร็จรับเงิน</SelectItem>
                  <SelectItem value="job_order">ใบสั่งจ้าง</SelectItem>
                  <SelectItem value="quotation">ใบเสนอราคา</SelectItem>
                </SelectContent>
              </Select>
              
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>วันที่เอกสาร</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn("w-full justify-start text-left font-normal", !documentDate && "text-muted-foreground")}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {documentDate ? format(documentDate, 'dd/MM/yyyy', { locale: th }) : 'เลือกวันที่'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={documentDate}
                        onSelect={(d) => d && setDocumentDate(d)}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label>กำหนดส่งงาน</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn("w-full justify-start text-left font-normal", !dueDate && "text-muted-foreground")}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dueDate ? format(dueDate, 'dd/MM/yyyy', { locale: th }) : 'เลือกวันที่'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={dueDate}
                        onSelect={setDueDate}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Customer Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">ข้อมูลลูกค้า</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>เลือกจากรายชื่อลูกค้า</Label>
                <Popover open={customerPickerOpen} onOpenChange={setCustomerPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={customerPickerOpen}
                      className="w-full justify-between font-normal min-h-11"
                    >
                      <span className="truncate text-left">
                        {selectedSystemCustomer
                          ? `${selectedSystemCustomer.name}${selectedSystemCustomer.phone ? ` · ${selectedSystemCustomer.phone}` : ''}`
                          : customerName || 'ค้นหา/เลือกลูกค้า...'}
                      </span>
                      <Search className="ml-2 h-4 w-4 shrink-0 opacity-60" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[min(30rem,calc(100vw-2rem))] p-0"
                    align="start"
                  >
                    <Command
                      filter={(value, search) =>
                        value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
                      }
                    >
                      <CommandInput placeholder="พิมพ์ชื่อ หรือเบอร์โทร..." />
                      <CommandList className="max-h-[50vh]">
                        <CommandEmpty>ไม่พบลูกค้าที่ค้นหา</CommandEmpty>
                        <CommandGroup>
                          {systemCustomers.map(customer => (
                            <CommandItem
                              key={customer.id}
                              value={`${customer.name} ${customer.phone || ''} ${customer.address || ''}`}
                              onSelect={() => {
                                handleCustomerSelect(customer.id);
                                setCustomerPickerOpen(false);
                              }}
                              className="py-3"
                            >
                              <div className="min-w-0">
                                <div className="truncate font-medium">
                                  {customer.name}
                                  {customer.origin === 'org' ? ' (หน่วยงาน)' : customer.origin === 'shop' ? ' (ระบบร้าน)' : ''}
                                </div>
                                {(customer.phone || customer.address) && (
                                  <div className="truncate text-xs text-muted-foreground">
                                    {[customer.phone, customer.address].filter(Boolean).join(' · ')}
                                  </div>
                                )}
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>ชื่อลูกค้า *</Label>
                  <Input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="ชื่อลูกค้า"
                  />
                </div>
                <div>
                  <Label>เลขประจำตัวผู้เสียภาษี</Label>
                  <Input
                    value={customerTaxId}
                    onChange={(e) => setCustomerTaxId(e.target.value)}
                    placeholder="Tax No."
                  />
                </div>
              </div>

              <div>
                <Label>สาขา (ถ้ามี)</Label>
                <Input
                  value={customerBranch}
                  onChange={(e) => setCustomerBranch(e.target.value)}
                  placeholder="เช่น สำนักงานใหญ่ / 00001"
                  maxLength={40}
                />
              </div>

              <div>
                <Label>เบอร์โทรศัพท์</Label>
                <Input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="เบอร์โทรศัพท์"
                />
              </div>

              <div>
                <Label>ที่อยู่</Label>
                <Textarea
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  placeholder="ที่อยู่ลูกค้า"
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>

          {/* Items */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">รายการสินค้า</CardTitle>
              <div className="flex items-center gap-2">
                <Switch
                  id="showDimensions"
                  checked={showDimensions}
                  onCheckedChange={setShowDimensions}
                />
                <Label htmlFor="showDimensions" className="text-sm cursor-pointer">
                  แสดงช่องกว้าง-ยาว (คำนวณพื้นที่)
                </Label>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Add new item form */}
              <div className="rounded-lg border border-dashed border-border p-4 space-y-3">
                {categories.length > 0 && (
                  <div>
                    <Label>ประเภทสินค้า</Label>
                    <Select
                      value={newItem.category || '__none__'}
                      onValueChange={(v) => setNewItem({ ...newItem, category: v === '__none__' ? '' : v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="เลือกประเภท..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— ไม่ระบุ —</SelectItem>
                        {categories.map(cat => (
                          <SelectItem key={cat.key} value={cat.key}>{cat.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className={`grid gap-3 ${showDimensions ? 'sm:grid-cols-8' : 'sm:grid-cols-6'}`}>
                  <div className="sm:col-span-2">
                    <Label>ชื่อรายการ</Label>
                    <Input
                      value={newItem.name}
                      onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                      placeholder="ชื่อสินค้า/บริการ"
                    />
                  </div>
                  <div>
                    <Label>ราคาต่อหน่วย</Label>
                    <Input
                      type="number"
                      data-testid="item-price-per-piece"
                      value={newItem.pricePerPiece}
                      onChange={(e) => setNewItem({ ...newItem, pricePerPiece: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label>ราคา ตร.ม.</Label>
                    <Input
                      type="number"
                      data-testid="item-price-per-sqm"
                      value={newItem.pricePerSqm}
                      onChange={(e) => setNewItem({ ...newItem, pricePerSqm: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label>จำนวน</Label>
                    <Input
                      type="number"
                      min="1"
                      value={newItem.quantity}
                      onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>หน่วย</Label>
                    <Input
                      value={newItem.unit}
                      onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
                      placeholder="พิมพ์หน่วย"
                      list="unit-suggestions"
                    />
                    <datalist id="unit-suggestions">
                      <option value="ชิ้น" />
                      <option value="ตร.ม." />
                      <option value="เมตร" />
                      <option value="แผ่น" />
                      <option value="ใบ" />
                      <option value="ม้วน" />
                      <option value="ชุด" />
                      <option value="งาน" />
                      <option value="หน้า" />
                      <option value="ด้าม" />
                      <option value="ดวง" />
                      <option value="คู่" />
                      <option value="เล่ม" />
                      <option value="รูป" />
                      <option value="กล่อง" />
                    </datalist>
                  </div>
                  {showDimensions && (
                    <>
                      <div>
                        <Label>หน่วยกว้าง/ยาว</Label>
                        <Select
                          value={newItem.dimUnit}
                          onValueChange={(v) => setNewItem({ ...newItem, dimUnit: v as FilmLengthUnit })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="m">เมตร (ม.)</SelectItem>
                            <SelectItem value="cm">เซนติเมตร (ซม.)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>กว้าง ({newItem.dimUnit === 'cm' ? 'ซม.' : 'ม.'})</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={newItem.width}
                          onChange={(e) => setNewItem({ ...newItem, width: e.target.value })}
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <Label>ยาว ({newItem.dimUnit === 'cm' ? 'ซม.' : 'ม.'})</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={newItem.height}
                          onChange={(e) => setNewItem({ ...newItem, height: e.target.value })}
                          placeholder="0"
                        />
                      </div>
                    </>
                  )}
                </div>
                {showDimensions && newItem.width && newItem.height && (
                  <div className="text-sm text-muted-foreground">
                    พื้นที่: {lineAreaSqm({ width: parseFloat(newItem.width) || 0, height: parseFloat(newItem.height) || 0, unit: newItem.dimUnit }).toFixed(2)} ตร.ม.
                    {newItem.pricePerSqm && (
                      <span className="ml-2">
                        = {formatCurrency(autoLineTotal({
                          width: parseFloat(newItem.width) || 0,
                          height: parseFloat(newItem.height) || 0,
                          unit: newItem.dimUnit,
                          quantity: parseInt(newItem.quantity) || 1,
                          pricePerSqm: parseFloat(newItem.pricePerSqm) || 0,
                          areaMode: true,
                        }))} บาท
                      </span>
                    )}
                  </div>
                )}
                <Button onClick={handleAddItem} variant="outline" className="w-full">
                  <Plus className="h-4 w-4" />
                  เพิ่มรายการ
                </Button>
              </div>

              {/* Items table */}
              {items.length > 0 && (
                <div className="rounded-lg border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-table-header">
                        <TableHead className="text-center w-10">ลำดับ</TableHead>
                        <TableHead>รายการ</TableHead>
                        <TableHead className="text-center">ราคาต่อหน่วย</TableHead>
                        <TableHead className="text-center">ราคา/ตร.ม.</TableHead>
                        <TableHead className="text-center">จำนวน</TableHead>
                        <TableHead className="text-center">หน่วย</TableHead>
                        {showDimensions && <TableHead className="text-center">หน่วยวัด</TableHead>}
                        <TableHead className="text-center">กว้าง</TableHead>
                        <TableHead className="text-center">ยาว</TableHead>
                        {showDimensions && <TableHead className="text-center">พื้นที่ (ตร.ม.)</TableHead>}
                        <TableHead className="text-center">ส่วนลด</TableHead>
                        {showDimensions && <TableHead className="text-right">ราคาอัตโนมัติ</TableHead>}
                        <TableHead className="text-right">ราคาสุดท้าย</TableHead>
                        <TableHead className="text-center">แก้ราคา</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item, index) => (
                        <TableRow key={item.id} className={index % 2 === 1 ? 'bg-table-row-alt' : ''}>
                          <TableCell className="text-center text-sm">{index + 1}</TableCell>
                          <TableCell className="font-medium">
                            <div>{item.name}</div>
                            {categories.length > 0 && (
                              <Select
                                value={item.category || '__none__'}
                                onValueChange={(v) => {
                                  const cat = v === '__none__' ? undefined : v;
                                  setItems(items.map(i => i.id === item.id ? { ...i, category: cat } : i));
                                }}
                              >
                                <SelectTrigger className="h-6 mt-1 text-xs w-32">
                                  <SelectValue placeholder="ประเภท" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">— ไม่ระบุ —</SelectItem>
                                  {allCategories.map(c => (
                                    <SelectItem key={c.key} value={c.key}>{c.name}{c.enabled === false ? ' (ปิด)' : ''}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <Input
                              type="number"
                              className="w-20 text-center h-7 text-sm"
                              data-testid={`row-price-piece-${index}`}
                              value={item.pricePerPiece}
                              onChange={(e) => updateItem(item.id, { pricePerPiece: parseFloat(e.target.value) || 0 })}
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <Input
                              type="number"
                              className="w-20 text-center h-7 text-sm"
                              data-testid={`row-price-sqm-${index}`}
                              value={item.pricePerSqm}
                              onChange={(e) => updateItem(item.id, { pricePerSqm: parseFloat(e.target.value) || 0 })}
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <Input
                              type="number"
                              min="1"
                              className="w-14 text-center h-7 text-sm"
                              value={item.quantity}
                              onChange={(e) => updateItem(item.id, { quantity: parseInt(e.target.value) || 1 })}
                            />
                          </TableCell>
                          <TableCell className="text-center text-sm">
                            {item.unit || 'ชิ้น'}
                          </TableCell>
                          {showDimensions && (
                            <TableCell className="text-center">
                              <Select
                                value={item.dimUnit || 'm'}
                                onValueChange={(v) => updateItem(item.id, { dimUnit: v as FilmLengthUnit })}
                              >
                                <SelectTrigger className="h-7 w-16 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="m">ม.</SelectItem>
                                  <SelectItem value="cm">ซม.</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                          )}
                          <TableCell className="text-center">
                            <Input
                              type="number"
                              step="0.01"
                              className="w-16 text-center h-7 text-sm"
                              data-testid={`row-width-${index}`}
                              value={item.width || ''}
                              onChange={(e) => updateItem(item.id, { width: parseFloat(e.target.value) || 0 })}
                              placeholder="0"
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <Input
                              type="number"
                              step="0.01"
                              className="w-16 text-center h-7 text-sm"
                              data-testid={`row-height-${index}`}
                              value={item.height || ''}
                              onChange={(e) => updateItem(item.id, { height: parseFloat(e.target.value) || 0 })}
                              placeholder="0"
                            />
                          </TableCell>
                          {showDimensions && (
                            <TableCell className="text-center text-sm" data-testid={`row-area-${index}`}>
                              {lineAreaSqm({ width: item.width, height: item.height, unit: item.dimUnit }).toFixed(2)}
                            </TableCell>
                          )}
                          <TableCell className="text-center">
                            <Input
                              type="number"
                              className="w-16 text-center h-7 text-sm"
                              value={item.discount}
                              onChange={(e) => updateItem(item.id, { discount: parseFloat(e.target.value) || 0 })}
                            />
                          </TableCell>
                          {showDimensions && (
                            <TableCell className="text-right text-sm text-muted-foreground" data-testid={`row-auto-total-${index}`}>
                              {formatCurrency(autoLineTotal({
                                width: item.width, height: item.height, unit: item.dimUnit,
                                quantity: item.quantity, pricePerPiece: item.pricePerPiece, pricePerSqm: item.pricePerSqm,
                                discount: item.discount, areaMode: showDimensions,
                              }))}
                            </TableCell>
                          )}
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              className="w-24 text-right h-7 text-sm font-semibold"
                              data-testid={`row-total-${index}`}
                              value={item.total}
                              readOnly={!item.manualPrice}
                              disabled={!item.manualPrice}
                              onChange={(e) => {
                                if (!item.manualPrice) return;
                                const newTotal = parseFloat(e.target.value) || 0;
                                updateItem(item.id, { total: newTotal });
                              }}
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              type="button"
                              variant={item.manualPrice ? 'default' : 'outline'}
                              size="sm"
                              className="h-7 text-xs whitespace-nowrap"
                              data-testid={`row-toggle-manual-${index}`}
                              onClick={() => toggleManualPrice(item)}
                            >
                              {item.manualPrice ? 'กลับเป็นราคาอัตโนมัติ' : 'แก้ราคาเอง'}
                            </Button>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => handleRemoveItem(item.id)}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Summary */}
        <div className="space-y-6">
          {/* Sales Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">ข้อมูลเพิ่มเติม</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>พนักงานขาย</Label>
                <Select value={salesPerson} onValueChange={setSalesPerson}>
                  <SelectTrigger>
                    <SelectValue placeholder="เลือกพนักงาน..." />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map(emp => (
                      <SelectItem key={emp.id} value={emp.name}>
                        {emp.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>เอกสารอ้างอิง</Label>
                <Input
                  value={referenceDoc}
                  onChange={(e) => setReferenceDoc(e.target.value)}
                  placeholder="เลขที่เอกสารอ้างอิง"
                />
              </div>

              <div>
                <Label>หมายเหตุ</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="หมายเหตุเพิ่มเติม"
                  rows={3}
                />
              </div>

              {type === 'quotation' && (
                <div>
                  <Label>ข้อความบนหัวบิล (เฉพาะใบนี้)</Label>
                  <Textarea
                    value={headerText}
                    onChange={(e) => setHeaderText(e.target.value)}
                    placeholder="เว้นว่าง = ใช้ข้อความเริ่มต้นจากการตั้งค่า"
                    rows={2}
                  />
                  <p className="text-xs text-muted-foreground mt-1">แสดงเหนือตารางในใบเสนอราคา (override default)</p>
                </div>
              )}

              <div>
                <Label className="flex items-center gap-2">
                  <Paperclip className="h-4 w-4" />
                  ไฟล์แนบ {uploading && <Loader2 className="h-3 w-3 animate-spin" />}
                </Label>
                <div className="mt-2 space-y-2">
                  <AttachmentInput
                    onFiles={handleAddFiles}
                    accept="image/*,.pdf"
                    multiple
                    scanFileBaseName={invoiceNumber || 'attachment'}
                  />
                  {(attachments.length > 0 || pendingFiles.length > 0) && (
                    <div className="space-y-1 border rounded-md p-2 bg-muted/30">
                      {attachments.map((a) => (
                        <div key={a.path} className="flex items-center gap-2 text-sm">
                          <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="flex-1 truncate">{a.name}</span>
                          <span className="text-xs text-muted-foreground shrink-0">{fmtSize(a.size)}</span>
                          <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleViewAttachment(a)} title="ดูไฟล์">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => handleRemoveAttachment(a)} title="ลบไฟล์">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                      {pendingFiles.map((f, i) => (
                        <div key={`pending-${i}`} className="flex items-center gap-2 text-sm">
                          <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="flex-1 truncate">{f.name}</span>
                          <span className="text-xs text-warning shrink-0">รออัปโหลด · {fmtSize(f.size)}</span>
                          <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => handleRemovePending(i)} title="ยกเลิก">
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  {!invoice?.id && pendingFiles.length > 0 && (
                    <p className="text-xs text-muted-foreground">ไฟล์จะถูกอัปโหลดเมื่อบันทึกเอกสารแล้ว</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payment Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">สรุปยอด</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">รวมเป็นเงิน</span>
                  <span className="font-medium">{formatCurrency(subtotal)}</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">วางมัดจำ</span>
                  <Input
                    type="number"
                    className="w-28 text-right"
                    value={deposit}
                    onChange={(e) => setDeposit(e.target.value)}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">ส่วนลด</span>
                  <Input
                    type="number"
                    className="w-28 text-right"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                  />
                </div>

                <div className="flex justify-between border-t border-border pt-2">
                  <span className="font-medium">รวมสุทธิ</span>
                  <span className="text-xl font-bold text-primary">{formatCurrency(total)}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-muted-foreground">คงค้างต้องชำระ</span>
                  <span className="font-semibold text-warning">{formatCurrency(amountDue)}</span>
                </div>
              </div>

              <div className="border-t border-border pt-4 space-y-3">
                <div>
                  <Label>สถานะการชำระเงิน</Label>
                  <Select value={paymentStatus} onValueChange={(v) => setPaymentStatus(v as any)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">ยังไม่จ่าย</SelectItem>
                      <SelectItem value="deposit">มัดจำ (จ่ายบางส่วน)</SelectItem>
                      <SelectItem value="credit">ลงบัญชี (เครดิต)</SelectItem>
                      <SelectItem value="paid">จ่ายแล้ว</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    {paymentStatus === 'paid' && 'จะลงรายรับเต็มจำนวนอัตโนมัติ'}
                    {paymentStatus === 'deposit' && 'จะลงรายรับเฉพาะยอดมัดจำที่กรอกไว้'}
                    {paymentStatus === 'credit' && 'บันทึกเป็นลูกหนี้ ไม่ลงรายรับ'}
                    {paymentStatus === 'pending' && 'ยังไม่ลงรายรับ จนกว่าจะเปลี่ยนสถานะ'}
                  </p>
                </div>

                {(paymentStatus === 'paid' || paymentStatus === 'deposit') && (
                  <div>
                    <Label>วิธีการรับชำระ</Label>
                    <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as Invoice['paymentMethod'])}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">เงินสด (Cash)</SelectItem>
                        <SelectItem value="transfer">โอนเงิน</SelectItem>
                        <SelectItem value="credit">บัตรเครดิต</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Button
                  onClick={() => handleSubmit(false)}
                  className="w-full"
                  size="lg"
                  data-testid="invoice-save"
                >
                  <Save className="h-4 w-4" />
                  {invoice ? 'บันทึกการแก้ไข' : 'บันทึกข้อมูล'}
                </Button>
                <Button
                  onClick={() => handleSubmit(true)}
                  className="w-full"
                  size="lg"
                  variant="outline"
                  data-testid="invoice-save-print"
                >
                  <Printer className="h-4 w-4" />
                  บันทึกและพิมพ์ใบเสร็จ
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

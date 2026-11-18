import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAppData } from '@/film-shop/hooks/useAppData';
import { Customer } from '@/film-shop/types';
import { Users, Plus, Search, Edit2, Trash2, X, Save, Store, School } from 'lucide-react';
import { RefreshCw, Loader2 } from 'lucide-react';
import { supabase } from '@/film-shop/lib/supabase';
import { supabase as rawSupabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { CustomerProfileSheet, type ProfileTarget } from './CustomerProfileSheet';

export function CustomerManager() {
  const { customers, addCustomer, updateCustomer, deleteCustomer } = useAppData();
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [profileTarget, setProfileTarget] = useState<ProfileTarget | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  // Cross-shop directory: rows from public.v_unified_customers whose source
  // is NOT film_customers. These are read-only in this UI (they belong to
  // the other shop) but appear in the same list so staff can see the full
  // customer directory across both stores.
  type UnifiedRow = {
    source: string; source_id: string; name: string;
    phone: string | null; email: string | null; address: string | null;
    line_display_name: string | null; line_user_id: string | null;
  };
  type OrganizationRow = {
    id: string;
    name: string;
    type: string | null;
    contact_name: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    approved: boolean | null;
    slug: string | null;
    price_groups?: { name: string | null; markup_percent: number | null } | null;
  };
  const [otherShopCustomers, setOtherShopCustomers] = useState<UnifiedRow[]>([]);
  const [organizations, setOrganizations] = useState<OrganizationRow[]>([]);

  const loadUnified = useCallback(async () => {
    const [unifiedRes, orgRes] = await Promise.all([
      (rawSupabase as any)
      .from('v_unified_customers')
      .select('source, source_id, name, phone, email, address, line_display_name, line_user_id')
      .neq('source', 'film')
      .order('name'),
      (rawSupabase as any)
        .from('organizations')
        .select('id, name, type, contact_name, phone, email, address, approved, slug, price_groups(name, markup_percent)')
        .is('deleted_at', null)
        .order('name'),
    ]);
    setOtherShopCustomers((unifiedRes.data as UnifiedRow[]) ?? []);
    setOrganizations((orgRes.data as OrganizationRow[]) ?? []);
  }, []);

  useEffect(() => {
    loadUnified();
    const onRefresh = () => loadUnified();
    window.addEventListener('unified-customers:refresh', onRefresh);
    return () => window.removeEventListener('unified-customers:refresh', onRefresh);
  }, [loadUnified]);
  
  const [formData, setFormData] = useState({
    name: '',
    taxId: '',
    taxBranch: '',
    phone: '',
    address: '',
  });
  const [backfillBusy, setBackfillBusy] = useState(false);

  const term = searchTerm.trim().toLowerCase();
  const filteredCustomers = customers.filter(customer =>
    customer.name.toLowerCase().includes(term) ||
    customer.phone?.includes(searchTerm) ||
    customer.taxId?.includes(searchTerm)
  );
  // Deduplicate rows from other shops that already exist in film_customers
  // by phone match, so we don't show the same customer twice.
  const filmPhones = new Set(customers.map(c => (c.phone || '').replace(/\D/g, '')).filter(Boolean));
  const filteredOtherShop = otherShopCustomers.filter(u => {
    if (u.phone && filmPhones.has(u.phone.replace(/\D/g, ''))) return false;
    if (!term) return true;
    return (u.name || '').toLowerCase().includes(term)
        || (u.phone || '').includes(searchTerm)
        || (u.line_display_name || '').toLowerCase().includes(term);
  });
  const filteredOrganizations = organizations.filter((org) => {
    if (org.phone && filmPhones.has(org.phone.replace(/\D/g, ''))) return false;
    if (!term) return true;
    return (org.name || '').toLowerCase().includes(term)
      || (org.contact_name || '').toLowerCase().includes(term)
      || (org.phone || '').includes(searchTerm)
      || (org.slug || '').toLowerCase().includes(term)
      || (org.price_groups?.name || '').toLowerCase().includes(term);
  });
  const hasAnyCustomer = filteredCustomers.length > 0 || filteredOtherShop.length > 0 || filteredOrganizations.length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast.error('กรุณาระบุชื่อลูกค้า');
      return;
    }

    if (editingCustomer) {
      updateCustomer(editingCustomer.id, formData);
      toast.success('อัพเดทข้อมูลลูกค้าเรียบร้อย');
    } else {
      addCustomer(formData);
      toast.success('เพิ่มลูกค้าใหม่เรียบร้อย');
    }

    handleCloseDialog();
  };

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name,
      taxId: customer.taxId || '',
      taxBranch: customer.taxBranch || '',
      phone: customer.phone || '',
      address: customer.address || '',
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('ต้องการลบลูกค้านี้หรือไม่?')) {
      deleteCustomer(id);
      toast.success('ลบลูกค้าเรียบร้อย');
    }
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingCustomer(null);
    setFormData({ name: '', taxId: '', taxBranch: '', phone: '', address: '' });
  };

  const runBackfill = async () => {
    setBackfillBusy(true);
    try {
      const { data, error } = await (supabase as any).rpc('admin_backfill_customer_tax_ids');
      if (error) throw error;
      const row: any = Array.isArray(data) ? data[0] : data;
      const total =
        Number(row?.guest_orders_filled || 0) +
        Number(row?.orders_filled || 0) +
        Number(row?.film_invoices_filled || 0);
      toast.success(`Backfill สำเร็จ — อัพเดต ${total} ใบ`);
    } catch (e: any) {
      toast.error(e?.message || 'รัน backfill ไม่สำเร็จ');
    } finally {
      setBackfillBusy(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              จัดการข้อมูลลูกค้า
            </CardTitle>
            
            <div className="flex gap-2">
              <Button variant="outline" onClick={runBackfill} disabled={backfillBusy}>
                {backfillBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Backfill ใบเก่า
              </Button>
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="ค้นหาลูกค้า..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => { setEditingCustomer(null); setFormData({ name: '', taxId: '', taxBranch: '', phone: '', address: '' }); }}>
                    <Plus className="h-4 w-4" />
                    เพิ่มลูกค้า
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      {editingCustomer ? 'แก้ไขข้อมูลลูกค้า' : 'เพิ่มลูกค้าใหม่'}
                    </DialogTitle>
                  </DialogHeader>
                  
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <Label htmlFor="name">ชื่อลูกค้า *</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="ชื่อลูกค้า หรือ บริษัท"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="taxId">เลขประจำตัวผู้เสียภาษี</Label>
                      <Input
                        id="taxId"
                        value={formData.taxId}
                        onChange={(e) => setFormData({ ...formData, taxId: e.target.value })}
                        placeholder="1234567890123"
                      />
                    </div>
                    <div>
                      <Label htmlFor="taxBranch">สาขา (ถ้ามี)</Label>
                      <Input
                        id="taxBranch"
                        value={formData.taxBranch}
                        onChange={(e) => setFormData({ ...formData, taxBranch: e.target.value })}
                        placeholder="เช่น สำนักงานใหญ่ / 00001"
                        maxLength={40}
                      />
                    </div>

                    <div>
                      <Label htmlFor="phone">เบอร์โทรศัพท์</Label>
                      <Input
                        id="phone"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        placeholder="0xx-xxx-xxxx"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="address">ที่อยู่</Label>
                      <Textarea
                        id="address"
                        value={formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        placeholder="ที่อยู่ลูกค้า"
                        rows={3}
                      />
                    </div>
                    
                    <div className="flex gap-2 justify-end">
                      <Button type="button" variant="outline" onClick={handleCloseDialog}>
                        <X className="h-4 w-4" />
                        ยกเลิก
                      </Button>
                      <Button type="submit">
                        <Save className="h-4 w-4" />
                        {editingCustomer ? 'บันทึก' : 'เพิ่มลูกค้า'}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!hasAnyCustomer ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mb-4 opacity-50" />
              <p>{searchTerm ? 'ไม่พบลูกค้า/โรงเรียน/หน่วยงานที่ค้นหา' : 'ยังไม่มีข้อมูลลูกค้า'}</p>
              <p className="text-sm">คลิก "เพิ่มลูกค้า" เพื่อเริ่มต้น</p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-table-header">
                      <TableHead>ชื่อลูกค้า</TableHead>
                      <TableHead>เลขประจำตัวผู้เสียภาษี</TableHead>
                      <TableHead>เบอร์โทรศัพท์</TableHead>
                      <TableHead>ที่อยู่</TableHead>
                      <TableHead className="w-24 text-center">จัดการ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCustomers.map((customer, index) => (
                      <TableRow key={customer.id} className={index % 2 === 1 ? 'bg-table-row-alt' : ''}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="text-left font-medium text-primary underline-offset-2 hover:underline"
                        onClick={() => setProfileTarget({
                          id: customer.id, name: customer.name, phone: customer.phone,
                          address: customer.address, taxId: customer.taxId, taxBranch: customer.taxBranch,
                          badge: 'Film Shop',
                        })}
                      >
                        {customer.name}
                      </button>
                      <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">Film Shop</Badge>
                    </div>
                  </TableCell>
                        <TableCell>{customer.taxId || '-'}</TableCell>
                        <TableCell>{customer.phone || '-'}</TableCell>
                        <TableCell className="max-w-xs truncate">{customer.address || '-'}</TableCell>
                        <TableCell>
                          <div className="flex gap-1 justify-center">
                            <Button variant="ghost" size="icon-sm" onClick={() => handleEdit(customer)}><Edit2 className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(customer.id)} className="text-destructive hover:text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
              {filteredOtherShop.map((u, idx) => (
                <TableRow key={`${u.source}-${u.source_id}`} className={(filteredCustomers.length + idx) % 2 === 1 ? 'bg-table-row-alt' : ''}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="text-left font-medium text-primary underline-offset-2 hover:underline"
                        onClick={() => setProfileTarget({
                          id: null, name: u.name, phone: u.phone, address: u.address,
                          badge: 'นัฐภรณ์ เชียงกลาง', readOnly: true,
                        })}
                      >
                        {u.name}
                      </button>
                      <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-700">
                        <Store className="h-3 w-3 mr-0.5" />
                        นัฐภรณ์ เชียงกลาง
                      </Badge>
                      {u.line_display_name && (
                        <Badge variant="outline" className="text-[10px] border-emerald-500/50 text-emerald-700">LINE</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">-</TableCell>
                  <TableCell>{u.phone || '-'}</TableCell>
                  <TableCell className="max-w-xs truncate">{u.address || '-'}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-center text-xs text-muted-foreground">
                      อ่านอย่างเดียว
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredOrganizations.map((org, idx) => (
                <TableRow key={`org-${org.id}`} className={(filteredCustomers.length + filteredOtherShop.length + idx) % 2 === 1 ? 'bg-table-row-alt' : ''}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span>{org.name}</span>
                      <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">
                        <School className="h-3 w-3 mr-0.5" /> โรงเรียน/หน่วยงาน
                      </Badge>
                      <Badge variant={org.approved ? 'default' : 'outline'} className="text-[10px]">
                        {org.approved ? 'อนุมัติแล้ว' : 'รออนุมัติ'}
                      </Badge>
                    </div>
                    {org.contact_name && <div className="text-xs text-muted-foreground mt-0.5">ผู้ติดต่อ: {org.contact_name}</div>}
                  </TableCell>
                  <TableCell>
                    <div>{org.price_groups?.name || '-'}</div>
                    {org.price_groups?.markup_percent != null && (
                      <div className="text-xs text-muted-foreground">ส่วนเพิ่ม {Number(org.price_groups.markup_percent)}%</div>
                    )}
                  </TableCell>
                  <TableCell>{org.phone || '-'}</TableCell>
                  <TableCell className="max-w-xs truncate">{org.address || org.email || '-'}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-center text-xs text-muted-foreground">
                      ฐานโรงเรียน
                    </div>
                  </TableCell>
                </TableRow>
              ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Card List */}
              <div className="md:hidden space-y-3">
                {filteredCustomers.map((customer) => (
                  <div key={customer.id} className="rounded-lg border p-3 space-y-1">
                    <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        className="text-sm font-semibold text-primary underline-offset-2 hover:underline"
                        onClick={() => setProfileTarget({
                          id: customer.id, name: customer.name, phone: customer.phone,
                          address: customer.address, taxId: customer.taxId, taxBranch: customer.taxBranch,
                          badge: 'Film Shop',
                        })}
                      >
                        {customer.name}
                      </button>
                      <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">Film Shop</Badge>
                    </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon-sm" onClick={() => handleEdit(customer)}><Edit2 className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(customer.id)} className="text-destructive hover:text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </div>
                    {customer.phone && <p className="text-sm text-muted-foreground">📞 {customer.phone}</p>}
                    {customer.taxId && (
                      <p className="text-sm text-muted-foreground">
                        🏢 {customer.taxId}{customer.taxBranch ? ` (${customer.taxBranch})` : ''}
                      </p>
                    )}
                    {customer.address && <p className="text-sm text-muted-foreground line-clamp-2">📍 {customer.address}</p>}
                  </div>
                ))}
              {filteredOtherShop.map((u) => (
                <div key={`m-${u.source}-${u.source_id}`} className="rounded-lg border border-dashed p-3 space-y-1 bg-muted/30">
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <span className="font-semibold text-sm">{u.name}</span>
                    <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-700">
                      <Store className="h-3 w-3 mr-0.5" /> นัฐภรณ์ เชียงกลาง
                    </Badge>
                  </div>
                  {u.phone && <p className="text-sm text-muted-foreground">📞 {u.phone}</p>}
                  {u.line_display_name && (
                    <p className="text-sm text-emerald-700">🟢 LINE: {u.line_display_name}</p>
                  )}
                  {u.address && <p className="text-sm text-muted-foreground line-clamp-2">📍 {u.address}</p>}
                </div>
              ))}
              {filteredOrganizations.map((org) => (
                <div key={`m-org-${org.id}`} className="rounded-lg border border-primary/30 p-3 space-y-1 bg-accent/20">
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <span className="font-semibold text-sm">{org.name}</span>
                    <div className="flex gap-1 flex-wrap">
                      <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">
                        <School className="h-3 w-3 mr-0.5" /> โรงเรียน/หน่วยงาน
                      </Badge>
                      <Badge variant={org.approved ? 'default' : 'outline'} className="text-[10px]">
                        {org.approved ? 'อนุมัติแล้ว' : 'รออนุมัติ'}
                      </Badge>
                    </div>
                  </div>
                  {org.price_groups?.name && <p className="text-sm text-muted-foreground">กลุ่มราคา: {org.price_groups.name} ({Number(org.price_groups.markup_percent || 0)}%)</p>}
                  {org.contact_name && <p className="text-sm text-muted-foreground">ผู้ติดต่อ: {org.contact_name}</p>}
                  {org.phone && <p className="text-sm text-muted-foreground">📞 {org.phone}</p>}
                  {org.address && <p className="text-sm text-muted-foreground line-clamp-2">📍 {org.address}</p>}
                </div>
              ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <CustomerProfileSheet
        target={profileTarget}
        onOpenChange={(open) => { if (!open) setProfileTarget(null); }}
        onEdit={() => {
          const c = customers.find((x) => x.id === profileTarget?.id);
          setProfileTarget(null);
          if (c) handleEdit(c);
        }}
      />
    </div>
  );
}

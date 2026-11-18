import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/film-shop/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useAppData } from '@/film-shop/hooks/useAppData';
import { FileStack, Plus, Trash2, Pencil, Printer, CalendarIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as DatePicker } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { printPaperWithdrawalReport } from '@/film-shop/utils/dailyListPrint';
import { toast } from 'sonner';

interface PaperWithdrawal {
  id: string;
  paper_type: string;
  quantity: number;
  unit: string;
  withdrawn_by: string;
  purpose: string | null;
  note: string | null;
  withdrawn_at: string;
  created_at: string;
}

const paperTypes = ['A4', 'A3', 'A5', 'Photo', 'Sticker', 'Card', 'อื่นๆ'];
const units = ['แผ่น', 'รีม', 'ม้วน', 'ห่อ'];

export function PaperWithdrawalManager() {
  const { employees, settings } = useAppData();
  const today = new Date();
  const [printFrom, setPrintFrom] = useState<Date>(today);
  const [printTo, setPrintTo] = useState<Date>(today);
  const [list, setList] = useState<PaperWithdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    paper_type: 'A4',
    quantity: '1',
    unit: 'แผ่น',
    withdrawn_by: '',
    purpose: '',
    note: '',
  });
  const [editing, setEditing] = useState<PaperWithdrawal | null>(null);
  const [editForm, setEditForm] = useState({
    paper_type: 'A4', quantity: '1', unit: 'แผ่น', withdrawn_by: '', purpose: '', note: '',
  });

  const openEdit = (w: PaperWithdrawal) => {
    setEditing(w);
    setEditForm({
      paper_type: w.paper_type,
      quantity: String(w.quantity),
      unit: w.unit,
      withdrawn_by: w.withdrawn_by,
      purpose: w.purpose || '',
      note: w.note || '',
    });
  };

  const handleUpdate = async () => {
    if (!editing) return;
    const qty = parseFloat(editForm.quantity);
    if (!qty || qty <= 0) { toast.error('จำนวนต้องมากกว่า 0'); return; }
    if (!editForm.withdrawn_by.trim()) { toast.error('กรุณาระบุผู้เบิก'); return; }
    const { error } = await supabase.from('paper_withdrawals').update({
      paper_type: editForm.paper_type,
      quantity: qty,
      unit: editForm.unit,
      withdrawn_by: editForm.withdrawn_by,
      purpose: editForm.purpose || null,
      note: editForm.note || null,
    }).eq('id', editing.id);
    if (error) { toast.error('แก้ไขไม่สำเร็จ'); }
    else { toast.success('แก้ไขเรียบร้อย'); setEditing(null); }
  };

  const fetchList = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('paper_withdrawals')
      .select('*')
      .order('withdrawn_at', { ascending: false });
    if (error) {
      console.error(error);
      toast.error('ไม่สามารถโหลดข้อมูลได้');
    } else {
      setList((data as PaperWithdrawal[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchList();
    const ch = supabase.channel('paper-withdrawals-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'paper_withdrawals' }, () => fetchList())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchList]);

  const handleSubmit = async () => {
    if (!form.withdrawn_by.trim()) {
      toast.error('กรุณาระบุผู้เบิก');
      return;
    }
    const qty = parseFloat(form.quantity);
    if (!qty || qty <= 0) {
      toast.error('จำนวนต้องมากกว่า 0');
      return;
    }
    const { error } = await supabase.from('paper_withdrawals').insert({
      paper_type: form.paper_type,
      quantity: qty,
      unit: form.unit,
      withdrawn_by: form.withdrawn_by,
      purpose: form.purpose || null,
      note: form.note || null,
    });
    if (error) {
      console.error(error);
      toast.error('บันทึกไม่สำเร็จ');
    } else {
      toast.success('บันทึกการเบิกกระดาษเรียบร้อย');
      setForm({ ...form, quantity: '1', purpose: '', note: '' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('ลบรายการนี้?')) return;
    const { error } = await supabase.from('paper_withdrawals').delete().eq('id', id);
    if (error) toast.error('ลบไม่สำเร็จ'); else toast.success('ลบเรียบร้อย');
  };

  // Monthly summary
  const now = new Date();
  const thisMonth = list.filter(w => {
    const d = new Date(w.withdrawn_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const monthlyByType = thisMonth.reduce<Record<string, number>>((acc, w) => {
    acc[w.paper_type] = (acc[w.paper_type] || 0) + Number(w.quantity);
    return acc;
  }, {});

  return (
    <div className="space-y-6 animate-fade-in">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileStack className="h-5 w-5 text-primary" />
            บันทึกการเบิกกระดาษ
          </CardTitle>
          <CardDescription>บันทึกการเบิกใช้กระดาษและวัสดุต่างๆ</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label>ชนิดกระดาษ</Label>
              <Select value={form.paper_type} onValueChange={(v) => setForm({ ...form, paper_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {paperTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>จำนวน</Label>
              <Input
                type="number"
                min="0"
                step="any"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              />
            </div>
            <div>
              <Label>หน่วย</Label>
              <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {units.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>ผู้เบิก</Label>
              {employees.length > 0 ? (
                <Select value={form.withdrawn_by} onValueChange={(v) => setForm({ ...form, withdrawn_by: v })}>
                  <SelectTrigger><SelectValue placeholder="เลือกพนักงาน" /></SelectTrigger>
                  <SelectContent>
                    {employees.filter(e => e.isActive).map(e => (
                      <SelectItem key={e.id} value={e.name}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={form.withdrawn_by}
                  onChange={(e) => setForm({ ...form, withdrawn_by: e.target.value })}
                  placeholder="ชื่อผู้เบิก"
                />
              )}
            </div>
            <div className="md:col-span-2">
              <Label>วัตถุประสงค์</Label>
              <Input
                value={form.purpose}
                onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                placeholder="เช่น พิมพ์งานลูกค้า ABC"
              />
            </div>
          </div>
          <div>
            <Label>หมายเหตุ</Label>
            <Textarea
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              rows={2}
            />
          </div>
          <Button onClick={handleSubmit} className="w-full md:w-auto">
            <Plus className="h-4 w-4" />
            บันทึกการเบิก
          </Button>
        </CardContent>
      </Card>

      {/* Monthly summary */}
      <Card>
        <CardHeader>
          <CardTitle>สรุปการเบิกเดือนนี้</CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(monthlyByType).length === 0 ? (
            <p className="text-muted-foreground">ยังไม่มีการเบิกในเดือนนี้</p>
          ) : (
            <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
              {Object.entries(monthlyByType).map(([type, qty]) => (
                <div key={type} className="rounded-lg border p-3 bg-muted/30">
                  <div className="text-sm text-muted-foreground">{type}</div>
                  <div className="text-xl font-bold">{qty.toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Print report */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Printer className="h-4 w-4" />พิมพ์รายงานการเบิก</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <Label className="text-xs">จากวันที่</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="justify-start font-normal">
                    <CalendarIcon className="h-4 w-4 mr-1" />{format(printFrom, 'dd/MM/yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <DatePicker mode="single" selected={printFrom} onSelect={(d) => d && setPrintFrom(d)} initialFocus className={cn('p-3 pointer-events-auto')} />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label className="text-xs">ถึงวันที่</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="justify-start font-normal">
                    <CalendarIcon className="h-4 w-4 mr-1" />{format(printTo, 'dd/MM/yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <DatePicker mode="single" selected={printTo} onSelect={(d) => d && setPrintTo(d)} initialFocus className={cn('p-3 pointer-events-auto')} />
                </PopoverContent>
              </Popover>
            </div>
            <Button size="sm" onClick={() => {
              const fromKey = format(printFrom, 'yyyy-MM-dd');
              const toKey = format(printTo, 'yyyy-MM-dd');
              const filtered = list
                .filter(w => {
                  const k = format(new Date(w.withdrawn_at), 'yyyy-MM-dd');
                  return k >= fromKey && k <= toKey;
                })
                .sort((a, b) => new Date(a.withdrawn_at).getTime() - new Date(b.withdrawn_at).getTime());
              printPaperWithdrawalReport({ shopName: settings.shopName, from: fromKey, to: toKey, rows: filtered });
            }}>
              <Printer className="h-4 w-4 mr-1" />พิมพ์
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle>ประวัติการเบิก ({list.length} รายการ)</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">กำลังโหลด...</p>
          ) : list.length === 0 ? (
            <p className="text-muted-foreground">ยังไม่มีการเบิก</p>
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted">
                    <TableHead>วันที่</TableHead>
                    <TableHead>ชนิด</TableHead>
                    <TableHead className="text-right">จำนวน</TableHead>
                    <TableHead>หน่วย</TableHead>
                    <TableHead>ผู้เบิก</TableHead>
                    <TableHead>วัตถุประสงค์</TableHead>
                    <TableHead>หมายเหตุ</TableHead>
                    <TableHead className="text-center w-20">จัดการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((w, i) => (
                    <TableRow key={w.id} className={i % 2 ? 'bg-muted/30' : ''}>
                      <TableCell>{new Date(w.withdrawn_at).toLocaleDateString('th-TH')}</TableCell>
                      <TableCell className="font-medium">{w.paper_type}</TableCell>
                      <TableCell className="text-right">{Number(w.quantity).toLocaleString()}</TableCell>
                      <TableCell>{w.unit}</TableCell>
                      <TableCell>{w.withdrawn_by}</TableCell>
                      <TableCell>{w.purpose || '-'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{w.note || '-'}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex gap-1 justify-center">
                          <Button variant="ghost" size="icon-sm" onClick={() => openEdit(w)} title="แก้ไข">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleDelete(w.id)}
                            className="text-destructive hover:bg-destructive/10"
                            title="ลบ"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>แก้ไขรายการเบิกกระดาษ</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>ชนิดกระดาษ</Label>
              <Select value={editForm.paper_type} onValueChange={(v) => setEditForm({ ...editForm, paper_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {paperTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>จำนวน</Label>
              <Input type="number" min="0" step="any" value={editForm.quantity}
                onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })} />
            </div>
            <div>
              <Label>หน่วย</Label>
              <Select value={editForm.unit} onValueChange={(v) => setEditForm({ ...editForm, unit: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {units.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>ผู้เบิก</Label>
              <Input value={editForm.withdrawn_by}
                onChange={(e) => setEditForm({ ...editForm, withdrawn_by: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <Label>วัตถุประสงค์</Label>
              <Input value={editForm.purpose}
                onChange={(e) => setEditForm({ ...editForm, purpose: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <Label>หมายเหตุ</Label>
              <Textarea rows={2} value={editForm.note}
                onChange={(e) => setEditForm({ ...editForm, note: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>ยกเลิก</Button>
            <Button onClick={handleUpdate}>บันทึก</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

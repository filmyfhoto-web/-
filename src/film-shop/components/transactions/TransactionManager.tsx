import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAppData } from '@/film-shop/hooks/useAppData';
import { DollarSign, Plus, Trash2, TrendingUp, TrendingDown, Calendar } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Paperclip, ExternalLink, Loader2 } from 'lucide-react';

type EvidenceFile = { name: string; url: string };


const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const formatDate = (date: Date) => {
  return new Date(date).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const incomeCategories = ['ขายสินค้า', 'ค่าบริการ', 'มัดจำ', 'อื่นๆ'];
const expenseCategories = ['วัสดุสิ้นเปลือง', 'ค่าจ้างงาน', 'ค่าน้ำ/ค่าไฟ', 'ค่าเช่า', 'ค่าขนส่ง', 'อื่นๆ'];

const isToday = (d: Date) => {
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
};

export function TransactionManager() {
  const { transactions, addTransaction, deleteTransaction } = useAppData();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [filterMonth, setFilterMonth] = useState<string>('');
  const [onlyLine, setOnlyLine] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceFiles, setEvidenceFiles] = useState<EvidenceFile[]>([]);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);

  const openEvidence = async (transactionId: string) => {
    setEvidenceOpen(true);
    setEvidenceLoading(true);
    setEvidenceError(null);
    setEvidenceFiles([]);
    try {
      const { data, error } = await supabase.functions.invoke('film-transaction-evidence', {
        body: { transaction_id: transactionId },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(String(data?.error || 'load_failed'));
      setEvidenceFiles((data.files ?? []) as EvidenceFile[]);
    } catch (e) {
      setEvidenceError('เปิดหลักฐานไม่สำเร็จ หรือสิทธิ์หมดอายุ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setEvidenceLoading(false);
    }
  };

  const [formData, setFormData] = useState({
    type: 'income' as 'income' | 'expense',
    category: '',
    description: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
  });

  const filteredTransactions = transactions
    .filter(t => {
      const matchesType = filterType === 'all' || t.type === filterType;
      const transactionMonth = new Date(t.date).toISOString().slice(0, 7);
      const matchesMonth = !filterMonth || transactionMonth === filterMonth;
      const matchesSource = !onlyLine || t.source === 'line';
      return matchesType && matchesMonth && matchesSource;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const todayList = transactions.filter(t => isToday(new Date(t.date)));
  const todayIncome = todayList.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const todayExpense = todayList.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const todayFromLine = todayList.filter(t => t.source === 'line').length;

  const totalIncome = filteredTransactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpense = filteredTransactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.category || !formData.amount) {
      toast.error('กรุณากรอกข้อมูลให้ครบ');
      return;
    }

    addTransaction({
      type: formData.type,
      category: formData.category,
      description: formData.description,
      amount: parseFloat(formData.amount),
      date: new Date(formData.date),
    });

    toast.success(formData.type === 'income' ? 'บันทึกรายรับเรียบร้อย' : 'บันทึกรายจ่ายเรียบร้อย');
    handleCloseDialog();
  };

  const handleDelete = (id: string) => {
    if (confirm('ต้องการลบรายการนี้หรือไม่?')) {
      deleteTransaction(id);
      toast.success('ลบรายการเรียบร้อย');
    }
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setFormData({
      type: 'income',
      category: '',
      description: '',
      amount: '',
      date: new Date().toISOString().split('T')[0],
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-success/10 border-success/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-success/20">
                <TrendingUp className="h-6 w-6 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">รายรับ</p>
                <p className="text-2xl font-bold text-success">{formatCurrency(totalIncome)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-destructive/10 border-destructive/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-destructive/20">
                <TrendingDown className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">รายจ่าย</p>
                <p className="text-2xl font-bold text-destructive">{formatCurrency(totalExpense)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-primary/10 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-primary/20">
                <DollarSign className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">คงเหลือ</p>
                <p className={`text-2xl font-bold ${totalIncome - totalExpense >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {formatCurrency(totalIncome - totalExpense)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* สรุปวันนี้ (รวมรายการที่ “ม่วงจดให้” บันทึกผ่าน LINE) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-4 w-4 text-primary" />
            สรุปวันนี้
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">รายรับวันนี้</p>
            <p className="text-lg font-bold text-success">{formatCurrency(todayIncome)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">รายจ่ายวันนี้</p>
            <p className="text-lg font-bold text-destructive">{formatCurrency(todayExpense)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">คงเหลือวันนี้</p>
            <p className={`text-lg font-bold ${todayIncome - todayExpense >= 0 ? 'text-success' : 'text-destructive'}`}>
              {formatCurrency(todayIncome - todayExpense)}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">บันทึกโดย “ม่วงจดให้”</p>
            <p className="text-lg font-bold">{todayFromLine} รายการ</p>
          </div>
        </CardContent>
      </Card>



      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              จัดการรายรับ/รายจ่าย
            </CardTitle>
            
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={onlyLine ? 'default' : 'outline'}
                onClick={() => setOnlyLine((v) => !v)}
              >
                จากม่วงจดให้
              </Button>
              <Select value={filterType} onValueChange={(v) => setFilterType(v as any)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทั้งหมด</SelectItem>
                  <SelectItem value="income">รายรับ</SelectItem>
                  <SelectItem value="expense">รายจ่าย</SelectItem>
                </SelectContent>
              </Select>

              <Input
                type="month"
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
                className="w-40"
              />

              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4" />
                    เพิ่มรายการ
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>เพิ่มรายการ</DialogTitle>
                  </DialogHeader>
                  
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <Label>ประเภท</Label>
                      <Select
                        value={formData.type}
                        onValueChange={(v) => setFormData({ ...formData, type: v as any, category: '' })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="income">รายรับ</SelectItem>
                          <SelectItem value="expense">รายจ่าย</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>หมวดหมู่</Label>
                      <Select
                        value={formData.category}
                        onValueChange={(v) => setFormData({ ...formData, category: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="เลือกหมวดหมู่" />
                        </SelectTrigger>
                        <SelectContent>
                          {(formData.type === 'income' ? incomeCategories : expenseCategories).map(cat => (
                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>รายละเอียด</Label>
                      <Input
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="รายละเอียดเพิ่มเติม"
                      />
                    </div>

                    <div>
                      <Label>จำนวนเงิน (บาท)</Label>
                      <Input
                        type="number"
                        value={formData.amount}
                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                        placeholder="0.00"
                      />
                    </div>

                    <div>
                      <Label>วันที่</Label>
                      <Input
                        type="date"
                        value={formData.date}
                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      />
                    </div>

                    <div className="flex gap-2 justify-end">
                      <Button type="button" variant="outline" onClick={handleCloseDialog}>
                        ยกเลิก
                      </Button>
                      <Button type="submit" variant={formData.type === 'income' ? 'success' : 'destructive'}>
                        บันทึก{formData.type === 'income' ? 'รายรับ' : 'รายจ่าย'}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredTransactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <DollarSign className="h-12 w-12 mb-4 opacity-50" />
              <p>ยังไม่มีรายการ</p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-table-header">
                      <TableHead>วันที่</TableHead>
                      <TableHead>ประเภท</TableHead>
                      <TableHead>หมวดหมู่</TableHead>
                      <TableHead>รายละเอียด</TableHead>
                      <TableHead className="text-right">จำนวนเงิน</TableHead>
                      <TableHead className="w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTransactions.map((transaction, index) => (
                      <TableRow key={transaction.id} className={index % 2 === 1 ? 'bg-table-row-alt' : ''}>
                        <TableCell>{formatDate(transaction.date)}</TableCell>
                        <TableCell>
                          <Badge variant={transaction.type === 'income' ? 'default' : 'destructive'}>
                            {transaction.type === 'income' ? 'รายรับ' : 'รายจ่าย'}
                          </Badge>
                        </TableCell>
                        <TableCell>{transaction.category}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {transaction.description || '-'}
                          {transaction.source === 'line' && (
                            <Badge variant="outline" className="ml-2">ม่วงจดให้</Badge>
                          )}
                          {(transaction.evidence?.length ?? 0) > 0 && (
                            <Button
                              variant="secondary"
                              size="sm"
                              className="ml-2 h-6 px-2 text-xs"
                              onClick={() => openEvidence(transaction.id)}
                            >
                              <Paperclip className="mr-1 h-3 w-3" />
                              ดูหลักฐาน ({transaction.evidence!.length})
                            </Button>
                          )}
                        </TableCell>
                        <TableCell className={`text-right font-semibold ${transaction.type === 'income' ? 'text-success' : 'text-destructive'}`}>
                          {transaction.type === 'income' ? '+' : '-'}{formatCurrency(transaction.amount)}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(transaction.id)} className="text-destructive hover:text-destructive hover:bg-destructive/10">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Card List */}
              <div className="md:hidden space-y-3">
                {filteredTransactions.map((transaction) => (
                  <div key={transaction.id} className="rounded-lg border p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <Badge variant={transaction.type === 'income' ? 'default' : 'destructive'}>
                        {transaction.type === 'income' ? 'รายรับ' : 'รายจ่าย'}
                      </Badge>
                      <span className={`font-semibold ${transaction.type === 'income' ? 'text-success' : 'text-destructive'}`}>
                        {transaction.type === 'income' ? '+' : '-'}{formatCurrency(transaction.amount)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>{transaction.category}</span>
                      <span className="text-muted-foreground">{formatDate(transaction.date)}</span>
                    </div>
                    {transaction.description && <p className="text-sm text-muted-foreground">{transaction.description}</p>}
                    <div className="flex items-center justify-between pt-1">
                      {(transaction.evidence?.length ?? 0) > 0 ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-8 px-2 text-xs"
                          onClick={() => openEvidence(transaction.id)}
                        >
                          <Paperclip className="mr-1 h-3 w-3" />
                          ดูหลักฐาน ({transaction.evidence!.length})
                        </Button>
                      ) : <span />}
                      <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(transaction.id)} className="text-destructive hover:text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={evidenceOpen} onOpenChange={setEvidenceOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>หลักฐานแนบ</DialogTitle>
          </DialogHeader>
          {evidenceLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> กำลังเปิดไฟล์...
            </div>
          ) : evidenceError ? (
            <p className="py-4 text-sm text-destructive">{evidenceError}</p>
          ) : evidenceFiles.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">ไม่พบไฟล์หลักฐานของรายการนี้</p>
          ) : (
            <ul className="space-y-2">
              {evidenceFiles.map((f) => (
                <li key={f.url}>
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between rounded-md border p-3 text-sm hover:bg-muted"
                  >
                    <span className="truncate">{f.name}</span>
                    <ExternalLink className="ml-2 h-4 w-4 shrink-0" />
                  </a>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">ลิงก์ใช้ได้ประมาณ 10 นาที เพื่อความปลอดภัย</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LockOpen, Wallet, ArrowDownCircle, ArrowUpCircle, Lock, Loader2, Trash2, Edit, X, Check, BarChart3, History } from 'lucide-react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { CashDrawerShift, CashDrawerTransaction } from '@/film-shop/types/cashDrawer';
import { CashDrawerOpenShift } from './CashDrawerOpenShift';
import { CashDrawerCloseShift } from './CashDrawerCloseShift';
import { CashDrawerTransaction as CashDrawerTransactionDialog } from './CashDrawerTransactionDialog';
import { CashDrawerReport } from './CashDrawerReport';
import { CashDrawerAuditLog } from './CashDrawerAuditLog';

interface CashDrawerManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentShift: CashDrawerShift | null;
  transactions: CashDrawerTransaction[];
  isLoading: boolean;
  onOpenShift: (amount: number, notes?: string) => Promise<any>;
  onCloseShift: (actualAmount: number, notes?: string) => Promise<any>;
  onCashIn: (amount: number, description: string) => Promise<any>;
  onCashOut: (amount: number, description: string) => Promise<any>;
  onUpdateTransaction?: (id: string, amount: number, description: string) => Promise<any>;
  onDeleteTransaction?: (id: string) => Promise<any>;
}

export function CashDrawerManager({
  open,
  onOpenChange,
  currentShift,
  transactions,
  isLoading,
  onOpenShift,
  onCloseShift,
  onCashIn,
  onCashOut,
  onUpdateTransaction,
  onDeleteTransaction,
}: CashDrawerManagerProps) {
  const [openShiftDialog, setOpenShiftDialog] = useState(false);
  const [closeShiftDialog, setCloseShiftDialog] = useState(false);
  const [cashInDialog, setCashInDialog] = useState(false);
  const [cashOutDialog, setCashOutDialog] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  
  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const getTransactionTypeLabel = (type: string) => {
    switch (type) {
      case 'opening': return 'เปิดกะ';
      case 'sale': return 'ขาย';
      case 'cash_in': return 'เพิ่มเงิน';
      case 'cash_out': return 'ถอนเงิน';
      case 'refund': return 'คืนเงิน';
      default: return type;
    }
  };

  const getTransactionTypeColor = (type: string) => {
    switch (type) {
      case 'opening': return 'bg-blue-100 text-blue-800';
      case 'sale': return 'bg-green-100 text-green-800';
      case 'cash_in': return 'bg-emerald-100 text-emerald-800';
      case 'cash_out': return 'bg-orange-100 text-orange-800';
      case 'refund': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Calculate totals from transactions
  const salesTotal = transactions
    .filter(t => t.type === 'sale')
    .reduce((sum, t) => sum + t.amount, 0);
  
  const cashInTotal = transactions
    .filter(t => t.type === 'cash_in')
    .reduce((sum, t) => sum + t.amount, 0);
  
  const cashOutTotal = transactions
    .filter(t => t.type === 'cash_out')
    .reduce((sum, t) => sum + t.amount, 0);

  const handleStartEdit = (txn: CashDrawerTransaction) => {
    setEditingId(txn.id);
    setEditAmount(txn.amount.toString());
    setEditDescription(txn.description || '');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditAmount('');
    setEditDescription('');
  };

  const handleSaveEdit = async () => {
    if (!editingId || !onUpdateTransaction) return;
    const amount = parseFloat(editAmount);
    if (isNaN(amount) || amount <= 0) return;
    
    await onUpdateTransaction(editingId, amount, editDescription);
    handleCancelEdit();
  };

  const handleDelete = async (id: string) => {
    if (!onDeleteTransaction) return;
    if (window.confirm('ต้องการลบรายการนี้ใช่หรือไม่?')) {
      await onDeleteTransaction(id);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              ลิ้นชักเงิน
            </DialogTitle>
          </DialogHeader>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Status Card */}
              <Card>
                <CardContent className="pt-4">
                  {currentShift ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="default" className="bg-green-500">
                            🟢 เปิดอยู่
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            เปิดกะเมื่อ: {format(currentShift.openedAt, 'HH:mm น.', { locale: th })}
                          </span>
                        </div>
                      </div>
                      
                      <Separator />
                      
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">💵 เงินเริ่มต้น:</span>
                          <span className="font-medium">฿{currentShift.openingAmount.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">➕ เงินขาย (Cash):</span>
                          <span className="font-medium text-green-600">+฿{salesTotal.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">➕ เพิ่มเงิน:</span>
                          <span className="font-medium text-emerald-600">+฿{cashInTotal.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">➖ ถอนเงิน:</span>
                          <span className="font-medium text-orange-600">-฿{cashOutTotal.toLocaleString()}</span>
                        </div>
                      </div>
                      
                      <Separator />
                      
                      <div className="flex justify-between text-lg font-bold">
                        <span>💰 ยอดคาดว่าจะมี:</span>
                        <span className="text-primary">฿{currentShift.expectedAmount.toLocaleString()}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <div className="text-4xl mb-2">🔒</div>
                      <p className="text-muted-foreground">ยังไม่ได้เปิดกะ</p>
                      <p className="text-sm text-muted-foreground">กด "เปิดกะ" เพื่อเริ่มต้น</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Action Buttons */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                <Button
                  variant="outline"
                  className="flex-col h-20 gap-1"
                  onClick={() => setOpenShiftDialog(true)}
                  disabled={!!currentShift}
                >
                  <LockOpen className="h-5 w-5" />
                  <span className="text-xs">เปิดกะ</span>
                </Button>
                <Button
                  variant="outline"
                  className="flex-col h-20 gap-1"
                  onClick={() => setCashInDialog(true)}
                  disabled={!currentShift}
                >
                  <ArrowDownCircle className="h-5 w-5 text-green-600" />
                  <span className="text-xs">เพิ่มเงิน</span>
                </Button>
                <Button
                  variant="outline"
                  className="flex-col h-20 gap-1"
                  onClick={() => setCashOutDialog(true)}
                  disabled={!currentShift}
                >
                  <ArrowUpCircle className="h-5 w-5 text-orange-600" />
                  <span className="text-xs">ถอนเงิน</span>
                </Button>
                <Button
                  variant="outline"
                  className="flex-col h-20 gap-1"
                  onClick={() => setCloseShiftDialog(true)}
                  disabled={!currentShift}
                >
                  <Lock className="h-5 w-5 text-red-600" />
                  <span className="text-xs">ปิดกะ</span>
                </Button>
                <Button
                  variant="outline"
                  className="flex-col h-20 gap-1"
                  onClick={() => setShowReport(true)}
                >
                  <BarChart3 className="h-5 w-5 text-primary" />
                  <span className="text-xs">ประวัติกะ</span>
                </Button>
                <Button
                  variant="outline"
                  className="flex-col h-20 gap-1"
                  onClick={() => setShowAudit(true)}
                >
                  <History className="h-5 w-5 text-primary" />
                  <span className="text-xs">ประวัติแก้ไข</span>
                </Button>
              </div>

              {/* Transaction History */}
              {currentShift && transactions.length > 0 && (
                <div>
                  <h3 className="font-medium mb-2">รายการเคลื่อนไหววันนี้</h3>
                  <div className="border rounded-lg max-h-72 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-20">เวลา</TableHead>
                          <TableHead className="w-24">ประเภท</TableHead>
                          <TableHead>รายละเอียด</TableHead>
                          <TableHead className="text-right">จำนวน</TableHead>
                          <TableHead className="w-20 text-center">จัดการ</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {transactions.map((txn) => (
                          <TableRow key={txn.id}>
                            <TableCell className="text-sm">
                              {format(txn.createdAt, 'HH:mm')}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className={getTransactionTypeColor(txn.type)}>
                                {getTransactionTypeLabel(txn.type)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">
                              {editingId === txn.id ? (
                                <Input
                                  value={editDescription}
                                  onChange={(e) => setEditDescription(e.target.value)}
                                  className="h-7 text-sm"
                                  placeholder="รายละเอียด"
                                />
                              ) : (
                                txn.description || '-'
                              )}
                            </TableCell>
                            <TableCell className={`text-right font-medium ${
                              txn.type === 'cash_out' || txn.type === 'refund' 
                                ? 'text-red-600' 
                                : 'text-green-600'
                            }`}>
                              {editingId === txn.id ? (
                                <Input
                                  type="number"
                                  value={editAmount}
                                  onChange={(e) => setEditAmount(e.target.value)}
                                  className="h-7 text-sm text-right w-24"
                                />
                              ) : (
                                <>
                                  {txn.type === 'cash_out' || txn.type === 'refund' ? '-' : '+'}
                                  ฿{txn.amount.toLocaleString()}
                                </>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex justify-center gap-1">
                                {editingId === txn.id ? (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0 text-green-600"
                                      onClick={handleSaveEdit}
                                    >
                                      <Check className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0"
                                      onClick={handleCancelEdit}
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </>
                                ) : txn.type !== 'opening' ? (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0"
                                      onClick={() => handleStartEdit(txn)}
                                      disabled={!onUpdateTransaction}
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0 text-destructive"
                                      onClick={() => handleDelete(txn.id)}
                                      disabled={!onDeleteTransaction}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </>
                                ) : null}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Sub Dialogs */}
      <CashDrawerOpenShift
        open={openShiftDialog}
        onOpenChange={setOpenShiftDialog}
        onConfirm={async (amount, notes) => {
          await onOpenShift(amount, notes);
          setOpenShiftDialog(false);
        }}
      />

      <CashDrawerCloseShift
        open={closeShiftDialog}
        onOpenChange={setCloseShiftDialog}
        currentShift={currentShift}
        transactions={transactions}
        onConfirm={async (actualAmount, notes) => {
          await onCloseShift(actualAmount, notes);
          setCloseShiftDialog(false);
          onOpenChange(false);
        }}
      />

      <CashDrawerTransactionDialog
        open={cashInDialog}
        onOpenChange={setCashInDialog}
        type="cash_in"
        onConfirm={async (amount, description) => {
          await onCashIn(amount, description);
          setCashInDialog(false);
        }}
      />

      <CashDrawerTransactionDialog
        open={cashOutDialog}
        onOpenChange={setCashOutDialog}
        type="cash_out"
        onConfirm={async (amount, description) => {
          await onCashOut(amount, description);
          setCashOutDialog(false);
        }}
      />

      <CashDrawerReport
        open={showReport}
        onOpenChange={setShowReport}
      />

      <CashDrawerAuditLog
        open={showAudit}
        onOpenChange={setShowAudit}
        shiftId={currentShift?.id || null}
      />
    </>
  );
}

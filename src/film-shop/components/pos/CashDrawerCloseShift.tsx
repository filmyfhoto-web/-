import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Lock, CheckCircle, AlertTriangle } from 'lucide-react';
import { CashDrawerShift, CashDrawerTransaction } from '@/film-shop/types/cashDrawer';

interface CashDrawerCloseShiftProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentShift: CashDrawerShift | null;
  transactions: CashDrawerTransaction[];
  onConfirm: (actualAmount: number, notes?: string) => Promise<void>;
}

export function CashDrawerCloseShift({ 
  open, 
  onOpenChange, 
  currentShift, 
  transactions,
  onConfirm 
}: CashDrawerCloseShiftProps) {
  const [actualAmount, setActualAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Calculate totals
  const salesTotal = transactions
    .filter(t => t.type === 'sale')
    .reduce((sum, t) => sum + t.amount, 0);
  
  const cashInTotal = transactions
    .filter(t => t.type === 'cash_in')
    .reduce((sum, t) => sum + t.amount, 0);
  
  const cashOutTotal = transactions
    .filter(t => t.type === 'cash_out' || t.type === 'refund')
    .reduce((sum, t) => sum + t.amount, 0);

  const expectedAmount = currentShift?.expectedAmount || 0;
  const numActualAmount = parseFloat(actualAmount) || 0;
  const difference = numActualAmount - expectedAmount;

  useEffect(() => {
    if (open && currentShift) {
      setActualAmount(expectedAmount.toString());
    }
  }, [open, currentShift, expectedAmount]);

  const handleSubmit = async () => {
    if (numActualAmount < 0) return;

    setIsSubmitting(true);
    try {
      await onConfirm(numActualAmount, notes || undefined);
      setActualAmount('');
      setNotes('');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!currentShift) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            ปิดกะ
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary Card */}
          <Card>
            <CardContent className="pt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">เงินเริ่มต้น:</span>
                <span>฿{currentShift.openingAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">ยอดขายเงินสด:</span>
                <span className="text-green-600">+฿{salesTotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">เพิ่มเงิน:</span>
                <span className="text-emerald-600">+฿{cashInTotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">ถอนเงิน:</span>
                <span className="text-orange-600">-฿{cashOutTotal.toLocaleString()}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-bold">
                <span>ยอดคาดว่าจะมี:</span>
                <span className="text-primary">฿{expectedAmount.toLocaleString()}</span>
              </div>
            </CardContent>
          </Card>

          {/* Actual Amount Input */}
          <div className="space-y-2">
            <Label htmlFor="actual-amount">ยอดเงินจริงในลิ้นชัก</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">฿</span>
              <Input
                id="actual-amount"
                type="number"
                value={actualAmount}
                onChange={(e) => setActualAmount(e.target.value)}
                className="pl-8 text-lg font-bold"
                placeholder="0.00"
                min="0"
                step="0.01"
              />
            </div>
          </div>

          {/* Difference Display */}
          {actualAmount && (
            <div className={`flex items-center gap-2 p-3 rounded-lg ${
              difference === 0 
                ? 'bg-green-50 text-green-700' 
                : difference > 0 
                  ? 'bg-blue-50 text-blue-700'
                  : 'bg-red-50 text-red-700'
            }`}>
              {difference === 0 ? (
                <>
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">ยอดตรง!</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-5 w-5" />
                  <span className="font-medium">
                    {difference > 0 ? `เกิน ฿${difference.toLocaleString()}` : `ขาด ฿${Math.abs(difference).toLocaleString()}`}
                  </span>
                </>
              )}
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="close-notes">หมายเหตุ (ไม่บังคับ)</Label>
            <Textarea
              id="close-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="บันทึกเพิ่มเติม..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={isSubmitting || !actualAmount}
            variant="destructive"
          >
            <Lock className="h-4 w-4 mr-2" />
            ปิดกะ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

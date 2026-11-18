import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { LockOpen } from 'lucide-react';

interface CashDrawerOpenShiftProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (amount: number, notes?: string) => Promise<void>;
}

export function CashDrawerOpenShift({ open, onOpenChange, onConfirm }: CashDrawerOpenShiftProps) {
  const [amount, setAmount] = useState('1000');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    const numAmount = parseFloat(amount) || 0;
    if (numAmount < 0) return;

    setIsSubmitting(true);
    try {
      await onConfirm(numAmount, notes || undefined);
      setAmount('1000');
      setNotes('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LockOpen className="h-5 w-5" />
            เปิดกะ
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="opening-amount">เงินเริ่มต้นในลิ้นชัก</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">฿</span>
              <Input
                id="opening-amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="pl-8"
                placeholder="0.00"
                min="0"
                step="0.01"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">หมายเหตุ (ไม่บังคับ)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="เปิดร้านปกติ"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            <LockOpen className="h-4 w-4 mr-2" />
            เปิดกะ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

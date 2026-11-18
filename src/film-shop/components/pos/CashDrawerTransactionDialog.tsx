import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowDownCircle, ArrowUpCircle } from 'lucide-react';

interface CashDrawerTransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: 'cash_in' | 'cash_out' | 'transfer_in';
  onConfirm: (amount: number, description: string) => Promise<void>;
}

export function CashDrawerTransaction({ 
  open, 
  onOpenChange, 
  type,
  onConfirm 
}: CashDrawerTransactionDialogProps) {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isCashIn = type === 'cash_in';
  const isTransferIn = type === 'transfer_in';
  const isInflow = isCashIn || isTransferIn;
  const title = isTransferIn ? 'ใส่เงินโอน (รายรับ)' : isCashIn ? 'เพิ่มเงินเข้าลิ้นชัก' : 'ถอนเงินจากลิ้นชัก';
  const Icon = isInflow ? ArrowDownCircle : ArrowUpCircle;
  const iconColor = isTransferIn ? 'text-blue-600' : isCashIn ? 'text-green-600' : 'text-orange-600';
  const buttonText = isTransferIn ? 'บันทึกเงินโอน' : isCashIn ? 'เพิ่มเงิน' : 'ถอนเงิน';
  const placeholderReason = isTransferIn ? 'โอนจากลูกค้า A' : isCashIn ? 'เพิ่มเงินทอน' : 'ฝากธนาคาร';
  const buttonColorClass = isTransferIn
    ? 'bg-blue-600 hover:bg-blue-700'
    : isCashIn
      ? 'bg-green-600 hover:bg-green-700'
      : 'bg-orange-600 hover:bg-orange-700';

  const handleSubmit = async () => {
    const numAmount = parseFloat(amount) || 0;
    if (numAmount <= 0 || !description.trim()) return;

    setIsSubmitting(true);
    try {
      await onConfirm(numAmount, description.trim());
      setAmount('');
      setDescription('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setAmount('');
    setDescription('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className={`h-5 w-5 ${iconColor}`} />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="txn-amount">จำนวนเงิน</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">฿</span>
              <Input
                id="txn-amount"
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
            <Label htmlFor="txn-description">เหตุผล</Label>
            <Input
              id="txn-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={placeholderReason}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            ยกเลิก
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={isSubmitting || !amount || !description.trim()}
            className={buttonColorClass}
          >
            <Icon className="h-4 w-4 mr-2" />
            {buttonText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Printer, CheckCircle2, Calculator } from 'lucide-react';

interface POSCashDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  totalAmount: number;
  onComplete: (cashReceived: number, change: number) => void;
  onPrint?: () => void;
}

const formatCurrency = (amount: number) => amount.toFixed(2);

const QUICK_AMOUNTS = [20, 50, 100, 500, 1000];

export function POSCashDrawer({ isOpen, onClose, totalAmount, onComplete, onPrint }: POSCashDrawerProps) {
  const [inputValue, setInputValue] = useState('');

  const cashReceived = parseFloat(inputValue) || 0;
  const change = cashReceived - totalAmount;
  const isValid = cashReceived >= totalAmount && totalAmount > 0;

  useEffect(() => {
    if (isOpen) {
      setInputValue('');
    }
  }, [isOpen, totalAmount]);

  const handleQuickAmount = (amount: number) => {
    setInputValue(String(amount));
  };

  const handleExactAmount = () => {
    if (totalAmount > 0) {
      setInputValue(String(totalAmount));
    }
  };

  const handleComplete = () => {
    if (isValid) {
      onComplete(cashReceived, change);
    }
  };

  const handlePrintAndClose = () => {
    if (isValid && onPrint) {
      onPrint();
      onComplete(cashReceived, change);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Calculator className="h-5 w-5" />
            💰 เก็บเงิน / ทอนเงิน
          </DialogTitle>
          <DialogDescription>
            เลือกจำนวนเงินที่รับมาหรือพิมพ์เอง
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Total to Pay */}
          <div className="p-5 bg-muted rounded-xl text-center">
            <Label className="text-sm text-muted-foreground">ยอดที่ต้องชำระ</Label>
            <div className="text-4xl font-bold text-primary mt-1">
              ฿{formatCurrency(totalAmount)}
            </div>
          </div>

          {/* Quick Amount Buttons — primary action */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">💵 เลือกจำนวนเงินที่รับมา</Label>
            <div className="grid grid-cols-3 gap-2">
              {QUICK_AMOUNTS.map((amount) => (
                <Button
                  key={amount}
                  variant={cashReceived === amount ? 'default' : 'secondary'}
                  className="h-14 text-lg font-bold"
                  onClick={() => handleQuickAmount(amount)}
                >
                  ฿{amount}
                </Button>
              ))}
              <Button
                variant={cashReceived === totalAmount && totalAmount > 0 ? 'default' : 'secondary'}
                className="h-14 text-lg font-bold"
                onClick={handleExactAmount}
                disabled={totalAmount <= 0}
              >
                พอดี
              </Button>
            </div>
          </div>

          {/* Manual Input */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">หรือพิมพ์จำนวนเอง</Label>
            <Input
              type="text"
              inputMode="decimal"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="0.00"
              className="text-2xl text-center h-14 font-mono"
            />
          </div>

          {/* Change Display */}
          <div className={`p-5 rounded-xl text-center ${
            isValid 
              ? 'bg-green-100 dark:bg-green-900/30' 
              : 'bg-red-100 dark:bg-red-900/30'
          }`}>
            <Label className="text-sm text-muted-foreground">
              {isValid ? '💰 เงินทอน' : totalAmount <= 0 ? 'กรุณาใส่ยอดที่ต้องชำระ' : 'ยังรับเงินไม่พอ'}
            </Label>
            <div className={`text-5xl font-bold mt-1 ${
              isValid 
                ? 'text-green-600 dark:text-green-400' 
                : 'text-red-600 dark:text-red-400'
            }`}>
              {totalAmount <= 0 
                ? '฿0.00'
                : isValid 
                  ? `฿${formatCurrency(change)}` 
                  : `-฿${formatCurrency(Math.abs(change))}`
              }
            </div>
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:flex-row mt-2">
          <Button
            variant="outline"
            onClick={handleComplete}
            disabled={!isValid}
            className="flex-1 h-12 text-base"
          >
            <CheckCircle2 className="h-5 w-5 mr-2" />
            เก็บเงินเรียบร้อย
          </Button>
          {onPrint && (
            <Button
              onClick={handlePrintAndClose}
              disabled={!isValid}
              className="flex-1 h-12 text-base"
            >
              <Printer className="h-5 w-5 mr-2" />
              พิมพ์ใบเสร็จ
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

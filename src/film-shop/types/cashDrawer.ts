export type CashDrawerTransactionType = 'cash_in' | 'cash_out' | 'sale' | 'refund' | 'opening';

export interface CashDrawerShift {
  id: string;
  openedAt: Date;
  closedAt?: Date;
  openingAmount: number;
  expectedAmount: number;
  actualAmount?: number;
  difference?: number;
  status: 'open' | 'closed';
  notes?: string;
  createdAt: Date;
}

export interface CashDrawerTransaction {
  id: string;
  shiftId: string;
  type: CashDrawerTransactionType;
  amount: number;
  description?: string;
  posReceiptId?: string;
  createdAt: Date;
}

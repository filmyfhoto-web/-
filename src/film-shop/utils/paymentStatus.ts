// Shared payment-status definitions used by Invoice/Receipt/POS/Daily Report.
// Status set: pending (ยังไม่จ่าย) | deposit (มัดจำ) | credit (ลงบัญชี) | paid (จ่ายแล้ว)
// Legacy 'partial' is treated as 'deposit'.

export type PaymentStatusKey = 'pending' | 'deposit' | 'credit' | 'paid';

export const PAY_STATUS: Record<PaymentStatusKey, {
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  className: string;
}> = {
  pending: { label: 'ยังไม่จ่าย', variant: 'destructive', className: 'bg-destructive/10 text-destructive border-destructive/30' },
  deposit: { label: 'มัดจำ',     variant: 'secondary',   className: 'bg-warning/15 text-warning border-warning/30' },
  credit:  { label: 'ลงบัญชี',    variant: 'outline',     className: 'bg-orange-100 text-orange-700 border-orange-300' },
  paid:    { label: 'จ่ายแล้ว',    variant: 'default',     className: 'bg-success/15 text-success border-success/30' },
};

export const PAY_STATUS_OPTIONS: PaymentStatusKey[] = ['pending', 'deposit', 'credit', 'paid'];

export function normalizePaymentStatus(s: string | null | undefined): PaymentStatusKey {
  if (!s) return 'pending';
  if (s === 'partial') return 'deposit';
  if ((PAY_STATUS_OPTIONS as string[]).includes(s)) return s as PaymentStatusKey;
  return 'pending';
}

export function getPaymentStatusLabel(s: string | null | undefined): string {
  return PAY_STATUS[normalizePaymentStatus(s)].label;
}

/** สถานะการชำระเงินของเอกสารด่วน — ใช้ร่วมกันทั้งตอนบันทึกจริงและตอนดูตัวอย่าง */
export interface QuickDocPaymentFields {
  status: 'paid' | 'pending';
  amountDue: number;
  paidAt?: Date;
}

export function quickDocPaymentFields(
  docKind: 'receipt' | 'job_order',
  paid: boolean,
  netTotal: number,
  now: Date = new Date(),
): QuickDocPaymentFields {
  const paidNow = docKind === 'receipt' && paid;
  return {
    status: paidNow ? 'paid' : 'pending',
    amountDue: paidNow ? 0 : netTotal,
    ...(paidNow ? { paidAt: now } : {}),
  };
}

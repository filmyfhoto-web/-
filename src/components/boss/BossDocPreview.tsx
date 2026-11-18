import { computeTotals, lineAmount, type BossResult } from "@/lib/bossDocument";

const baht = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface BossDocPreviewProps {
  result: BossResult;
  shopName: string;
  docLabel: string;
}

/** ตัวอย่างเอกสารแบบ A4 (อ่านอย่างเดียว) — ใช้ยอดจากตัวคำนวณของแอปเสมอ */
export default function BossDocPreview({ result, shopName, docLabel }: BossDocPreviewProps) {
  const totals = computeTotals(result.items, result.vatMode, result.vatRate);
  const today = new Date().toLocaleDateString("th-TH", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <div data-testid="boss-doc-preview" className="mx-auto w-full max-w-[794px] rounded-xl border bg-card p-5 sm:p-8 text-sm shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
        <div>
          <div className="text-lg font-bold">{shopName}</div>
          <div className="text-xs text-muted-foreground">ตลาดเชียงกลาง อำเภอเชียงกลาง จังหวัดน่าน 55160</div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold tracking-wide">{docLabel}</div>
          <div className="text-xs text-muted-foreground">วันที่ {today}</div>
          <div className="text-[11px] text-muted-foreground">ตัวอย่างเอกสาร (ยังไม่บันทึก)</div>
        </div>
      </div>

      <div className="grid gap-1 py-4 sm:grid-cols-2">
        <div className="space-y-0.5">
          <div className="text-xs text-muted-foreground">ลูกค้า</div>
          <div className="font-medium">{result.customer.name || result.customer.organization || "-"}</div>
          {result.customer.organization && result.customer.name && (
            <div className="text-muted-foreground">{result.customer.organization}</div>
          )}
          {result.customer.address && <div className="text-muted-foreground whitespace-pre-line">{result.customer.address}</div>}
        </div>
        <div className="space-y-0.5 sm:text-right">
          {result.customer.taxId && <div>เลขผู้เสียภาษี: {result.customer.taxId}</div>}
          {result.customer.phone && <div>โทร: {result.customer.phone}</div>}
          <div className="text-muted-foreground">
            {result.vatMode === "none" ? "ไม่คิด VAT" : result.vatMode === "inclusive" ? `ราคารวม VAT ${result.vatRate}%` : `ราคายังไม่รวม VAT ${result.vatRate}%`}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/60 text-xs">
              <th className="border p-2 w-12">ลำดับ</th>
              <th className="border p-2 text-left">รายการ</th>
              <th className="border p-2 w-20">จำนวน</th>
              <th className="border p-2 w-20">หน่วย</th>
              <th className="border p-2 w-28 text-right">ราคา/หน่วย</th>
              <th className="border p-2 w-28 text-right">จำนวนเงิน</th>
            </tr>
          </thead>
          <tbody>
            {result.items.length === 0 && (
              <tr><td className="border p-3 text-center text-muted-foreground" colSpan={6}>ยังไม่มีรายการ</td></tr>
            )}
            {result.items.map((it, i) => (
              <tr key={i}>
                <td className="border p-2 text-center text-muted-foreground">{i + 1}</td>
                <td className="border p-2">{it.description || "-"}</td>
                <td className="border p-2 text-center tabular-nums">{it.quantity}</td>
                <td className="border p-2 text-center">{it.unit || "-"}</td>
                <td className="border p-2 text-right tabular-nums">{baht(it.unitPrice)}</td>
                <td className="border p-2 text-right tabular-nums">{baht(lineAmount(it))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex justify-end">
        <div className="w-full sm:w-72 space-y-1">
          <div className="flex justify-between"><span>รวมเป็นเงิน</span><span className="tabular-nums">{baht(totals.subtotal)}</span></div>
          <div className="flex justify-between">
            <span>VAT {result.vatMode === "none" ? "" : `${result.vatRate}%`}</span>
            <span className="tabular-nums">{baht(totals.vatAmount)}</span>
          </div>
          <div className="flex justify-between border-t pt-1 text-base font-bold">
            <span>ยอดสุทธิ</span><span className="tabular-nums">{baht(totals.grandTotal)}</span>
          </div>
        </div>
      </div>

      {result.notes && (
        <div className="mt-4 border-t pt-3 text-xs text-muted-foreground whitespace-pre-line">หมายเหตุ: {result.notes}</div>
      )}
    </div>
  );
}
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { fmtMoney, itemTotal, type CpoItem, type CpoTotals } from "@/lib/customerPoTotals";

/** Read-only A4 draft preview. No document number is created here. */
export function PoA4Preview({
  open,
  onOpenChange,
  poNumber,
  customerName,
  org,
  phone,
  items,
  totals,
  discount,
  vatEnabled,
  vatRate,
  whtEnabled,
  whtRate,
  note,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  poNumber: string;
  customerName: string;
  org: string;
  phone: string;
  items: CpoItem[];
  totals: CpoTotals;
  discount: number;
  vatEnabled: boolean;
  vatRate: number;
  whtEnabled: boolean;
  whtRate: number;
  note: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="px-5 pt-5">
          <DialogTitle className="text-blue-900">ตัวอย่าง A4 (ฉบับร่าง)</DialogTitle>
        </DialogHeader>

        <div id="cpo-a4-preview" className="mx-auto my-4 w-full max-w-[210mm] bg-white p-6 md:p-10 text-[13px] text-slate-800">
          <div className="flex items-start justify-between border-b border-slate-200 pb-3">
            <div>
              <div className="text-lg font-bold text-blue-900">ใบสรุปคำสั่งซื้อ (ฉบับร่าง)</div>
              <div className="text-xs text-slate-500">ยังไม่ใช่เอกสารทางบัญชี · ไม่มีเลขเอกสารจริง</div>
            </div>
            <div className="text-right text-xs">
              <div>เลขที่คำสั่งซื้อ: <b>{poNumber || "-"}</b></div>
              <div>วันที่: {new Date().toLocaleDateString("th-TH")}</div>
            </div>
          </div>

          <div className="py-3 text-xs leading-6">
            <div>ลูกค้า: <b>{customerName || "-"}</b></div>
            {org && <div>หน่วยงาน: {org}</div>}
            {phone && <div>โทร: {phone}</div>}
          </div>

          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-blue-50 text-blue-900">
                <th className="border border-slate-200 px-2 py-1 text-left">รายการ</th>
                <th className="border border-slate-200 px-2 py-1 text-right w-20">จำนวน</th>
                <th className="border border-slate-200 px-2 py-1 text-left w-16">หน่วย</th>
                <th className="border border-slate-200 px-2 py-1 text-right w-24">ราคา</th>
                <th className="border border-slate-200 px-2 py-1 text-right w-24">ส่วนลด</th>
                <th className="border border-slate-200 px-2 py-1 text-right w-28">รวม</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.key}>
                  <td className="border border-slate-200 px-2 py-1">{it.name}</td>
                  <td className="border border-slate-200 px-2 py-1 text-right">{it.quantity}</td>
                  <td className="border border-slate-200 px-2 py-1">{it.unit}</td>
                  <td className="border border-slate-200 px-2 py-1 text-right">{fmtMoney(it.price)}</td>
                  <td className="border border-slate-200 px-2 py-1 text-right">{fmtMoney(it.discount || 0)}</td>
                  <td className="border border-slate-200 px-2 py-1 text-right">{fmtMoney(itemTotal(it))}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-3 ml-auto w-full max-w-xs space-y-1 text-xs">
            <Row label="ยอดสินค้า" value={fmtMoney(totals.subtotal)} />
            {discount > 0 && <Row label="ส่วนลดท้ายบิล" value={`-${fmtMoney(discount)}`} />}
            <Row label="ยอดก่อนภาษี" value={fmtMoney(totals.base)} />
            {vatEnabled && <Row label={`VAT ${vatRate}%`} value={fmtMoney(totals.vat)} />}
            {whtEnabled && <Row label={`หัก ณ ที่จ่าย ${whtRate}%`} value={`-${fmtMoney(totals.wht)}`} />}
            <div className="flex justify-between border-t border-slate-300 pt-1 text-sm font-bold text-blue-900">
              <span>ยอดสุทธิ</span>
              <span>{fmtMoney(totals.net)} บาท</span>
            </div>
          </div>

          {note && <div className="mt-4 text-xs text-slate-600">หมายเหตุ: {note}</div>}
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-background px-5 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>ปิด</Button>
          <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => window.print()}>
            <Printer className="mr-1 h-4 w-4" /> พิมพ์
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
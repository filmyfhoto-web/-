import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Download, FileText, Layers, Coins, CalendarIcon, X } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { downloadCsv } from "@/lib/csv";
import {
  BILL_DOC_LABEL,
  BILL_DOC_TYPES,
  rollupBillRows,
  sumBillRows,
  useBillSales,
  type BillDocType,
  type BillShop,
  type SaleType,
  type BillRow,
} from "./useBillSales";

const thDate = (d: Date) => d.toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "numeric" });

/** true when after = before - qty (i.e. the deduction matches the document line) */
export function stockMatches(r: Pick<BillRow, "stockBefore" | "stockAfter" | "qty">): boolean {
  if (r.stockBefore == null || r.stockAfter == null) return false;
  return Math.abs((Number(r.stockBefore) - Number(r.qty)) - Number(r.stockAfter)) < 0.0001;
}

const money = (n: number) =>
  n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Props = {
  shop: BillShop;
  shopLabel: string;
  sinceISO: string | null;
  search: string;
  /** bill_only = ซื้อบิล (ไม่หักสต๊อก), real_goods = ซื้อของจริง (หักสต๊อก) */
  saleType?: SaleType;
};

/**
 * "ขายบิล" — document based sales (rds_documents). These NEVER affect stock;
 * they are counted separately per item: จำนวน / หน่วย / ราคา / รวม.
 */
export default function BillSalesPanel({ shop, shopLabel, sinceISO, search, saleType = "bill_only" }: Props) {
  const isReal = saleType === "real_goods";
  const kind = isReal ? "ซื้อของจริง" : "ซื้อบิล";
  const [docType, setDocType] = useState<BillDocType>("all");
  const [limit, setLimit] = useState(500);
  // Custom date range overrides the page-level preset range when set.
  const [from, setFrom] = useState<Date | undefined>();
  const [to, setTo] = useState<Date | undefined>();
  const [openDoc, setOpenDoc] = useState<string | null>(null);

  const effSince = useMemo(() => {
    if (!from) return sinceISO;
    const d = new Date(from);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, [from, sinceISO]);
  const effUntil = useMemo(() => {
    if (!to) return null;
    const d = new Date(to);
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
  }, [to]);

  const { rows, documents, loading, storeReady } = useBillSales(shop, docType, effSince, saleType, effUntil);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(
      (r) =>
        r.product.toLowerCase().includes(s) ||
        r.documentNo.toLowerCase().includes(s) ||
        r.customer.toLowerCase().includes(s),
    );
  }, [rows, search]);

  const detailRows = useMemo(() => (openDoc ? rows.filter((r) => r.documentId === openDoc) : []), [rows, openDoc]);
  const detailDoc = useMemo(() => documents.find((d) => d.id === openDoc) || null, [documents, openDoc]);

  const totals = useMemo(() => sumBillRows(filtered), [filtered]);
  const rollup = useMemo(() => rollupBillRows(filtered), [filtered]);

  function exportCsv() {
    downloadCsv(
      `${isReal ? "real" : "bill"}-sales-${shop}-${docType}-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((r) => ({
        "วันที่": new Date(r.date).toLocaleDateString("th-TH"),
        "ชนิดเอกสาร": BILL_DOC_LABEL[r.documentType as BillDocType] || r.documentType,
        "เลขที่เอกสาร": r.documentNo,
        "ลูกค้า": r.customer,
        "สินค้า": r.product,
        "จำนวน": r.qty,
        "หน่วย": r.unit,
        "ราคา/หน่วย": r.price,
        "รวม": r.total,
        ...(isReal
          ? {
              "สต๊อกก่อน": r.stockBefore ?? "",
              "สต๊อกหลัง": r.stockAfter ?? "",
              "สถานะหักสต๊อก": r.applied ? "หักแล้ว" : "ยังไม่หักสต๊อก",
            }
          : {}),
      })),
    );
  }

  return (
    <div className="space-y-3" data-testid={isReal ? "real-sales-panel" : "bill-sales-panel"}>
      <Tabs value={docType} onValueChange={(v) => setDocType(v as BillDocType)}>
        <TabsList>
          {BILL_DOC_TYPES.map((t) => (
            <TabsTrigger key={t} value={t} data-testid={`bill-doc-${t}`} className="font-bold">
              {BILL_DOC_LABEL[t]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Custom date range — overrides the page preset when set */}
      <div className="flex flex-wrap items-center gap-2" data-testid="doc-date-range">
        <span className="text-xs text-muted-foreground">ช่วงวันที่:</span>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" data-testid="doc-date-from"
              className={cn("justify-start text-left font-normal", !from && "text-muted-foreground")}>
              <CalendarIcon className="h-4 w-4 mr-1" />
              {from ? thDate(from) : "เริ่มต้น"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={from} onSelect={setFrom} initialFocus className={cn("p-3 pointer-events-auto")} />
          </PopoverContent>
        </Popover>
        <span className="text-xs text-muted-foreground">ถึง</span>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" data-testid="doc-date-to"
              className={cn("justify-start text-left font-normal", !to && "text-muted-foreground")}>
              <CalendarIcon className="h-4 w-4 mr-1" />
              {to ? thDate(to) : "สิ้นสุด"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={to} onSelect={setTo} initialFocus className={cn("p-3 pointer-events-auto")} />
          </PopoverContent>
        </Popover>
        {(from || to) && (
          <Button variant="ghost" size="sm" data-testid="doc-date-clear" onClick={() => { setFrom(undefined); setTo(undefined); }}>
            <X className="h-4 w-4 mr-1" /> ล้างช่วงวันที่
          </Button>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Card className="p-3 flex items-center gap-3">
          <FileText className="h-6 w-6 text-primary" />
          <div>
            <div className="text-xs text-muted-foreground">จำนวนเอกสาร ({BILL_DOC_LABEL[docType]})</div>
            <div className="text-xl font-bold tabular-nums" data-testid="bill-doc-count">
              {totals.documents.toLocaleString("th-TH")}
            </div>
          </div>
        </Card>
        <Card className="p-3 flex items-center gap-3">
          <Layers className="h-6 w-6 text-sky-500" />
          <div>
            <div className="text-xs text-muted-foreground">จำนวนรายการ / จำนวนรวม</div>
            <div className="text-xl font-bold tabular-nums" data-testid="bill-item-count">
              {totals.items.toLocaleString("th-TH")} / {totals.qty.toLocaleString("th-TH")}
            </div>
          </div>
        </Card>
        <Card className="p-3 flex items-center gap-3">
          <Coins className="h-6 w-6 text-emerald-500" />
          <div>
            <div className="text-xs text-muted-foreground">{`ยอดรวม${kind} (บาท)`}</div>
            <div className="text-xl font-bold tabular-nums text-emerald-600" data-testid="bill-amount">
              {money(totals.amount)}
            </div>
          </div>
        </Card>
      </div>

      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-xs">
          {isReal ? "ซื้อของจริงหักสต๊อก · กรองจากติ๊ก “ซื้อของจริง” ในหน้าออกเอกสาร" : "ซื้อบิลไม่หักสต๊อก · กรองจากติ๊ก “ซื้อบิล” ในหน้าออกเอกสาร"}
        </Badge>
        <span className="text-xs text-muted-foreground">{shopLabel}</span>
        <Button size="sm" variant="outline" className="ml-auto" onClick={exportCsv} disabled={filtered.length === 0}>
          <Download className="h-4 w-4 mr-1" /> ดาวน์โหลด CSV (Google Sheets)
        </Button>
      </div>

      {rollup.length > 0 && (
        <Card className="p-3">
          <div className="text-sm font-semibold mb-2">
            สรุปรายสินค้า — {BILL_DOC_LABEL[docType]} ({rollup.length.toLocaleString("th-TH")} สินค้า)
          </div>
          <div className="overflow-auto max-h-96" data-testid="bill-rollup">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs sticky top-0">
                <tr>
                  <th className="text-left px-3 py-1.5">สินค้า</th>
                  <th className="text-right px-3 py-1.5">จำนวนรวม</th>
                  <th className="text-left px-3 py-1.5">หน่วย</th>
                  <th className="text-right px-3 py-1.5">มูลค่ารวม (บาท)</th>
                </tr>
              </thead>
              <tbody>
                {rollup.map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-1.5">{r.product}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-medium">{r.qty.toLocaleString("th-TH")}</td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{r.unit}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{money(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="border rounded-md overflow-x-auto bg-card">
        <table className="w-full text-sm" data-testid={isReal ? "real-doc-sales-table" : "bill-sales-table"}>
          <thead className="bg-muted/50 text-xs">
            <tr>
              <th className="text-left px-3 py-2">วันที่</th>
              <th className="text-left px-3 py-2">ชนิด</th>
              <th className="text-left px-3 py-2">เลขที่เอกสาร</th>
              <th className="text-left px-3 py-2">ลูกค้า</th>
              <th className="text-left px-3 py-2">สินค้า</th>
              <th className="text-right px-3 py-2">จำนวน</th>
              <th className="text-left px-3 py-2">หน่วย</th>
              <th className="text-right px-3 py-2">ราคา/หน่วย</th>
              <th className="text-right px-3 py-2">รวม</th>
              {isReal && <th className="text-right px-3 py-2">สต๊อกก่อน → หลัง</th>}
              {isReal && <th className="text-left px-3 py-2">สถานะ</th>}
            </tr>
          </thead>
          <tbody>
            {loading || !storeReady ? (
              <tr><td colSpan={isReal ? 11 : 9} className="py-8 text-center text-muted-foreground">กำลังโหลด...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={isReal ? 11 : 9} className="py-8 text-center text-muted-foreground">{`ไม่พบรายการ${kind}ในช่วงที่เลือก`}</td></tr>
            ) : (
              filtered.slice(0, limit).map((r) => (
                <tr
                  key={r.id}
                  className="border-t hover:bg-accent/30 cursor-pointer"
                  data-testid="doc-sales-row"
                  onClick={() => setOpenDoc(r.documentId)}
                >
                  <td className="px-3 py-2 text-xs whitespace-nowrap">{new Date(r.date).toLocaleDateString("th-TH")}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                    {BILL_DOC_LABEL[r.documentType as BillDocType] || r.documentType}
                  </td>
                  <td className="px-3 py-2 text-xs font-mono">{r.documentNo}</td>
                  <td className="px-3 py-2">{r.customer}</td>
                  <td className="px-3 py-2">{r.product}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{r.qty.toLocaleString("th-TH")}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{r.unit}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(r.price)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{money(r.total)}</td>
                  {isReal && (
                    <td className="px-3 py-2 text-right tabular-nums text-xs whitespace-nowrap" data-testid="doc-stock-delta">
                      {r.applied
                        ? <span className={cn(stockMatches(r) ? "" : "text-amber-600 font-semibold")}>
                            {Number(r.stockBefore).toLocaleString("th-TH")} → {Number(r.stockAfter).toLocaleString("th-TH")}
                          </span>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                  )}
                  {isReal && (
                    <td className="px-3 py-2 text-xs">
                      {r.applied
                        ? <Badge className="bg-emerald-100 text-emerald-800">หักแล้ว</Badge>
                        : <Badge className="bg-amber-100 text-amber-800">ยังไม่หักสต๊อก</Badge>}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="border-t bg-muted/40 font-semibold" data-testid="bill-sales-footer">
                <td className="px-3 py-2 text-xs" colSpan={5}>รวมทั้งหมด ({totals.items.toLocaleString("th-TH")} รายการ)</td>
                <td className="px-3 py-2 text-right tabular-nums">{totals.qty.toLocaleString("th-TH")}</td>
                <td />
                <td />
                <td className="px-3 py-2 text-right tabular-nums">{money(totals.amount)}</td>
                {isReal && <td />}
                {isReal && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {/* Row detail — document header + all its lines */}
      <Dialog open={Boolean(openDoc)} onOpenChange={(o) => !o && setOpenDoc(null)}>
        <DialogContent className="max-w-3xl" data-testid="doc-detail-dialog">
          <DialogHeader>
            <DialogTitle>
              รายละเอียดเอกสาร {detailDoc?.document_no || detailRows[0]?.documentNo || "—"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">ชนิดเอกสาร</div>
              <div className="font-medium">
                {BILL_DOC_LABEL[(detailDoc?.document_type || detailRows[0]?.documentType) as BillDocType] ||
                  detailDoc?.document_type || "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">วันที่</div>
              <div className="font-medium">
                {detailRows[0] ? new Date(detailRows[0].date).toLocaleDateString("th-TH") : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">ลูกค้า</div>
              <div className="font-medium">{detailDoc?.customer_name || detailRows[0]?.customer || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">สถานะ</div>
              <div className="font-medium">{detailDoc?.status || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">ยอดรวมเอกสาร</div>
              <div className="font-medium tabular-nums">{money(Number(detailDoc?.grand_total ?? 0))}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">ประเภท</div>
              <div className="font-medium">{kind}</div>
            </div>
          </div>
          <div className="border rounded-md overflow-x-auto max-h-80">
            <table className="w-full text-sm" data-testid="doc-detail-items">
              <thead className="bg-muted/50 text-xs sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2">สินค้า</th>
                  <th className="text-right px-3 py-2">จำนวน</th>
                  <th className="text-left px-3 py-2">หน่วย</th>
                  <th className="text-right px-3 py-2">ราคา</th>
                  <th className="text-right px-3 py-2">รวม</th>
                  {isReal && <th className="text-right px-3 py-2">สต๊อกก่อน → หลัง</th>}
                </tr>
              </thead>
              <tbody>
                {detailRows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2">{r.product}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.qty.toLocaleString("th-TH")}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.unit}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(r.price)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{money(r.total)}</td>
                    {isReal && (
                      <td className="px-3 py-2 text-right text-xs tabular-nums whitespace-nowrap">
                        {r.applied
                          ? `${Number(r.stockBefore).toLocaleString("th-TH")} → ${Number(r.stockAfter).toLocaleString("th-TH")}`
                          : "ยังไม่หักสต๊อก"}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end">
            <a
              href={`/receipts/${shop === "print" ? "printing" : "colorlab"}/documents/${openDoc}/edit`}
              target="_blank"
              rel="noreferrer"
            >
              <Button size="sm" variant="outline">เปิดหน้าเอกสาร</Button>
            </a>
          </div>
        </DialogContent>
      </Dialog>

      {filtered.length > limit && (
        <div className="flex justify-center">
          <Button size="sm" variant="outline" onClick={() => setLimit((n) => n + 1000)} data-testid="bill-show-more">
            แสดงเพิ่ม ({(filtered.length - limit).toLocaleString("th-TH")} รายการที่เหลือ)
          </Button>
        </div>
      )}
    </div>
  );
}
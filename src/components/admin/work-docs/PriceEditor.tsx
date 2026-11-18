import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, FileSpreadsheet, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtWhen, type WorkItem } from "@/lib/workDocs";
import {
  applyStandardPrices,
  buildQuotePdf, hasZeroPrice, lineAmount, linesTotal, loadWorkLines, quoteFileName,
  quoteXlsxRows, round2, saveWorkPrices, sendQuotation, STORE_NAME, uploadQuoteFile,
  type WorkLine,
} from "@/lib/workDocsPricing";

const baht = (n: number) =>
  n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * ขั้นตอน "ยืนยันและแก้ราคา" — แก้ราคาต่อหน่วยรายบรรทัด ยอดรวมคำนวณอัตโนมัติ
 * แล้วสร้างใบเสนอราคา PDF / ดาวน์โหลด Excel และส่งให้ลูกค้าทาง LINE ด้วยกลไกเดิม
 * บรรทัดที่ยังไม่มีราคาจะถูกเติม "ราคามาตรฐาน" ของสินค้าให้อัตโนมัติเป็นค่าตั้งต้น
 */
export default function PriceEditor({ item, onChanged }: { item: WorkItem; onChanged: () => void }) {
  const [lines, setLines] = useState<WorkLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"" | "save" | "send">("");
  const [error, setError] = useState("");
  const [prefilled, setPrefilled] = useState(0);
  const locked = Boolean(item.quoteSentAt);
  const [unlocked, setUnlocked] = useState(false);
  const editable = !locked || unlocked;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setUnlocked(false);
    setError("");
    setPrefilled(0);
    loadWorkLines(item)
      .then(async (rows) => {
        // เติมราคามาตรฐานให้เฉพาะบรรทัดที่ยังไม่มีราคา (ล้มเหลวก็ใช้ค่าเดิมต่อได้)
        let filled = rows;
        try { filled = await applyStandardPrices(rows); } catch { /* ignore */ }
        if (!alive) return;
        setLines(filled);
        setPrefilled(filled.filter((l, i) => Number(l.price) > 0 && !(Number(rows[i]?.price) > 0)).length);
      })
      .catch((e) => { if (alive) { setLines([]); setError((e as Error).message); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [item]);


  const total = useMemo(() => linesTotal(lines), [lines]);

  const setPrice = (key: string, value: string) => {
    const price = Number(value.replace(/,/g, ""));
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, price: Number.isFinite(price) ? price : 0 } : l)));
  };

  const onExcel = async () => {
    const { downloadXlsx } = await import("@/lib/xlsx");
    downloadXlsx(quoteFileName(item), { "ใบเสนอราคา": quoteXlsxRows(lines) }, undefined, {
      storeName: STORE_NAME,
      subtitle: `ใบเสนอราคา ${item.code} · ${item.customerName} · ยอดรวม ${baht(total)} บาท`,
    });
  };

  const onConfirm = async () => {
    if (!lines.length || busy) return;
    if (hasZeroPrice(lines) && !window.confirm("มีบางรายการราคาเป็น 0 — ต้องการสร้างใบเสนอราคาต่อไหม?")) return;
    setBusy("save");
    try {
      await saveWorkPrices(item, lines);
      const blob = await buildQuotePdf(item, lines);
      await uploadQuoteFile(item, blob);
      onChanged();
      setUnlocked(false);
      toast.success("ยืนยันราคาและสร้างใบเสนอราคาแล้ว — ส่งให้ลูกค้าได้เลย");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const onSend = async () => {
    if (busy) return;
    setBusy("send");
    try {
      const res = await sendQuotation(item, Boolean(item.quoteSentAt));
      onChanged();
      if (res.ok) toast.success("ส่งใบเสนอราคาให้ลูกค้าทาง LINE แล้ว");
      else if (res.error === "no_line_link") toast.warning("ยังไม่ได้ส่ง LINE — รอจับคู่ลูกค้า");
      else toast.error("ส่งไม่สำเร็จ — ลองใหม่ได้");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="ng-card" data-testid="work-price-editor">
      <h3 className="mb-2 text-[15px] font-bold" style={{ color: "hsl(var(--ng-ink))" }}>
        2. ยืนยันและแก้ราคา
      </h3>

      {loading ? (
        <p className="text-sm" style={{ color: "hsl(var(--ng-muted))" }}>กำลังโหลดรายการ…</p>
      ) : error ? (
        <p className="text-sm text-destructive">โหลดรายการไม่สำเร็จ: {error}</p>
      ) : lines.length === 0 ? (
        <p className="text-sm" style={{ color: "hsl(var(--ng-muted))" }}>
          งานนี้ไม่มีรายการสินค้าในระบบ (ลูกค้าส่งมาเป็นไฟล์แนบอย่างเดียว)
        </p>
      ) : (
        <>
          {prefilled > 0 ? (
            <p className="mb-2 text-xs" data-testid="std-price-hint" style={{ color: "hsl(var(--ng-muted))" }}>
              เติมราคามาตรฐานให้อัตโนมัติแล้ว {prefilled} รายการ — ตรวจสอบและปรับเฉพาะที่ต้องการเปลี่ยน
            </p>
          ) : null}
          {/* มือถือ: การ์ดต่อรายการ — ไม่ต้องเลื่อนแนวนอน */}
          <ul className="flex flex-col gap-2 md:hidden" data-testid="work-price-cards">
            {lines.map((l) => (
              <li key={l.key} className="rounded-xl border border-border p-3" data-testid="work-price-row">
                <p className="text-[14px] font-medium break-words">{l.name || "-"}</p>
                {l.code ? <p className="text-xs" style={{ color: "hsl(var(--ng-muted))" }}>{l.code}</p> : null}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-xs tabular-nums" style={{ color: "hsl(var(--ng-muted))" }}>
                    {l.qty} {l.unit}
                  </span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    disabled={!editable}
                    aria-label={`ราคาต่อหน่วยของ ${l.name}`}
                    placeholder="ยังไม่ตั้งราคา"
                    value={Number(l.price) > 0 ? String(l.price) : ""}
                    onChange={(e) => setPrice(l.key, e.target.value)}
                    className="h-10 w-32 text-right tabular-nums"
                  />
                </div>
                <p className="mt-1 text-right text-sm font-semibold tabular-nums">{baht(lineAmount(l))}</p>
              </li>
            ))}
          </ul>

          <div className="hidden w-full max-w-full overflow-x-auto md:block">
            <table className="w-full text-sm">

              <thead>
                <tr className="border-b border-border text-left text-xs" style={{ color: "hsl(var(--ng-soft))" }}>
                  <th className="py-2">รายการ</th>
                  <th className="py-2 text-right">จำนวน</th>
                  <th className="py-2 text-right">ราคาต่อหน่วย</th>
                  <th className="py-2 text-right">รวม</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.key} className="border-b border-border/60 last:border-0" data-testid="work-price-row">
                    <td className="py-2 pr-2">
                      <span className="block text-[14px] font-medium">{l.name || "-"}</span>
                      {l.code ? <span className="text-xs" style={{ color: "hsl(var(--ng-muted))" }}>{l.code}</span> : null}
                    </td>
                    <td className="py-2 text-right tabular-nums whitespace-nowrap">{l.qty} {l.unit}</td>
                    <td className="py-2 pl-2 text-right">
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        disabled={!editable}
                        aria-label={`ราคาต่อหน่วยของ ${l.name}`}
                        placeholder="ยังไม่ตั้งราคา"
                        value={Number(l.price) > 0 ? String(l.price) : ""}

                        onChange={(e) => setPrice(l.key, e.target.value)}
                        className="h-10 w-28 text-right tabular-nums"
                      />
                    </td>
                    <td className="py-2 pl-2 text-right font-semibold tabular-nums whitespace-nowrap">
                      {baht(lineAmount(l))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>


          <div className="mt-3 flex items-center justify-between rounded-xl px-3 py-2" style={{ background: "hsl(var(--ng-tint))" }}>
            <span className="text-sm font-semibold">ยอดรวมทั้งสิ้น</span>
            <span className="text-[18px] font-extrabold tabular-nums" data-testid="work-price-total">
              {baht(total)} บาท
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {editable ? (
              <Button className="h-11" disabled={busy !== ""} onClick={onConfirm} data-testid="work-price-confirm">
                {busy === "save" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-1 h-4 w-4" />}
                ยืนยันราคาและสร้างเอกสารส่งลูกค้า
              </Button>
            ) : (
              <Button variant="outline" className="h-11" onClick={() => setUnlocked(true)} data-testid="work-price-unlock">
                แก้ราคาอีกครั้ง
              </Button>
            )}
            <Button variant="outline" className="h-11" onClick={onExcel} data-testid="work-price-xlsx">
              <Download className="mr-1 h-4 w-4" /> ดาวน์โหลด Excel
            </Button>
            {item.quoteFile && (
              <Button className="h-11" variant="secondary" disabled={busy !== ""} onClick={onSend} data-testid="work-quote-send">
                {busy === "send" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
                {item.quoteSentAt ? "ส่งใบเสนอราคาอีกครั้ง" : "ส่งใบเสนอราคาทาง LINE"}
              </Button>
            )}
          </div>

          <div className="mt-2 text-xs" style={{ color: "hsl(var(--ng-muted))" }}>
            {item.quoteSentAt
              ? `ส่งใบเสนอราคาแล้ว ${fmtWhen(item.quoteSentAt)}`
              : item.pricedAt
                ? `ยืนยันราคาแล้ว ${fmtWhen(item.pricedAt)} — ยอดรวม ${baht(round2(total))} บาท`
                : "แก้ราคาต่อหน่วยได้ทุกบรรทัด ยอดรวมคำนวณอัตโนมัติจากบรรทัดเสมอ"}
          </div>
        </>
      )}
    </div>
  );
}

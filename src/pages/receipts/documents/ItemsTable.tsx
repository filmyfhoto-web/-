import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2, Plus, ArrowUp, ArrowDown, AlertTriangle } from "lucide-react";
import type { DocItem, ItemIssue } from "./useDocumentForm";
import { calcLineTotal } from "./useDocumentForm";
import ProductInput from "./ProductInput";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { smartParseText } from "./smartParse";

// Default unit options shown in the unit dropdown / datalist. Merged with any
// store-defined units so the user always has sensible choices, while remaining
// free to type a custom unit.
const DEFAULT_UNITS = [
  "ชิ้น","แผ่น","ใบ","งาน","ชุด","กล่อง","เล่ม","เมตร","ตร.ม.","รูป",
];
const FALLBACK_UNIT = "ชิ้น";

interface Props {
  storeId: string | undefined;
  items: DocItem[];
  units: string[];
  onSetItem: (idx: number, p: Partial<DocItem>) => void;
  onAdd: () => void;
  onRemove: (idx: number) => void;
  onMove: (from: number, to: number) => void;
  onPasteRows: (rows: Partial<DocItem>[]) => void;
  issues?: ItemIssue[];
}

export default function ItemsTable({
  storeId,
  items,
  units,
  onSetItem,
  onAdd,
  onRemove,
  onMove,
  onPasteRows,
  issues,
}: Props) {
  const issueByIdx = new Map<number, ItemIssue>();
  (issues ?? []).forEach((i) => issueByIdx.set(i.index, i));
  const hasField = (idx: number, f: "name" | "price" | "quantity") =>
    issueByIdx.get(idx)?.fields.includes(f) ?? false;

  const handleProductPaste = (idx: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const raw = e.clipboardData.getData("text/plain");
    if (!raw || !/[\t\n\r|;]/.test(raw)) return;
    const parsed = smartParseText(raw);
    if (!parsed.rows.length) return;
    e.preventDefault();
    const rows = parsed.rows.map((r) => ({
      name: r.name,
      quantity: r.quantity,
      // Never let unit be blank after a paste — fall back to a sensible default
      // so downstream printing / totals always show a unit.
      unit: (r.unit && r.unit.trim()) ? r.unit.trim() : FALLBACK_UNIT,
      price: r.price,
    }));
    const current = items[idx];
    const currentIsEmpty = !current?.name?.trim() && !(current?.price && current.price !== 0) && !current?.unit?.trim();
    if (currentIsEmpty) {
      onSetItem(idx, rows[0]);
      if (rows.length > 1) onPasteRows(rows.slice(1));
    } else {
      onPasteRows(rows);
    }
  };

  // Count duplicate item names (case-insensitive, trimmed) so the user can
  // spot accidental repeats while typing.
  const nameCounts = new Map<string, number>();
  items.forEach((it) => {
    const k = (it.name ?? "").trim().toLowerCase();
    if (!k) return;
    nameCounts.set(k, (nameCounts.get(k) ?? 0) + 1);
  });
  const isDuplicate = (name: string) => {
    const k = (name ?? "").trim().toLowerCase();
    return !!k && (nameCounts.get(k) ?? 0) > 1;
  };

  return (
    <TooltipProvider>
    <div className="rounded-xl border border-border overflow-hidden bg-card">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="p-2 w-10 text-center">ลำดับ</th>
              <th className="p-2 text-left min-w-[200px]">รายการ</th>
              <th className="p-2 w-20 text-right">จำนวน</th>
              <th className="p-2 w-24">หน่วย</th>
              <th className="p-2 w-28 text-right">ราคาต่อหน่วย</th>
              <th className="p-2 w-28 text-right">จำนวนเงิน</th>
              <th className="p-2 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => {
              const issue = issueByIdx.get(idx);
              return (
              <tr
                key={it.key}
                data-row-index={idx}
                className={cn(
                  "border-t border-border",
                  issue && "bg-destructive/5 border-l-2 border-l-destructive",
                )}
              >
                <td className="p-1 text-center text-muted-foreground">
                  <div className="flex items-center justify-center gap-1">
                    {idx + 1}
                    {issue && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs text-xs">
                          <p className="font-medium">{issue.reason}</p>
                          <p className="mt-1 text-muted-foreground">
                            ตัวอย่างที่ใช้ได้: <code>กระดาษ A4 · 5 · รีม · 120</code>
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </td>
                <td className="p-1">
                  <ProductInput
                    storeId={storeId}
                    value={it.name}
                    onChange={(v) => onSetItem(idx, { name: v })}
                    onPaste={(e) => handleProductPaste(idx, e)}
                    onPick={(p) =>
                      onSetItem(idx, {
                        product_id: p.id,
                        name: p.name,
                        price: Number(p.price) || 0,
                        unit: p.unit ?? it.unit,
                        quantity: it.quantity > 0 ? it.quantity : 1,
                      })
                    }
                    className={cn(hasField(idx, "name") && "border-destructive focus-visible:ring-destructive")}
                  />
                  {isDuplicate(it.name) && (
                    <p
                      data-testid={`dup-warn-${idx}`}
                      className="mt-1 text-[11px] text-amber-700 dark:text-amber-400 flex items-center gap-1"
                    >
                      <AlertTriangle className="h-3 w-3" />
                      มีรายการชื่อซ้ำกัน
                    </p>
                  )}
                </td>
                <td className="p-1">
                  <Input
                    type="number"
                    value={it.quantity}
                    onChange={(e) => onSetItem(idx, { quantity: Number(e.target.value) })}
                    aria-invalid={hasField(idx, "quantity")}
                    className={cn("text-right", hasField(idx, "quantity") && "border-destructive focus-visible:ring-destructive")}
                  />
                </td>
                <td className="p-1">
                  <Input
                    value={it.unit}
                    onChange={(e) => onSetItem(idx, { unit: e.target.value })}
                    onBlur={(e) => {
                      // If the user leaves the unit field empty (e.g. after
                      // pasting a row that lacked a unit column), back-fill
                      // with the default so the printed document never shows
                      // a blank หน่วย cell.
                      if (!e.target.value.trim()) onSetItem(idx, { unit: FALLBACK_UNIT });
                    }}
                    list={`units-${idx}`}
                    placeholder={FALLBACK_UNIT}
                  />
                  <datalist id={`units-${idx}`}>
                    {Array.from(new Set([...DEFAULT_UNITS, ...units])).map((u) => (
                      <option key={u} value={u} />
                    ))}
                  </datalist>
                </td>
                <td className="p-1">
                  <Input
                    type="number"
                    value={it.price}
                    onChange={(e) => onSetItem(idx, { price: Number(e.target.value) })}
                    aria-invalid={hasField(idx, "price")}
                    className={cn("text-right", hasField(idx, "price") && "border-destructive focus-visible:ring-destructive")}
                  />
                </td>
                <td className="p-2 text-right font-medium tabular-nums">
                  {calcLineTotal(it).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td className="p-1">
                  <div className="flex items-center gap-0.5">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      disabled={idx === 0}
                      onClick={() => onMove(idx, idx - 1)}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      disabled={idx === items.length - 1}
                      onClick={() => onMove(idx, idx + 1)}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive"
                      onClick={() => onRemove(idx)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="p-2 border-t border-border bg-muted/40">
        <Button size="sm" variant="outline" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5 mr-1" /> เพิ่มแถว
        </Button>
        <span className="ml-3 text-xs text-muted-foreground">
          ลำดับรันอัตโนมัติ · พิมพ์รายการลงในช่อง "รายการ" ได้เลย · จำนวนเงิน = จำนวน × ราคาต่อหน่วย
        </span>
      </div>
    </div>
    </TooltipProvider>
  );
}
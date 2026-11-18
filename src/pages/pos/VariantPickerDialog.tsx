import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import placeholderImg from "@/assets/product-placeholder.jpg";
import {
  type VariantSummary,
  variantAttributesLabel,
  variantEffectivePrice,
  isVariantSellable,
} from "./variantPicker";

type Props = {
  open: boolean;
  productName: string;
  productStandardPrice: number;
  productImageUrl?: string | null;
  variants: VariantSummary[];
  onCancel: () => void;
  onPick: (v: VariantSummary) => void;
};

const fmt = (n: number) =>
  new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

export default function VariantPickerDialog({
  open,
  productName,
  productStandardPrice,
  productImageUrl,
  variants,
  onCancel,
  onPick,
}: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      variants
        .filter((v) => v.active && v.archived_at == null)
        .sort((a, b) =>
          variantAttributesLabel(a).localeCompare(variantAttributesLabel(b), "th"),
        ),
    [variants],
  );

  useEffect(() => {
    if (!open) return;
    const firstSellable = rows.find(isVariantSellable) ?? rows[0] ?? null;
    setSelected(firstSellable?.id ?? null);
  }, [open, rows]);

  const confirm = () => {
    const v = rows.find((r) => r.id === selected);
    if (!v || !isVariantSellable(v)) return;
    onPick(v);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onCancel() : null)}>
      <DialogContent
        className="max-w-lg flex flex-col max-h-[100dvh] gap-0"
        data-testid="pos-variant-picker"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle className="text-base">
            เลือกตัวเลือกสินค้า · {productName}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-3 rounded-md border bg-muted/30 p-2">
          <img
            src={productImageUrl || placeholderImg}
            alt={`รูปสินค้า ${productName}`}
            width={48}
            height={48}
            loading="lazy"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = placeholderImg;
            }}
            className="h-12 w-12 shrink-0 rounded-md border bg-background object-cover"
            data-testid="pos-variant-product-image"
          />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold" data-testid="pos-variant-product-name">
              {productName}
            </div>
            <div className="text-[11px] text-muted-foreground">เลือกตัวเลือกเพื่อเพิ่มลงตะกร้า</div>
          </div>
        </div>

        <ul
          role="radiogroup"
          aria-label="ตัวเลือกสินค้า"
          className="flex-1 min-h-0 overflow-y-auto divide-y rounded-md border"
          data-testid="pos-variant-list"
        >
          {rows.length === 0 && (
            <li className="p-4 text-sm text-muted-foreground text-center">
              ยังไม่มีตัวเลือกที่พร้อมขาย
            </li>
          )}
          {rows.map((v) => {
            const sellable = isVariantSellable(v);
            const attrLabel = variantAttributesLabel(v);
            const price = variantEffectivePrice(v, productStandardPrice);
            const isSel = v.id === selected;
            return (
              <li key={v.id}>
                <label
                  className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer min-h-12 ${
                    isSel ? "bg-primary/5" : "hover:bg-muted/40"
                  } ${!sellable ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  <input
                    type="radio"
                    name="pos-variant"
                    className="h-4 w-4"
                    checked={isSel}
                    disabled={!sellable}
                    onChange={() => setSelected(v.id)}
                    aria-label={`${attrLabel || v.sku || "ตัวเลือก"} คงเหลือ ${v.stock}`}
                    data-testid={`pos-variant-opt-${v.id}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {v.name?.trim() || attrLabel || v.sku || "ตัวเลือก"}
                    </div>
                    <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-2">
                      {v.sku && <span className="font-mono">SKU: {v.sku}</span>}
                      {v.barcode && <span className="font-mono">บาร์โค้ด: {v.barcode}</span>}
                      {attrLabel && v.name && <span>{attrLabel}</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold tabular-nums">฿{fmt(price)}</div>
                    <Badge
                      variant={sellable ? "secondary" : "outline"}
                      className={`text-[10px] ${sellable ? "" : "text-destructive border-destructive/40"}`}
                    >
                      {sellable ? `คงเหลือ ${v.stock}` : "หมด"}
                    </Badge>
                  </div>
                </label>
              </li>
            );
          })}
        </ul>

        <DialogFooter className="gap-2 sm:gap-2 shrink-0 border-t pt-3 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
          <Button variant="outline" onClick={onCancel} data-testid="pos-variant-cancel">
            ยกเลิก
          </Button>
          <Button
            onClick={confirm}
            disabled={!selected || !rows.find((r) => r.id === selected && isVariantSellable(r))}
            data-testid="pos-variant-confirm"
          >
            เพิ่มลงตะกร้า
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
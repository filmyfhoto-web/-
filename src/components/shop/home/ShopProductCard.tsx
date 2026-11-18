import { Package, Clock3, Zap, CheckCircle2, Plus } from "lucide-react";
import { fmtTHB } from "@/lib/format";
import { Button } from "@/components/ui/button";

export interface ShopCardProduct {
  id: string;
  name: string;
  image_url?: string | null;
  unit?: string | null;
  stock?: number | null;
  lead_time_days?: number | null;
  has_variants?: boolean | null;
}

/** ระยะเวลาผลิตโดยประมาณ (วัน) — ใช้ค่าจากสินค้า หรือประเมินจากสต๊อก */
export function leadTimeLabel(p: ShopCardProduct): string {
  const d = Number(p.lead_time_days ?? 0);
  if (d > 0) return `ผลิต ${d} วัน`;
  return Number(p.stock ?? 0) > 0 ? "รับได้ทันที" : "ผลิต 1-2 วัน";
}

export function isRush(p: ShopCardProduct): boolean {
  const d = Number(p.lead_time_days ?? 0);
  return d === 0 && Number(p.stock ?? 0) > 0;
}

export default function ShopProductCard({
  product,
  price,
  onAdd,
  highlighted,
}: {
  product: ShopCardProduct;
  price?: number | null;
  onAdd: () => void;
  highlighted?: boolean;
}) {
  const ready = Number(product.stock ?? 0) > 0 || !!product.has_variants;
  return (
    <article
      id={`product-card-${product.id}`}
      data-testid="shop-product-card"
      style={{ contentVisibility: "auto", containIntrinsicSize: "260px" } as any}
      className={`flex flex-col rounded-2xl border bg-card p-2 shadow-card transition hover:shadow-glow ${
        highlighted ? "border-primary ring-2 ring-primary/40" : "border-border"
      }`}
    >
      <div className="aspect-square rounded-xl bg-muted overflow-hidden mb-2 grid place-items-center">
        {product.image_url ? (
          <img src={product.image_url} alt={product.name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
        ) : (
          <Package className="w-7 h-7 text-primary/40" aria-hidden />
        )}
      </div>
      <h3 className="text-xs font-medium line-clamp-2 min-h-[2rem]">{product.name}</h3>
      <div className="mt-1 text-sm font-bold text-primary">
        {price != null && price > 0 ? `เริ่มต้น ${fmtTHB(price)}` : "ขอใบเสนอราคา"}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px]">
        <span className="inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-muted-foreground">
          <Clock3 className="w-3 h-3" aria-hidden /> {leadTimeLabel(product)}
        </span>
        {isRush(product) ? (
          <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 bg-[hsl(var(--champagne)/0.35)] text-[hsl(var(--champagne-foreground))]">
            <Zap className="w-3 h-3" aria-hidden /> งานด่วน
          </span>
        ) : ready ? (
          <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 bg-primary/10 text-primary">
            <CheckCircle2 className="w-3 h-3" aria-hidden /> พร้อมรับ
          </span>
        ) : null}
      </div>
      <Button
        type="button"
        size="sm"
        onClick={onAdd}
        aria-label={`เพิ่ม ${product.name} ลงตะกร้า`}
        className="mt-2 w-full min-h-11 rounded-xl bg-gradient-primary text-primary-foreground"
      >
        <Plus className="w-4 h-4 mr-1" aria-hidden /> เพิ่มลงตะกร้า
      </Button>
    </article>
  );
}

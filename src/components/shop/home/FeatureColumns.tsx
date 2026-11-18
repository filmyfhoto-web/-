import { Package, ChevronRight, Sparkles } from "lucide-react";
import {
  columnItems, resolveFeatureIcon, toneToken, visibleColumns,
  type FeatureColumnRow, type FeatureItemRow,
} from "@/lib/shopFeatureColumns";

/** รายการย่อยในคอลัมน์ หลังรวมข้อมูลที่แอดมินปักเองกับสินค้าจริงจากระบบ */
export interface FeatureEntry {
  id: string;
  title: string;
  subtitle?: string | null;
  image_url?: string | null;
  price_text?: string | null;
  badge_text?: string | null;
  link_url?: string | null;
}

export function toEntry(row: FeatureItemRow): FeatureEntry {
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    image_url: row.image_url,
    price_text: row.price_text,
    badge_text: row.badge_text,
    link_url: row.link_url,
  };
}

/**
 * “เมนูพิเศษ” 3 คอลัมน์ — การ์ดกระชับ หัวการ์ดแยกสีตามโทนของแต่ละคอลัมน์
 * มือถือเลื่อนแนวนอน / แท็บเล็ต–เดสก์ท็อปเรียง 3 คอลัมน์
 */
export default function FeatureColumns({
  columns,
  items,
  autoEntries,
  onPick,
  onViewAll,
}: {
  columns: FeatureColumnRow[];
  items: FeatureItemRow[];
  /** รายการอัตโนมัติจากสินค้าจริง แยกตาม auto_source */
  autoEntries?: Record<string, FeatureEntry[]>;
  onPick: (entry: FeatureEntry, column: FeatureColumnRow) => void;
  onViewAll: (column: FeatureColumnRow) => void;
}) {
  const cols = visibleColumns(columns);
  if (!cols.length) return null;

  return (
    <section aria-label="เมนูพิเศษ" data-testid="feature-columns" className="mb-5">
      <div className="mb-2 flex items-center gap-1.5">
        <Sparkles className="w-4 h-4 text-primary" aria-hidden />
        <h2 className="text-sm font-bold">เมนูพิเศษ</h2>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">คัดพิเศษ</span>
      </div>

      <div className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-2 snap-x scroll-smooth sm:grid sm:grid-cols-3 sm:gap-3 sm:overflow-visible">
        {cols.map((col) => {
          const token = toneToken(col.tone);
          const Icon = resolveFeatureIcon(col.icon_name);
          const own = columnItems(items, col.id).map(toEntry);
          const entries = own.length ? own : (autoEntries?.[String(col.auto_source)] ?? []).slice(0, 3);
          return (
            <article
              key={col.id}
              data-testid={`feature-column-${col.key}`}
              className="shrink-0 snap-start w-[72%] sm:w-auto rounded-2xl border bg-card shadow-card overflow-hidden flex flex-col"
              style={{ borderColor: `hsl(var(${token}) / 0.35)` }}
            >
              <header
                className="flex items-center gap-1.5 px-2.5 py-2"
                style={{ backgroundColor: `hsl(var(${token}) / 0.14)` }}
              >
                <span
                  className="w-6 h-6 rounded-full grid place-items-center shrink-0"
                  style={{ backgroundColor: `hsl(var(${token}) / 0.2)` }}
                >
                  <Icon className="w-3.5 h-3.5" style={{ color: `hsl(var(${token}))` }} aria-hidden />
                </span>
                <div className="min-w-0">
                  <h3 className="text-xs font-bold leading-tight truncate" style={{ color: `hsl(var(${token}))` }}>
                    {col.title}
                  </h3>
                  {col.subtitle && (
                    <p className="text-[10px] text-muted-foreground leading-tight truncate">{col.subtitle}</p>
                  )}
                </div>
              </header>

              <div className="flex-1 p-1.5 space-y-1">
                {entries.length === 0 ? (
                  <p
                    data-testid={`feature-empty-${col.key}`}
                    className="rounded-xl border border-dashed border-border px-2 py-4 text-center text-[10px] text-muted-foreground"
                  >
                    ยังไม่มีรายการในคอลัมน์นี้
                  </p>
                ) : (
                  entries.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      data-testid="feature-item"
                      onClick={() => onPick(e, col)}
                      className="w-full min-h-11 flex items-center gap-2 rounded-xl p-1 text-left transition hover:bg-accent"
                    >
                      <span className="w-9 h-9 shrink-0 rounded-lg bg-muted overflow-hidden grid place-items-center">
                        {e.image_url ? (
                          <img src={e.image_url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                        ) : (
                          <Package className="w-4 h-4 text-primary/40" aria-hidden />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11px] font-medium leading-tight line-clamp-1">{e.title}</span>
                        {e.subtitle && (
                          <span className="block text-[10px] text-muted-foreground leading-tight line-clamp-1">{e.subtitle}</span>
                        )}
                        <span className="mt-0.5 flex flex-wrap items-center gap-1">
                          {e.price_text && (
                            <span className="text-[10px] font-bold" style={{ color: `hsl(var(${token}))` }}>{e.price_text}</span>
                          )}
                          {e.badge_text && (
                            <span
                              className="rounded-full px-1.5 py-px text-[9px] font-semibold"
                              style={{ backgroundColor: `hsl(var(${token}) / 0.16)`, color: `hsl(var(${token}))` }}
                            >
                              {e.badge_text}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  ))
                )}
              </div>

              <button
                type="button"
                data-testid={`feature-viewall-${col.key}`}
                onClick={() => onViewAll(col)}
                className="min-h-11 w-full flex items-center justify-center gap-1 border-t text-[11px] font-semibold transition hover:brightness-95"
                style={{
                  borderColor: `hsl(var(${token}) / 0.25)`,
                  color: `hsl(var(${token}))`,
                  backgroundColor: `hsl(var(${token}) / 0.07)`,
                }}
              >
                ดูทั้งหมด <ChevronRight className="w-3.5 h-3.5" aria-hidden />
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

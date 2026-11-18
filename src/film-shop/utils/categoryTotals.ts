import type { ProductCategory } from '@/film-shop/hooks/useProductCategories';

export interface CategoryStat {
  total: number;
  count: number;
}

export type CategoryTotalsMap = Record<string, CategoryStat>;

interface AggregateOptions {
  posReceipts?: any[];
  invoices?: any[];
  startDate?: Date;
  endDate?: Date;
}

/**
 * Aggregate sales by category from POS receipts and invoices using a single source of truth.
 * Both sources expect items[].category to match category.key.
 */
export function aggregateByCategory(
  categories: ProductCategory[],
  { posReceipts = [], invoices = [], startDate, endDate }: AggregateOptions
): CategoryTotalsMap {
  const map: CategoryTotalsMap = {};
  categories.forEach(c => { map[c.key] = { total: 0, count: 0 }; });

  const inRange = (d: Date) => {
    if (startDate && d < startDate) return false;
    if (endDate && d > endDate) return false;
    return true;
  };

  posReceipts.forEach(r => {
    const date = new Date(r.receiptDate || r.receipt_date || r.createdAt || r.created_at);
    if (!inRange(date)) return;
    (r.items || []).forEach((it: any) => {
      const k = it.category;
      if (k && map[k]) {
        map[k].total += Number(it.total) || 0;
        map[k].count += 1;
      }
    });
  });

  invoices.forEach(i => {
    const date = new Date(i.documentDate || i.document_date || i.createdAt || i.created_at);
    if (!inRange(date)) return;
    (i.items || []).forEach((it: any) => {
      const k = it.category;
      if (k && map[k]) {
        map[k].total += Number(it.total) || 0;
        map[k].count += 1;
      }
    });
  });

  return map;
}

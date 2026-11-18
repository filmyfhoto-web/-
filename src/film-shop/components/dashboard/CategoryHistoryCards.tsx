import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAppData } from '@/film-shop/hooks/useAppData';
import { usePOSData } from '@/film-shop/hooks/usePOSData';
import { useProductCategories } from '@/film-shop/hooks/useProductCategories';
import { Layers } from 'lucide-react';

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 }).format(n || 0);

const formatDate = (d: Date) =>
  new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });

interface HistoryRow {
  id: string;
  source: 'pos' | 'invoice';
  number: string;
  customer: string;
  itemName: string;
  total: number;
  date: Date;
  status?: string;
}

export function CategoryHistoryCards() {
  const { invoices } = useAppData();
  const { receipts } = usePOSData();
  const { categories } = useProductCategories();

  // Build per-category history (latest 8)
  const perCategory = useMemo(() => {
    const map: Record<string, HistoryRow[]> = {};
    categories.forEach(c => { map[c.key] = []; });

    invoices.forEach(inv => {
      (inv.items || []).forEach(it => {
        const k = it.category;
        if (!k || !map[k]) return;
        map[k].push({
          id: `${inv.id}-${it.id}`,
          source: 'invoice',
          number: inv.invoiceNumber,
          customer: inv.customerName,
          itemName: it.name,
          total: Number(it.total) || 0,
          date: new Date(inv.documentDate || inv.createdAt),
          status: inv.status,
        });
      });
    });

    receipts.forEach(r => {
      (r.items || []).forEach((it: any) => {
        const k = it.category;
        if (!k || !map[k]) return;
        map[k].push({
          id: `${r.id}-${it.id || it.name}`,
          source: 'pos',
          number: r.receiptNumber,
          customer: r.customerName || '-',
          itemName: it.name,
          total: Number(it.total) || 0,
          date: new Date(r.receiptDate),
          status: r.paymentStatus,
        });
      });
    });

    Object.keys(map).forEach(k => {
      map[k].sort((a, b) => b.date.getTime() - a.date.getTime());
      map[k] = map[k].slice(0, 8);
    });
    return map;
  }, [invoices, receipts, categories]);

  const totals = useMemo(() => {
    const t: Record<string, { count: number; sum: number }> = {};
    categories.forEach(c => {
      const rows = perCategory[c.key] || [];
      t[c.key] = { count: rows.length, sum: rows.reduce((s, r) => s + r.total, 0) };
    });
    return t;
  }, [perCategory, categories]);

  const firstKey = categories[0]?.key || '';
  const [tab, setTab] = useState(firstKey);

  if (categories.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          ยังไม่มีประเภทสินค้า — เพิ่มได้ในเมนูตั้งค่า
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Layers className="h-4 w-4" />
          ประวัติแยกตามประเภทสินค้า
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={tab || firstKey} onValueChange={setTab}>
          <ScrollArea className="w-full">
            <TabsList className="flex w-max gap-1">
              {categories.map(cat => (
                <TabsTrigger key={cat.key} value={cat.key} className="gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-full border"
                    style={{ background: cat.color }}
                  />
                  {cat.name}
                  <Badge variant="secondary" className="ml-1">
                    {totals[cat.key]?.count || 0}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>
          </ScrollArea>

          {categories.map(cat => {
            const rows = perCategory[cat.key] || [];
            const sum = totals[cat.key]?.sum || 0;
            return (
              <TabsContent key={cat.key} value={cat.key} className="mt-4">
                <div
                  className="rounded-lg p-3 mb-3 flex items-center justify-between"
                  style={{ background: cat.color }}
                >
                  <div className="font-medium">{cat.name}</div>
                  <div className="text-sm">
                    <span className="text-foreground/70 mr-2">รวม</span>
                    <span className="font-bold">{formatCurrency(sum)}</span>
                  </div>
                </div>

                {rows.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    ยังไม่มีรายการในหมวดนี้
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[360px] overflow-y-auto">
                    {rows.map(r => (
                      <div
                        key={r.id}
                        className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-muted/50"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {r.source === 'pos' ? 'POS' : 'เอกสาร'}
                            </Badge>
                            <span className="font-medium truncate">{r.number}</span>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {r.itemName} · {r.customer}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-semibold">{formatCurrency(r.total)}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(r.date)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      </CardContent>
    </Card>
  );
}

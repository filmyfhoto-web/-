import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Boxes, RefreshCw, Maximize2, Minimize2, ExternalLink, PackageSearch, Gauge } from 'lucide-react';
import { POSProductManager } from '@/film-shop/components/pos/POSProductManager';

type Tab = 'full' | 'quick' | 'pos';

const SRC: Record<'full' | 'quick', string> = {
  full: '/admin/products',
  quick: '/admin/product-stock',
};

/**
 * สินค้า/สต๊อกใน Film Shop — แสดงระบบสต๊อกเต็มรูปแบบ (ฝัง /admin/products)
 * พร้อมสลับไปอัพเดตสต๊อกเร็ว และจัดการสินค้า/บริการ POS ได้ในหน้าเดียว
 */
export function EmbeddedStock() {
  const [tab, setTab] = useState<Tab>('full');
  const [nonce, setNonce] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [zen, setZen] = useState(false);
  const framed = tab === 'full' || tab === 'quick';
  const src = framed ? SRC[tab] : '';

  const switchTo = (t: Tab) => { setTab(t); setLoaded(false); };

  return (
    <div
      data-testid="film-embedded-stock"
      className={zen ? 'fixed inset-0 z-50 flex flex-col bg-background' : 'flex h-full min-h-[calc(100vh-8rem)] w-full flex-col bg-background'}
    >
      <div className="flex flex-wrap items-center gap-2 border-b bg-card px-3 py-2">
        <Button type="button" size="sm" variant={tab === 'full' ? 'default' : 'outline'} className="gap-1.5 rounded-full"
          aria-pressed={tab === 'full'} data-testid="film-stock-tab-full" onClick={() => switchTo('full')}>
          <Boxes className="h-4 w-4" /> สต๊อกเต็มรูปแบบ
        </Button>
        <Button type="button" size="sm" variant={tab === 'quick' ? 'default' : 'outline'} className="gap-1.5 rounded-full"
          aria-pressed={tab === 'quick'} data-testid="film-stock-tab-quick" onClick={() => switchTo('quick')}>
          <Gauge className="h-4 w-4" /> อัพเดตสต๊อกเร็ว
        </Button>
        <Button type="button" size="sm" variant={tab === 'pos' ? 'default' : 'outline'} className="gap-1.5 rounded-full"
          aria-pressed={tab === 'pos'} data-testid="film-stock-tab-pos" onClick={() => switchTo('pos')}>
          <PackageSearch className="h-4 w-4" /> สินค้า/บริการ POS
        </Button>
        <span className="ml-auto hidden items-center gap-1.5 text-[11px] font-semibold text-emerald-600 md:flex">● เรียลไทม์</span>
        {framed && (
          <>
            <Button type="button" size="sm" variant="ghost" className="gap-1.5" onClick={() => { setLoaded(false); setNonce((n) => n + 1); }}>
              <RefreshCw className="h-4 w-4" /> รีเฟรช
            </Button>
            <Button type="button" size="sm" variant="ghost" className="gap-1.5" onClick={() => setZen((z) => !z)}>
              {zen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />} {zen ? 'ย่อ' : 'เต็มจอ'}
            </Button>
            <Button type="button" size="sm" variant="ghost" className="gap-1.5" onClick={() => window.open(src, '_blank', 'noopener')}>
              <ExternalLink className="h-4 w-4" /> แท็บใหม่
            </Button>
          </>
        )}
      </div>

      <div className="relative min-h-0 flex-1 overflow-auto">
        {framed ? (
          <>
            <iframe
              key={`${tab}-${nonce}`}
              title="ระบบสต๊อกสินค้า"
              src={src}
              onLoad={() => setLoaded(true)}
              className="absolute inset-0 h-full w-full border-0 bg-card"
            />
            {!loaded && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-muted-foreground">
                กำลังเปิดระบบสต๊อก…
              </div>
            )}
          </>
        ) : (
          <POSProductManager />
        )}
      </div>
    </div>
  );
}

export default EmbeddedStock;

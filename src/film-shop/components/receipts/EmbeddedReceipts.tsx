import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Receipt, Printer, RefreshCw, Maximize2, Minimize2, ExternalLink, Plus, Mic, FileText, ArrowLeft } from 'lucide-react';
import { DocCommandWorkspace } from '@/film-shop/components/commands/DocCommandWorkspace';

const loadInvoiceManager = () =>
  import('@/film-shop/components/invoices/InvoiceManager').then((m) => ({ default: m.InvoiceManager }));

const InvoiceManager = lazy(loadInvoiceManager);

// พรีโหลดโมดูลไว้ล่วงหน้า (hover/แตะค้าง) เพื่อให้กดแล้วเปิดทันที
let invoicesPrefetched = false;
const prefetchInvoices = () => {
  if (invoicesPrefetched) return;
  invoicesPrefetched = true;
  void loadInvoiceManager();
};

type Slug = 'colorlab' | 'printing';

const TABS: { slug: Slug; label: string; short: string; icon: typeof Receipt }[] = [
  { slug: 'colorlab', label: 'นัฐภรณ์ คัลเลอร์แล็ป', short: 'คัลเลอร์แล็ป', icon: Receipt },
  { slug: 'printing', label: 'นัฐภรณ์ การพิมพ์', short: 'การพิมพ์', icon: Printer },
];

/**
 * Receipt & Delivery ของทั้ง 2 ร้าน แบบเต็มจอ (เหลือแค่แถบข้าง)
 * ทั้ง 2 ร้านถูก mount ค้างไว้ทั้งคู่ การสลับร้านจึงทันที ไม่โหลดใหม่
 * และมี auto-refresh เมื่อกลับมาโฟกัสหน้าจอ เพื่อให้ข้อมูลเรียลไทม์
 */
export function EmbeddedReceipts({
  sub = 'dashboard', initialSlug = 'colorlab', lockSlug = false,
}: { sub?: 'dashboard' | 'documents'; initialSlug?: Slug; lockSlug?: boolean }) {
  const [slug, setSlug] = useState<Slug>(initialSlug);
  const [pane, setPane] = useState<'shop' | 'voice' | 'invoices'>('shop');
  const [view, setView] = useState<'dashboard' | 'documents'>(sub);
  const voice = pane === 'voice';
  const invoices = pane === 'invoices';
  const pathFor = (s: Slug) => `/receipts/${s}/${view}`;
  const [nonce, setNonce] = useState<Record<Slug, number>>({ colorlab: 0, printing: 0 });
  const [loaded, setLoaded] = useState<Record<Slug, boolean>>({ colorlab: false, printing: false });
  // โหลดเฉพาะร้านที่กำลังดู แล้วค่อยแอบโหลดอีกร้านตอนว่าง — เปิดหน้าเร็วขึ้นมาก
  const [mounted, setMounted] = useState<Record<Slug, boolean>>({ colorlab: true, printing: false });
  const [zen, setZen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const bump = (s: Slug) => setNonce((n) => ({ ...n, [s]: n[s] + 1 }));

  useEffect(() => { setView(sub); }, [sub]);

  // เปลี่ยนมุมมอง = iframe โหลดใหม่ ต้องรีเซ็ตสถานะโหลด
  useEffect(() => { setLoaded({ colorlab: false, printing: false }); }, [view]);

  // เปิดร้านไหน ให้ mount ร้านนั้นทันที
  useEffect(() => {
    setMounted((m) => (m[slug] ? m : { ...m, [slug]: true }));
  }, [slug]);

  // พรีโหลดอีกร้านหลังร้านแรกโหลดเสร็จ (ตอนเบราว์เซอร์ว่าง)
  useEffect(() => {
    if (!loaded[slug]) return;
    const other = TABS.find((t) => t.slug !== slug)!.slug;
    if (mounted[other]) return;
    const ric: typeof window.requestIdleCallback | undefined = (window as any).requestIdleCallback;
    const run = () => setMounted((m) => ({ ...m, [other]: true }));
    const id = ric ? ric(run, { timeout: 4000 }) : window.setTimeout(run, 1500);
    return () => {
      if (ric && (window as any).cancelIdleCallback) (window as any).cancelIdleCallback(id);
      else window.clearTimeout(id as number);
    };
  }, [loaded, slug, mounted]);

  // เรียลไทม์: รีเฟรชร้านที่กำลังดูอยู่อัตโนมัติเมื่อกลับมาที่แท็บ
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === 'visible') bump(slug); };
    document.addEventListener('visibilitychange', onFocus);
    return () => document.removeEventListener('visibilitychange', onFocus);
  }, [slug]);

  return (
    <div
      ref={wrapRef}
      data-testid="film-embedded-receipts"
      className={
        zen
          ? 'fixed inset-0 z-50 flex flex-col bg-background'
          : 'flex h-full min-h-0 w-full flex-col bg-background'
      }
    >
      <div className="flex flex-wrap items-center gap-2 border-b bg-card px-3 py-2">
        {TABS.filter((t) => !lockSlug || t.slug === slug).map((t) => {
          const Icon = t.icon;
          const active = slug === t.slug;
          return (
            <Button
              key={t.slug}
              type="button"
              size="sm"
              variant={active && pane === 'shop' ? 'default' : 'outline'}
              className="gap-1.5 rounded-full"
              onClick={() => { setSlug(t.slug); setPane('shop'); }}
              data-testid={`receipts-tab-${t.slug}`}
              aria-pressed={active && pane === 'shop'}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{t.label}</span>
              <span className="sm:hidden">{t.short}</span>
            </Button>
          );
        })}
        {!lockSlug && (
        <Button
          type="button"
          size="sm"
          variant={invoices ? 'default' : 'outline'}
          className="gap-1.5 rounded-full"
          data-testid="receipts-tab-filmshop"
          aria-pressed={invoices}
          onMouseEnter={prefetchInvoices}
          onTouchStart={prefetchInvoices}
          onFocus={prefetchInvoices}
          onClick={() => setPane((p) => (p === 'invoices' ? 'shop' : 'invoices'))}
        >
          <FileText className="h-4 w-4" />
          <span className="hidden sm:inline">FILM SHOP ใบเสร็จ</span>
          <span className="sm:hidden">FILM SHOP</span>
        </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant={voice ? 'default' : 'outline'}
          className="gap-1.5 rounded-full"
          data-testid="receipts-tab-voice"
          aria-pressed={voice}
          onClick={() => setPane((p) => (p === 'voice' ? 'shop' : 'voice'))}
        >
          <Mic className="h-4 w-4" />
          <span className="hidden sm:inline">ออกเอกสารด้วยเสียง</span>
          <span className="sm:hidden">เสียง</span>
        </Button>
        <span className="ml-auto hidden items-center gap-1.5 text-[11px] font-semibold text-emerald-600 md:flex">
          ● เรียลไทม์
        </span>
        <Button type="button" size="sm" variant="ghost" className="gap-1.5" disabled={pane !== 'shop'} onClick={() => bump(slug)}>
          <RefreshCw className="h-4 w-4" /> รีเฟรช
        </Button>
        <Button type="button" size="sm" variant="ghost" className="gap-1.5" onClick={() => setZen((z) => !z)}>
          {zen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />} {zen ? 'ย่อ' : 'เต็มจอ'}
        </Button>
        {view === 'documents' && pane === 'shop' && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5 rounded-full"
            data-testid="film-documents-new"
            onClick={() => window.open(`/receipts/${slug}/documents/new`, '_blank', 'noopener')}
          >
            <Plus className="h-4 w-4" /> สร้างเอกสารใหม่
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="gap-1.5"
          disabled={pane !== 'shop'}
          onClick={() => window.open(pathFor(slug), '_blank', 'noopener')}
        >
          <ExternalLink className="h-4 w-4" /> แท็บใหม่
        </Button>
      </div>

      {voice ? (
        <div className="min-h-0 flex-1 overflow-auto p-3" data-testid="receipts-voice-doc">
          <p className="mb-3 text-xs text-muted-foreground">
            พูดหรือพิมพ์คำสั่งเพื่อออก <strong>ใบเสร็จรับเงิน</strong> ของ
            {' '}{TABS.find((t) => t.slug === slug)?.label} — ระบบจะสร้างเป็นฉบับร่างก่อนเสมอ ต้องกดยืนยันจึงออกเลขเอกสารจริง
          </p>
          <DocCommandWorkspace
            key={slug}
            initialShopKey={slug}
            initialDocType="receipt"
            docTypeOptions={['receipt']}
          />
        </div>
      ) : invoices ? (
        <div className="min-h-0 flex-1 overflow-auto p-3" data-testid="receipts-filmshop-invoices">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mb-3 gap-1.5 rounded-full"
            data-testid="receipts-invoices-back"
            onClick={() => setPane('shop')}
          >
            <ArrowLeft className="h-4 w-4" /> กลับไป Receipt &amp; Delivery
          </Button>
          <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">กำลังเปิดใบเสร็จ…</div>}>
            <InvoiceManager />
          </Suspense>
        </div>
      ) : (
      <div className="relative min-h-0 flex-1">
        {TABS.filter((t) => mounted[t.slug] && (!lockSlug || t.slug === slug)).map((t) => (
          <iframe
            key={`${t.slug}-${view}-${nonce[t.slug]}`}
            title={`Receipt and Delivery ${t.slug}`}
            src={`/receipts/${t.slug}/${view}`}
            loading="eager"
            onLoad={() => setLoaded((l) => ({ ...l, [t.slug]: true }))}
            className={`absolute inset-0 h-full w-full border-0 bg-card ${slug === t.slug ? 'block' : 'hidden'}`}
          />
        ))}
        {!loaded[slug] && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-muted-foreground">
            กำลังเปิดหน้าร้าน…
          </div>
        )}
      </div>
      )}
    </div>
  );
}

export default EmbeddedReceipts;

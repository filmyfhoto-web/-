import { useState } from 'react';
import { FileText, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { GROUPS } from '@/film-shop/lib/groups';
import { GroupShell } from '@/film-shop/components/hub/GroupShell';
import { EmbeddedReceipts } from '@/film-shop/components/receipts/EmbeddedReceipts';

type Slug = 'colorlab' | 'printing';

/** กลุ่มร้าน (คัลเลอร์แล็ปสีส้ม / การพิมพ์สีเขียว) — เห็นเฉพาะงานและเอกสารของร้านตัวเอง */
export function ShopGroupPage({ slug, onHome }: { slug: Slug; onHome: () => void }) {
  const [view, setView] = useState<'dashboard' | 'documents'>('dashboard');
  const g = GROUPS[slug];

  return (
    <GroupShell group={slug} onHome={onHome}>
      <div className="grid grid-cols-2 gap-2" data-testid={`shop-group-tabs-${slug}`}>
        {([
          { key: 'dashboard' as const, label: 'หน้าร้าน / รับงาน', icon: Store },
          { key: 'documents' as const, label: 'เอกสารที่บันทึกไว้', icon: FileText },
        ]).map((t) => (
          <Button
            key={t.key}
            type="button"
            variant={view === t.key ? 'default' : 'outline'}
            className={cn('h-12 rounded-xl text-sm font-semibold', view === t.key && g.solid)}
            onClick={() => setView(t.key)}
          >
            <t.icon className="mr-1.5 h-4 w-4" /> {t.label}
          </Button>
        ))}
      </div>

      <div className={cn('h-[calc(100vh-19rem)] min-h-[26rem] overflow-hidden rounded-2xl border', g.border)}>
        <EmbeddedReceipts key={`${slug}-${view}`} sub={view} initialSlug={slug} lockSlug />
      </div>
    </GroupShell>
  );
}

import { useState } from 'react';
import { FileText, Receipt, Wand2 } from 'lucide-react';
import { GROUPS } from '@/film-shop/lib/groups';
import { GroupShell, GroupTile } from '@/film-shop/components/hub/GroupShell';
import { DocumentWizard } from '@/film-shop/components/documents/DocumentWizard';
import { DocHelperSheet } from '@/film-shop/components/documents/DocHelperSheet';
import { InvoiceManager } from '@/film-shop/components/invoices/InvoiceManager';
import type { Invoice } from '@/film-shop/types';

type Pane =
  | { kind: 'menu' }
  | { kind: 'wizard' }
  | { kind: 'documents'; previewId?: string };

/** กลุ่ม Film Shop (น้ำเงินเข้ม) — ออกใบเสร็จเท่านั้น */
export function FilmShopGroupPage({ onHome }: { onHome: () => void }) {
  const g = GROUPS.filmshop;
  const [pane, setPane] = useState<Pane>({ kind: 'menu' });
  const [helper, setHelper] = useState<{ open: boolean; source?: Invoice }>({ open: false });

  const backToMenu = () => setPane({ kind: 'menu' });

  const body = () => {
    if (pane.kind === 'wizard') {
      return (
        <DocumentWizard
          mode="receipt"
          onCancel={backToMenu}
          onIssued={(id) => setPane({ kind: 'documents', previewId: id })}
        />
      );
    }

    if (pane.kind === 'documents') {
      return (
        <InvoiceManager
          key={pane.previewId ?? 'docs'}
          initialPreviewInvoiceId={pane.previewId}
          headingLabel="ใบเสร็จที่บันทึกไว้"
        />
      );
    }

    return (
      <div className="grid gap-3 sm:grid-cols-2" data-testid="filmshop-menu">
        <GroupTile group="filmshop" icon={Receipt} label="ออกใบเสร็จ" description="ผู้ช่วยทีละขั้น"
          testId="fs-menu-receipt" onClick={() => setPane({ kind: 'wizard' })} />
        <GroupTile group="filmshop" icon={FileText} label="ใบเสร็จที่บันทึกไว้" description="ดูตัวอย่าง พิมพ์ PDF/PNG"
          testId="fs-menu-documents" onClick={() => setPane({ kind: 'documents' })} />
        <GroupTile group="filmshop" icon={Wand2} label="ช่วยสร้างใบเสร็จ" description="ตอบคำถามในป๊อปอัปหน้าเดียว (เหมาะกับมือถือ)"
          testId="fs-menu-doc-helper" onClick={() => setHelper({ open: true })} />
      </div>
    );
  };

  return (
    <GroupShell
      group="filmshop"
      onHome={onHome}
      onBack={pane.kind === 'menu' ? undefined : backToMenu}
    >
      {body()}
      <DocHelperSheet
        open={helper.open}
        source={helper.source}
        onOpenChange={(v) => setHelper((h) => ({ ...h, open: v }))}
        onIssued={(id) => { setHelper({ open: false }); setPane({ kind: 'documents', previewId: id }); }}
      />
    </GroupShell>
  );
}

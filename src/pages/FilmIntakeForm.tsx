/**
 * หน้าแบบฟอร์ม “รับงานใหม่” ที่เปิดจากปุ่มในกลุ่ม LINE
 * สิทธิ์มาจาก token อายุสั้นในลิงก์เท่านั้น (ไม่ต้องล็อกอิน)
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import QueueIntakeWizard from '@/film-shop/components/queue/QueueIntakeWizard';
import { resolveIntakeToken } from '@/film-shop/lib/intakeFormApi';
import type { ExtractedIntake } from '@/film-shop/lib/fileIntakeExtract';

export default function FilmIntakeForm() {
  const [params] = useSearchParams();
  const token = params.get('t') ?? '';
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [storeLabel, setStoreLabel] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<ExtractedIntake | null>(null);

  useEffect(() => {
    document.title = 'รับงานใหม่ | FILM SHOP';
    let alive = true;
    if (!token) { setState('error'); return; }
    resolveIntakeToken(token)
      .then((info) => {
        if (!alive) return;
        setStoreLabel(info.store_label);
        setPrefill((info.prefill as ExtractedIntake | null) ?? null);
        setState('ok');
      })
      .catch(() => { if (alive) setState('error'); });
    return () => { alive = false; };
  }, [token]);

  if (state === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (state === 'error') {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-2 p-6 text-center">
        <h1 className="text-lg font-semibold">ลิงก์หมดอายุ</h1>
        <p className="text-sm text-muted-foreground">กรุณาพิมพ์ “สั่งงาน” ในกลุ่ม LINE อีกครั้งเพื่อรับลิงก์ใหม่ค่ะ</p>
      </main>
    );
  }
  return (
    <main className="mx-auto flex h-[100dvh] max-w-md flex-col bg-background">
      <h1 className="sr-only">รับงานใหม่ FILM SHOP</h1>
      <QueueIntakeWizard token={token} storeLabel={storeLabel} prefill={prefill} />
    </main>
  );
}

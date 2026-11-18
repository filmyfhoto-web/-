import WorkspaceLinksCard from '@/components/admin/WorkspaceLinksCard';
import PwaCacheResetCard from '@/components/PwaCacheResetCard';
import ShareInstallBar from '@/components/ShareInstallBar';
import InstallAppCard from '@/components/InstallAppCard';

/** ลิงก์เว็บแอป — ย้ายมาจากแอปแอดมิน ใช้งานในหน้า Film Shop ได้เลย */
export function FilmAppLinksPage() {
  return (
    <div className="max-w-3xl space-y-6" data-testid="film-app-links">
      <header>
        <p className="text-sm text-muted-foreground">เปิดหรือคัดลอกลิงก์เพื่อบันทึกแต่ละแอปไว้บนหน้าจอโฮม</p>
        <ShareInstallBar className="mt-3" />
      </header>
      <InstallAppCard app="admin" />
      <p className="text-sm text-muted-foreground">
        ต้องติดตั้งบนเครื่องอื่น? เปิด{' '}
        <a className="font-medium underline" href="/install/admin">/install/admin</a>{' '}
        บนอุปกรณ์นั้น (มีคิวอาร์โค้ดและวิธีติดตั้งครบทุกระบบ)
      </p>
      <WorkspaceLinksCard />
      <section className="rounded-lg border border-border bg-card p-4" data-testid="quick-doc-link-card">
        <h2 className="font-semibold text-foreground">ออกเอกสารด่วน</h2>
        <p className="mt-1 text-sm text-muted-foreground">ออกใบเสร็จและใบสั่งจ้างจากรายการด่วนในไม่กี่คลิก</p>
        <a
          className="mt-3 inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
          href="/film-shop/app?p=quick-doc"
        >
          เปิดหน้าออกเอกสารด่วน
        </a>
      </section>
      <PwaCacheResetCard />
    </div>
  );
}

export default FilmAppLinksPage;

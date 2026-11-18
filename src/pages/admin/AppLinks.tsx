import AdminLayout from "@/components/layout/AdminLayout";
import SeoHead from "@/components/SeoHead";
import WorkspaceLinksCard from "@/components/admin/WorkspaceLinksCard";
import PosLinksCard from "@/components/admin/PosLinksCard";
import PwaCacheResetCard from "@/components/PwaCacheResetCard";
import ShareInstallBar from "@/components/ShareInstallBar";
import InstallAppCard from "@/components/InstallAppCard";

/** หน้ารวม “ลิงก์เว็บแอป” ของทุกแอปในระบบ */
export default function AppLinks() {
  return (
    <AdminLayout>
      <SeoHead title="ลิงก์เว็บแอป" description="รวมลิงก์เว็บแอปลูกค้า พนักงาน แอดมิน POS และระบบออกเอกสาร" path="/admin/app-links" />
      <div className="space-y-6 max-w-3xl">
        <header>
          <h1 className="text-2xl font-bold">ลิงก์เว็บแอป</h1>
          <p className="text-sm text-muted-foreground">เปิดหรือคัดลอกลิงก์เพื่อบันทึกแต่ละแอปไว้บนหน้าจอโฮม</p>
          <ShareInstallBar className="mt-3" />
        </header>
        <InstallAppCard app="admin" />
        <p className="text-sm text-muted-foreground">
          ต้องติดตั้งบนเครื่องอื่น? เปิด{" "}
          <a className="underline font-medium" href="/install/admin">/install/admin</a>{" "}
          บนอุปกรณ์นั้น (มีคิวอาร์โค้ดและวิธีติดตั้งครบทุกระบบ)
        </p>
        <WorkspaceLinksCard />
        <PosLinksCard />
        <PwaCacheResetCard />
      </div>
    </AdminLayout>
  );
}

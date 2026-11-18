import { Badge } from "@/components/ui/badge";
import { BUILD_INFO, buildLabel, formatThaiDateTime, isCurrentBuild } from "@/lib/buildInfo";

/**
 * "ข้อมูลระบบ" — version, last update and a short build id for support.
 * All values come from the shared build-info source, never typed by hand.
 */
export default function SystemInfoCard() {
  const latest = isCurrentBuild();
  return (
    <section className="rounded-2xl border bg-card p-4 space-y-3" data-testid="system-info">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="font-semibold text-sm">ข้อมูลระบบ</h2>
        {latest && (
          <Badge variant="secondary" className="rounded-md" data-testid="build-latest-badge">
            เวอร์ชันล่าสุด
          </Badge>
        )}
      </div>
      <dl className="grid gap-2 sm:grid-cols-3 text-sm">
        <div className="space-y-0.5">
          <dt className="text-xs text-muted-foreground">เวอร์ชันแอป</dt>
          <dd className="font-medium" data-testid="build-version">v{BUILD_INFO.version}</dd>
        </div>
        <div className="space-y-0.5">
          <dt className="text-xs text-muted-foreground">อัปเดตล่าสุด</dt>
          <dd className="font-medium break-words" data-testid="build-updated-at">
            {formatThaiDateTime(BUILD_INFO.builtAt)}
          </dd>
        </div>
        <div className="space-y-0.5">
          <dt className="text-xs text-muted-foreground">รหัสบิลด์ (สำหรับแจ้งปัญหา)</dt>
          <dd className="font-mono text-xs break-all" data-testid="build-id">{buildLabel()}</dd>
        </div>
      </dl>
    </section>
  );
}
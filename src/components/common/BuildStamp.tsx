import { BUILD_INFO, buildLabel, envLabel, formatThaiDateTime } from "@/lib/buildInfo";

/**
 * Always-visible build stamp: version + last update time + build id.
 * Rendered on both the customer site and the admin shell so anyone can
 * confirm at a glance whether they are on the newest deploy.
 */
export default function BuildStamp({ className = "" }: { className?: string }) {
  const updated = formatThaiDateTime(BUILD_INFO.builtAt);
  return (
    <div
      data-testid="build-stamp"
      data-build-version={BUILD_INFO.version}
      data-build-commit={BUILD_INFO.commit}
      data-build-env={BUILD_INFO.env}
      title={`build ${buildLabel()} · ${BUILD_INFO.builtAt}`}
      className={`text-[11px] text-muted-foreground/80 tabular-nums ${className}`}
    >
      <span data-testid="build-stamp-version">เวอร์ชัน v{BUILD_INFO.version}</span>
      <span aria-hidden> · </span>
      <span data-testid="build-stamp-updated">อัปเดต {updated}</span>
      <span aria-hidden> · </span>
      <span data-testid="build-stamp-env">{envLabel()}</span>
      <span aria-hidden> · </span>
      <span className="font-mono" data-testid="build-stamp-id">{BUILD_INFO.commit}</span>
    </div>
  );
}
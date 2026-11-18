/**
 * `/diagnostics` — read-only support page.
 *
 * Answers the two questions that cost the most time when a phone "behaves
 * weird": *where would each app link send me right now* and *which build /
 * service-worker state is actually loaded*. No secrets, no writes.
 */
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getHostMode, resolveHostRedirect } from "@/lib/hostMode";
import { launchTarget } from "@/lib/launchTarget";
import { resolveRoleHome } from "@/lib/roleHome";
import { currentPwaApp, PWA_APPS, type PwaApp } from "@/lib/pwaManifest";
import { BUILD_INFO, envLabel, formatThaiDateTime } from "@/lib/buildInfo";
import { runSystemHealth, type Probe } from "@/lib/systemHealth";
import { RUNNING_TAG, useBuildUpdate } from "@/lib/buildUpdate";
import { readSwCacheStatus, refreshAppAssets, forceUpdateApp, type SwCacheStatus } from "@/lib/appUpdate";
import { readPwaLog, formatPwaLog, clearPwaLog, isStandaloneDisplay, isInAppBrowserUA } from "@/lib/pwaDiagnostics";
import { RefreshCw, ShieldAlert, Copy, Trash2 } from "lucide-react";
import NavLoopCard from "@/components/admin/NavLoopCard";

const APPS: PwaApp[] = ["customer", "staff", "admin", "pos", "receipts", "film-shop"];
const APP_LABEL: Record<PwaApp, string> = {
  customer: "ลูกค้า",
  staff: "พนักงาน",
  pos: "POS หน้าร้าน",
  admin: "เจ้าของ / แอดมิน",
  receipts: "Receipt & Delivery",
  "film-shop": "Film Shop",
};

export default function Diagnostics() {
  const { pathname } = useLocation();
  const { loading, session, roles, isOwner, isAdmin, isStaffAny, hasPerm } = useAuth();
  const { remoteTag, checkedAt, hasUpdate } = useBuildUpdate();
  const [sw, setSw] = useState<SwCacheStatus | null>(null);
  const [log, setLog] = useState(() => readPwaLog());
  const [copied, setCopied] = useState(false);
  const [health, setHealth] = useState<Probe[] | null>(null);
  const [healthBusy, setHealthBusy] = useState(false);

  const runHealth = useCallback(async () => {
    setHealthBusy(true);
    try { setHealth(await runSystemHealth()); } finally { setHealthBusy(false); }
  }, []);
  useEffect(() => { void runHealth(); }, [runHealth]);

  const load = useCallback(async () => {
    setSw(await readSwCacheStatus());
    setLog(readPwaLog());
  }, []);
  useEffect(() => { void load(); }, [load]);

  const mode = getHostMode();
  const role = {
    signedIn: !!session,
    isOwner,
    isAdmin,
    isStaffAny,
    canPos: hasPerm("pos"),
    canStock: hasPerm("stock"),
  };
  const roleHome = resolveRoleHome({ ...role, isCustomer: !!session });
  const installedApp = currentPwaApp();

  const report = () => [
    `build ${RUNNING_TAG} (${formatThaiDateTime(BUILD_INFO.builtAt)})`,
    `remote ${remoteTag ?? "-"} update=${hasUpdate}`,
    `host ${typeof location !== "undefined" ? location.hostname : "-"} mode=${mode} app=${installedApp}`,
    `signedIn=${!!session} roles=${roles.join(",") || "-"} home=${roleHome}`,
    ...APPS.map((a) => `launch ${a} → ${launchTarget(a, role)}`),
    `sw=${sw?.registrations.length ?? 0} controlled=${sw?.controlled} caches=${sw?.caches.length ?? 0} standalone=${isStandaloneDisplay()}`,
    "",
    formatPwaLog(log),
  ].join("\n");

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4 pb-24">
      <header className="space-y-1">
        <h1 className="text-xl font-bold">หน้าวินิจฉัยระบบ</h1>
        <p className="text-sm text-muted-foreground">
          ใช้ตรวจว่าแต่ละลิงก์แอปจะพาไปหน้าไหน และแอปโหลดเวอร์ชันอะไรอยู่
        </p>
      </header>

      <Card title="สถานะการเชื่อมต่อระบบ" testid="diag-health">
        <ul className="space-y-1 text-sm" data-testid="diag-health-list">
          {(health ?? []).map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3" data-testid={`diag-health-${p.id}`}>
              <span className="text-muted-foreground">{p.label}</span>
              <span className="font-bold" data-health-state={p.state}>
                {p.state === "ok" ? "✅" : p.state === "warn" ? "⚠️" : "❌"} {p.detail}
                {typeof p.ms === "number" && <span className="ml-1 text-[11px] font-normal">({p.ms} ms)</span>}
              </span>
            </li>
          ))}
          {!health && <li className="text-sm text-muted-foreground">กำลังตรวจ…</li>}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void runHealth()}
            disabled={healthBusy}
            data-testid="diag-health-recheck"
            className="rounded-lg border px-3 py-1.5 text-xs font-bold"
          >
            {healthBusy ? "กำลังตรวจ…" : "ตรวจอีกครั้ง"}
          </button>
          <Link to="/diagnostics/routes" className="rounded-lg border px-3 py-1.5 text-xs font-bold" data-testid="diag-routes-link">
            ตรวจเมนู/เส้นทางทั้งหมด
          </Link>
        </div>
      </Card>

      <Card title="เส้นทางที่จะถูก redirect ไป" testid="diag-routes">
        {loading ? (
          <p className="text-sm text-muted-foreground">กำลังโหลดสิทธิ์…</p>
        ) : (
          <ul className="space-y-1 text-sm" data-testid="diag-launch-list">
            {APPS.map((a) => (
              <li key={a} className="flex items-center justify-between gap-3" data-testid={`diag-launch-${a}`}>
                <span className="text-muted-foreground">
                  {APP_LABEL[a]} <span className="text-[11px]">({PWA_APPS[a]?.label ?? a})</span>
                </span>
                <code className="font-bold">{launchTarget(a, role)}</code>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 grid gap-1 border-t pt-3 text-sm">
          <Row label="โหมดโดเมน (host)" value={mode} testid="diag-host-mode" />
          <Row label="แอปที่กำลังเปิด" value={installedApp} testid="diag-current-app" />
          <Row label="หน้าแรกตามสิทธิ์" value={roleHome} testid="diag-role-home" />
          <Row label="host gate ของหน้านี้" value={resolveHostRedirect(mode, pathname) ?? "ไม่เปลี่ยนเส้นทาง"} />
          <Row label="เข้าสู่ระบบแล้ว" value={session ? "ใช่" : "ไม่"} testid="diag-signed-in" />
          <Row label="บทบาท" value={roles.join(", ") || "-"} testid="diag-roles" />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {APPS.map((a) => (
            <Link
              key={a}
              to={`/launch?app=${a}`}
              className="rounded-lg border px-3 py-1.5 text-xs font-bold"
            >
              เปิด {APP_LABEL[a]}
            </Link>
          ))}
        </div>
      </Card>

      <Card title="สถานะการโหลดแอปล่าสุด" testid="diag-build">
        <div className="grid gap-1 text-sm">
          <Row label="เวอร์ชันที่ใช้อยู่" value={`v${BUILD_INFO.version}`} testid="diag-version" />
          <Row label="สภาพแวดล้อม" value={envLabel()} testid="diag-env" />
          <Row label="build tag" value={RUNNING_TAG} testid="diag-build-tag" />
          <Row label="สร้างเมื่อ" value={formatThaiDateTime(BUILD_INFO.builtAt)} />
          <Row label="เวอร์ชันบนเซิร์ฟเวอร์" value={remoteTag ?? "ตรวจไม่ได้ (dev/ออฟไลน์)"} testid="diag-remote-tag" />
          <Row label="ตรวจล่าสุด" value={checkedAt ? checkedAt.toLocaleTimeString("th-TH") : "-"} />
          <Row label="สถานะ" value={hasUpdate ? "⚠️ มีเวอร์ชันใหม่" : "✅ ล่าสุดแล้ว"} testid="diag-update-state" />
          <Row label="โหมดแอปติดตั้ง" value={isStandaloneDisplay() ? "PWA" : "เบราว์เซอร์"} />
          <Row label="เบราว์เซอร์ในแอป (LINE ฯลฯ)" value={isInAppBrowserUA() ? "ใช่" : "ไม่"} />
          <Row
            label="Service Worker"
            testid="diag-sw"
            value={
              !sw?.supported ? "ไม่รองรับ"
                : sw.registrations.length === 0 ? "ไม่มี (โหลดตรงจากเซิร์ฟเวอร์)"
                : `${sw.registrations.length} ตัว · ${sw.controlled ? "กำลังควบคุมหน้านี้" : "ยังไม่ควบคุม"}`
            }
          />
          <Row label="แคช" value={`${sw?.caches.length ?? 0} ชุด`} testid="diag-caches" />
        </div>
        <div className="mt-3 space-y-2">
          <button
            type="button"
            onClick={() => void refreshAppAssets()}
            data-testid="diag-refresh"
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary font-bold text-primary-foreground"
          >
            <RefreshCw className="h-4 w-4" aria-hidden /> โหลดเวอร์ชันล่าสุด
          </button>
          <button
            type="button"
            onClick={() => void forceUpdateApp()}
            data-testid="diag-force-update"
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-destructive font-black text-destructive-foreground"
          >
            <ShieldAlert className="h-4 w-4" aria-hidden /> บังคับอัปเดต (ล้าง SW + แคช)
          </button>
          <button type="button" onClick={() => void load()} className="min-h-11 w-full rounded-lg border font-bold">
            ตรวจสถานะอีกครั้ง
          </button>
        </div>
      </Card>

      <Card title={`บันทึกเหตุการณ์ PWA (${log.length})`} testid="diag-log">
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-2 text-[11px]">
          {formatPwaLog(log) || "ยังไม่มีบันทึก"}
        </pre>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            data-testid="diag-copy"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(report());
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              } catch { /* clipboard blocked */ }
            }}
            className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg border font-bold"
          >
            <Copy className="h-4 w-4" aria-hidden /> {copied ? "คัดลอกแล้ว" : "คัดลอกรายงาน"}
          </button>
          <button
            type="button"
            onClick={() => { clearPwaLog(); setLog([]); }}
            className="flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 font-bold"
          >
            <Trash2 className="h-4 w-4" aria-hidden /> ล้าง
          </button>
        </div>
      </Card>

      <NavLoopCard />
    </main>
  );
}

function Card({ title, testid, children }: { title: string; testid?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-4" data-testid={testid}>
      <h2 className="mb-3 text-sm font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value, testid }: { label: string; value: string; testid?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="break-all text-right font-bold" data-testid={testid}>{value}</dd>
    </div>
  );
}
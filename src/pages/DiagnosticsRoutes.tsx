/**
 * `/diagnostics/routes` — menu & route audit.
 *
 * Renders the real nav registry (the same paths the layouts link to) and the
 * result of each check: does the page exist, does it redirect to a legacy
 * screen, is it duplicated, does it loop.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { checkNavEntries, type NavCheck, type NavSurface } from "@/lib/routeRegistry";
import { BUILD_INFO, envLabel, formatThaiDateTime } from "@/lib/buildInfo";

const SURFACES: { id: NavSurface; label: string }[] = [
  { id: "customer", label: "เมนูลูกค้า" },
  { id: "admin", label: "เมนูแอดมิน" },
  { id: "shared", label: "เมนูที่ใช้ร่วมกัน" },
];

export default function DiagnosticsRoutes() {
  const [device, setDevice] = useState<"all" | "desktop" | "mobile">("all");
  const checks = useMemo(() => checkNavEntries(), []);
  const failing = checks.filter((c) => !c.pass);
  const visible = (rows: NavCheck[]) =>
    device === "all" ? rows : rows.filter((r) => r.device === "both" || r.device === device);

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-4 pb-24" data-testid="diag-routes-page">
      <header className="space-y-1">
        <h1 className="text-xl font-bold">ตรวจเมนูและเส้นทางตามบทบาท</h1>
        <p className="text-sm text-muted-foreground">
          เวอร์ชัน v{BUILD_INFO.version} · {envLabel()} · อัปเดต {formatThaiDateTime(BUILD_INFO.builtAt)}
        </p>
        <p className="text-sm" data-testid="diag-routes-summary">
          ตรวจ {checks.length} เมนู · ผ่าน {checks.length - failing.length} · ไม่ผ่าน{" "}
          <b className={failing.length ? "text-destructive" : ""}>{failing.length}</b>
        </p>
      </header>

      <div className="flex gap-2">
        {(["all", "desktop", "mobile"] as const).map((d) => (
          <button
            key={d}
            type="button"
            data-testid={`diag-routes-filter-${d}`}
            onClick={() => setDevice(d)}
            className={`min-h-10 rounded-lg border px-3 text-sm font-bold ${device === d ? "bg-primary text-primary-foreground" : ""}`}
          >
            {d === "all" ? "ทั้งหมด" : d === "desktop" ? "Desktop" : "Mobile"}
          </button>
        ))}
        <Link to="/diagnostics" className="ml-auto flex min-h-10 items-center rounded-lg border px-3 text-sm font-bold">
          ← กลับหน้าวินิจฉัย
        </Link>
      </div>

      {SURFACES.map((s) => {
        const rows = visible(checks.filter((c) => c.surface === s.id));
        if (!rows.length) return null;
        return (
          <section key={s.id} className="rounded-2xl border bg-card p-3" data-testid={`diag-routes-${s.id}`}>
            <h2 className="mb-2 font-bold">{s.label} ({rows.length})</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="p-1">เมนู</th>
                    <th className="p-1">URL</th>
                    <th className="p-1">หลัง redirect</th>
                    <th className="p-1">สิทธิ์</th>
                    <th className="p-1">หน้า</th>
                    <th className="p-1">อุปกรณ์</th>
                    <th className="p-1">ผล</th>
                    <th className="p-1">เปิด</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={`${r.surface}-${r.to}-${r.device}`} className="border-t" data-testid={`diag-route-row-${r.to}`}>
                      <td className="p-1 font-bold">{r.label}</td>
                      <td className="p-1 font-mono">{r.to}</td>
                      <td className="p-1 font-mono">{r.resolved}</td>
                      <td className="p-1">{r.roles.join(", ")}</td>
                      <td className="p-1">{r.component}</td>
                      <td className="p-1">{r.device === "both" ? "desktop+mobile" : r.device}</td>
                      <td className={`p-1 font-bold ${r.pass ? "text-emerald-600" : "text-destructive"}`}>
                        {r.pass ? "ผ่าน" : `ไม่ผ่าน · ${r.note}`}
                      </td>
                      <td className="p-1">
                        <Link to={r.to} className="rounded border px-2 py-1 font-bold">ทดสอบ</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </main>
  );
}
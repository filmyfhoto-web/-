import { Link } from "react-router-dom";
import { useStores } from "./useStore";
import { STORE_THEME } from "./types";
import { Card } from "@/components/ui/card";
import { Receipt, Printer, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getLastStore, storeEntryPath, STORE_LABEL } from "./lib/lastStore";
import { useNavigate } from "react-router-dom";

export default function StorePicker() {
  const { data: stores, isLoading } = useStores();
  const navigate = useNavigate();
  const last = getLastStore();

  return (
    <div className="ng-canvas min-h-screen">
      {/* Slim workspace header — เหมือน workspace อื่นของ NATTA GROUP */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4">
          <div className="flex min-w-0 items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="shrink-0 rounded-xl px-2" data-testid="back-button">
              <Link to="/admin/home" aria-label="กลับหน้าหลัก">
                <ArrowLeft className="mr-1 h-4 w-4" />
                <span className="hidden sm:inline">กลับหน้าหลัก</span>
              </Link>
            </Button>
            <span className="h-5 w-px bg-border" aria-hidden />
            <h1 className="truncate text-sm font-bold sm:text-base">ออกเอกสาร</h1>
          </div>
          {last && (
            <Button
              size="sm"
              className="ng-btn-brand rounded-xl"
              onClick={() => navigate(storeEntryPath(last))}
            >
              ร้านล่าสุด: {STORE_LABEL[last]}
            </Button>
          )}
        </div>
      </header>

      <div className="ng-surface ng-surface-compact mx-auto max-w-6xl px-4 py-6">
        <p className="mb-5 text-sm text-muted-foreground">
          เลือกกิจการเพื่อเข้าสู่ระบบออกเอกสารของร้านนั้น — ใบเสนอราคา · ใบส่งของ · ใบเสร็จ
        </p>
        {isLoading ? (
          <div className="py-20 text-center text-muted-foreground">กำลังโหลด...</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {stores?.filter((s) => s.slug === "colorlab" || s.slug === "printing").map((s) => {
              const theme = STORE_THEME[s.slug];
              const Icon = s.slug === "colorlab" ? Receipt : Printer;
              const target = `/receipts/${s.slug}/dashboard`;
              return (
                <Link key={s.id} to={target}>
                  <Card className="ng-card group relative h-full overflow-hidden p-5 transition-all hover:-translate-y-0.5 hover:shadow-md">
                    <div className={`absolute inset-x-0 top-0 h-2 bg-gradient-to-r ${theme?.accent ?? "from-neutral-800 to-neutral-500"}`} />
                    <div className="mb-4 flex items-start justify-between">
                      <div className={`grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br ${theme?.accent ?? "from-neutral-800 to-neutral-500"} text-white shadow-soft`}>
                        <Icon className="h-6 w-6" />
                      </div>
                      <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
                        {theme?.tag ?? "-"}
                      </span>
                    </div>
                    <h2 className="mb-1 text-base font-bold text-foreground">{s.name}</h2>
                    <p className="text-sm text-muted-foreground">
                      เริ่มใช้งานระบบออกเอกสารและ POS
                    </p>
                    <div className="mt-4 text-sm font-semibold text-brand group-hover:translate-x-1 transition-transform">
                      เข้าใช้งาน →
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
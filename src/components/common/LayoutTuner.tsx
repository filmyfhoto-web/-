import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { SlidersHorizontal, X, Minus, Plus, RotateCcw, Move, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  applyLayoutPref, applyToAllPages, clampFontScale, clearBlockOrder, getLayoutPref,
  hasPageOverride, isArrangeMode, resetLayoutPref, setArrangeMode, setLayoutPref,
  DEFAULT_LAYOUT_PREF, MAX_FONT_SCALE, MIN_FONT_SCALE,
  type LayoutPref, type UiDensity, type UiWidth,
} from "@/lib/layoutPref";

const WIDTHS: { key: UiWidth; label: string }[] = [
  { key: "narrow", label: "แคบ" },
  { key: "normal", label: "ปกติ" },
  { key: "wide", label: "เต็มจอ" },
];

const DENSITIES: { key: UiDensity; label: string }[] = [
  { key: "compact", label: "แน่น" },
  { key: "normal", label: "ปกติ" },
  { key: "roomy", label: "โปร่ง" },
];

/** หน้าที่มีแถบเครื่องมือของตัวเอง/หน้าพิมพ์ — ไม่ต้องมีปุ่มลอยซ้อน */
function hiddenOn(pathname: string): boolean {
  return pathname.startsWith("/pos/register") || pathname.startsWith("/print");
}

/**
 * ปุ่มลอย "ปรับหน้าจอ" — ให้ผู้ใช้ปรับขนาดตัวอักษร ความกว้างเนื้อหา ความโปร่ง
 * และเข้าโหมดจัดวาง (ลากสลับบล็อก) ได้เองทุกหน้า เก็บค่าเฉพาะอุปกรณ์นี้
 */
export default function LayoutTuner() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [pref, setPref] = useState<LayoutPref>(DEFAULT_LAYOUT_PREF);
  const [arrange, setArrange] = useState(false);
  const [scoped, setScoped] = useState(false);

  useEffect(() => {
    setPref(applyLayoutPref(pathname));
    setScoped(hasPageOverride(pathname));
    setArrange(isArrangeMode());
  }, [pathname]);

  const update = (patch: Partial<LayoutPref>) => {
    const next = setLayoutPref(pathname, patch);
    setPref(next);
    setScoped(true);
  };

  const bump = (delta: number) => update({ fontScale: clampFontScale(pref.fontScale + delta) });

  const toggleArrange = () => {
    const next = !arrange;
    setArrange(next);
    setArrangeMode(next);
  };

  if (hiddenOn(pathname)) return null;

  const chip = (active: boolean) =>
    cn("min-h-9 flex-1 rounded-lg border px-2 text-xs font-semibold",
      active ? "border-primary bg-primary/10 text-primary" : "bg-background hover:bg-muted");

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="icon"
        className="fixed left-2 bottom-24 z-50 h-10 w-10 rounded-full border border-border opacity-80 shadow-md hover:opacity-100 print:hidden sm:bottom-2 sm:left-auto sm:right-2"
        onClick={() => setOpen(true)}
        data-testid="layout-tuner-button"
        aria-label="ปรับหน้าจอ ขนาดตัวอักษรและการจัดวาง"
        title="ปรับหน้าจอ"
      >
        <SlidersHorizontal className="h-4 w-4" />
      </Button>

      {open && (
        <div className="fixed inset-0 z-[115] grid place-items-end bg-foreground/30 p-3 sm:place-items-center print:hidden" role="presentation">
          <section
            className="w-full max-w-md rounded-xl border bg-background p-4 text-foreground shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="layout-tuner-title"
            data-testid="layout-tuner-panel"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="layout-tuner-title" className="font-bold">ปรับหน้าจอ</h2>
                <p className="text-xs text-muted-foreground">
                  {scoped ? "กำลังปรับเฉพาะหน้านี้" : "กำลังใช้ค่ากลางของอุปกรณ์นี้"}
                </p>
              </div>
              <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="ปิด">
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* ขนาดตัวอักษร */}
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between text-sm font-semibold">
                <span>ขนาดตัวอักษร</span>
                <span className="tabular-nums text-muted-foreground" data-testid="layout-font-scale">
                  {Math.round(pref.fontScale * 100)}%
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => bump(-0.05)} aria-label="ลดขนาดตัวอักษร">
                  <Minus className="h-4 w-4" />
                </Button>
                <input
                  type="range"
                  className="h-2 flex-1 accent-[hsl(var(--primary))]"
                  min={MIN_FONT_SCALE * 100}
                  max={MAX_FONT_SCALE * 100}
                  step={5}
                  value={Math.round(pref.fontScale * 100)}
                  onChange={(e) => update({ fontScale: Number(e.target.value) / 100 })}
                  aria-label="ขนาดตัวอักษร"
                  data-testid="layout-font-range"
                />
                <Button variant="outline" size="icon" onClick={() => bump(0.05)} aria-label="เพิ่มขนาดตัวอักษร">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* ความกว้างเนื้อหา */}
            <div className="mt-4">
              <div className="mb-2 text-sm font-semibold">ความกว้างเนื้อหา</div>
              <div className="flex gap-2">
                {WIDTHS.map((w) => (
                  <button key={w.key} type="button" className={chip(pref.width === w.key)}
                    aria-pressed={pref.width === w.key}
                    data-testid={`layout-width-${w.key}`}
                    onClick={() => update({ width: w.key })}>
                    {w.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ความโปร่ง */}
            <div className="mt-4">
              <div className="mb-2 text-sm font-semibold">ระยะห่าง / ความโปร่ง</div>
              <div className="flex gap-2">
                {DENSITIES.map((d) => (
                  <button key={d.key} type="button" className={chip(pref.density === d.key)}
                    aria-pressed={pref.density === d.key}
                    data-testid={`layout-density-${d.key}`}
                    onClick={() => update({ density: d.key })}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            {/* โหมดจัดวาง */}
            <div className="mt-4 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">โหมดจัดวาง</div>
                  <p className="text-xs text-muted-foreground">ลากหรือกดลูกศรเพื่อสลับลำดับบล็อกในหน้าที่รองรับ</p>
                </div>
                <Button
                  variant={arrange ? "default" : "outline"}
                  size="sm"
                  onClick={toggleArrange}
                  data-testid="layout-arrange-toggle"
                >
                  {arrange ? <><Check className="h-4 w-4" /> เสร็จ</> : <><Move className="h-4 w-4" /> จัดวาง</>}
                </Button>
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Button
                variant="secondary"
                onClick={() => { setPref(applyToAllPages(pathname)); setScoped(false); }}
                data-testid="layout-apply-all"
              >
                ใช้ค่านี้กับทุกหน้า
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  clearBlockOrder(pathname);
                  setPref(resetLayoutPref(pathname));
                  setScoped(false);
                  window.dispatchEvent(new CustomEvent("ui:arrange-reset"));
                }}
                data-testid="layout-reset"
              >
                <RotateCcw className="h-4 w-4" /> รีเซ็ตหน้านี้
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              บันทึกเฉพาะอุปกรณ์นี้ ไม่กระทบผู้ใช้คนอื่น และไม่มีผลกับการพิมพ์เอกสาร
            </p>
          </section>
        </div>
      )}
    </>
  );
}

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_SHORTCUTS, DEFAULT_THEME, DEFAULT_SECTIONS, SECTION_LABELS, themeCssVars,
  type ServiceShortcutRow, type ShopTheme, type ShopSectionPref,
} from "@/lib/shopHomeConfig";
import ServiceShortcuts from "@/components/shop/home/ServiceShortcuts";
import { Home, Search, ShoppingCart, User } from "lucide-react";

interface Draft {
  theme: ShopTheme;
  shortcuts: ServiceShortcutRow[];
}

interface Ctx extends Draft {
  setDraftTheme: (t: ShopTheme) => void;
  setDraftShortcuts: (r: ServiceShortcutRow[]) => void;
}

const fallbackRows: ServiceShortcutRow[] = DEFAULT_SHORTCUTS.map((s, i) => ({ ...s, id: `default-${i}` }));

const AppPreviewContext = createContext<Ctx | null>(null);

/** เก็บ “ค่าที่กำลังแก้” ของหน้าจัดการแอพ เพื่อให้พรีวิวอัปเดตทันทีแบบเรียลไทม์ */
export function AppPreviewProvider({ children }: { children: React.ReactNode }) {
  const [theme, setDraftTheme] = useState<ShopTheme>(DEFAULT_THEME);
  const [shortcuts, setDraftShortcuts] = useState<ServiceShortcutRow[]>(fallbackRows);
  const value = useMemo(() => ({ theme, shortcuts, setDraftTheme, setDraftShortcuts }), [theme, shortcuts]);
  return <AppPreviewContext.Provider value={value}>{children}</AppPreviewContext.Provider>;
}

export function useAppPreview(): Ctx {
  const ctx = useContext(AppPreviewContext);
  if (!ctx) throw new Error("useAppPreview ต้องอยู่ภายใน AppPreviewProvider");
  return ctx;
}

/** ส่งค่าที่แก้อยู่เข้าพรีวิวทุกครั้งที่เปลี่ยน (ไม่ต้องกดบันทึก) */
export function usePublishThemeDraft(theme: ShopTheme) {
  const { setDraftTheme } = useAppPreview();
  useEffect(() => { setDraftTheme(theme); }, [theme, setDraftTheme]);
}

export function usePublishShortcutsDraft(rows: ServiceShortcutRow[]) {
  const { setDraftShortcuts } = useAppPreview();
  useEffect(() => { if (rows.length) setDraftShortcuts(rows); }, [rows, setDraftShortcuts]);
}

/** พรีวิวหน้าแอพลูกค้าแบบสด — เปลี่ยนตามที่แอดมินแก้ทันที */
export default function AppLivePreview({ className }: { className?: string }) {
  const { theme, shortcuts } = useAppPreview();
  const sections: ShopSectionPref[] = theme.sections?.length ? theme.sections : DEFAULT_SECTIONS;
  const visible = (k: string) => sections.find((s) => s.key === k)?.visible !== false;
  const order = sections.filter((s) => s.visible);
  const active = shortcuts.filter((r) => r.is_active);
  const g = Math.max(0, Math.min(100, theme.gradient_strength)) / 100;

  return (
    <aside className={className} data-testid="admin-app-live-preview">
      <div className="rounded-3xl border border-border bg-card p-3 shadow-card">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-bold">พรีวิวสด</span>
          <span className="text-[11px] text-muted-foreground">อัปเดตทันทีที่แก้</span>
        </div>

        <div
          className="rounded-[2rem] border-[6px] border-foreground/85 overflow-hidden"
          style={themeCssVars(theme) as React.CSSProperties}
        >
          <div
            className="h-[520px] overflow-y-auto p-3 space-y-3"
            style={{
              fontSize: `calc(0.9rem * ${theme.font_scale || 1})`,
              background: `linear-gradient(180deg, hsl(var(--primary) / ${0.05 + g * 0.18}), hsl(var(--background)) 45%)`,
            }}
          >
            {order.map((s) => {
              if (s.key === "store") {
                return (
                  <div key="store" className="rounded-2xl bg-card border border-border p-3 flex items-center gap-3">
                    <span className="w-11 h-11 rounded-full overflow-hidden bg-gradient-primary grid place-items-center text-primary-foreground text-[10px] font-black shrink-0">
                      {theme.shop_logo_url ? <img src={theme.shop_logo_url} alt="" className="w-full h-full object-cover" /> : "นภ"}
                    </span>
                    <div className="min-w-0">
                      <div className="font-bold text-primary truncate">{theme.shop_name || "นัฐภรณ์ เชียงกลาง"}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {theme.shop_line_id ? `LINE: ${theme.shop_line_id}` : "ยังไม่ได้ตั้งค่า LINE"}
                      </div>
                    </div>
                  </div>
                );
              }
              if (s.key === "services") {
                return (
                  <div key="services">
                    <ServiceShortcuts items={active} onPick={() => {}} size={theme.icon_size} columns={theme.icon_columns} />
                  </div>
                );
              }
              if (s.key === "banners") {
                return (
                  <div key="banners" className="rounded-2xl p-4 text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>
                    <div className="font-bold">โปรโมชั่นของร้าน</div>
                    <div className="text-[11px] opacity-90">แบนเนอร์ที่เปิดใช้งานจะแสดงตรงนี้</div>
                  </div>
                );
              }
              if (s.key === "recommended") {
                return (
                  <div key="recommended">
                    <div className="text-sm font-bold mb-2">{SECTION_LABELS.recommended}</div>
                    <div className="grid grid-cols-2 gap-2">
                      {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="rounded-xl border border-border bg-card p-2">
                          <div className="h-14 rounded-lg bg-primary/10" />
                          <div className="mt-1.5 h-2 rounded bg-muted" />
                          <div className="mt-1 h-2 w-1/2 rounded bg-muted" />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }
              return null;
            })}
          </div>

          {visible("nav") && (
            <div className="grid grid-cols-4 border-t border-border bg-card py-2">
              {[
                { Icon: Home, label: "หน้าแรก" },
                { Icon: Search, label: "ค้นหา" },
                { Icon: ShoppingCart, label: "ตะกร้า" },
                { Icon: User, label: "ฉัน" },
              ].map(({ Icon, label }, i) => (
                <div key={label} className={`grid place-items-center gap-0.5 ${i === 0 ? "text-primary" : "text-muted-foreground"}`}>
                  <Icon className="w-4 h-4" />
                  <span className="text-[10px]">{label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

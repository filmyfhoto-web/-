import { DEFAULT_SHORTCUTS, resolveIcon, type ServiceShortcutRow } from "@/lib/shopHomeConfig";

export interface ServiceShortcut {
  key: string;
  label: string;
  /** คำค้นที่จะใช้กรองสินค้า/บริการ */
  term: string;
  target_type?: "search" | "route";
  target_value?: string;
}

/** เมนูบริการเริ่มต้น (ใช้เมื่อยังไม่ได้ตั้งค่าในฐานข้อมูล) */
export const SERVICE_SHORTCUTS: ServiceShortcut[] = DEFAULT_SHORTCUTS.map((s) => ({
  key: s.key,
  label: s.label,
  term: s.target_type === "search" ? s.target_value : "",
}));

const SIZES = {
  sm: { box: "w-9 h-9", icon: "w-4 h-4", text: "text-[10px]" },
  md: { box: "w-[52px] h-[52px]", icon: "w-6 h-6", text: "text-[11px]" },
  lg: { box: "w-14 h-14", icon: "w-7 h-7", text: "text-[13px]" },
} as const;

/** สีไอคอนแบบ multi-hue (อ้างอิงโทเคน --svc-* ในธีมหน้าร้าน) */
function svcToken(index: number): string {
  return `--svc-${(index % 10) + 1}`;
}

export default function ServiceShortcuts({
  active,
  onPick,
  items,
  size = "md",
  columns = 5,
}: {
  active?: string | null;
  onPick: (s: ServiceShortcut) => void;
  /** รายการจากฐานข้อมูล — ถ้าไม่ส่งมาจะใช้ค่าเริ่มต้น */
  items?: ServiceShortcutRow[];
  size?: "sm" | "md" | "lg";
  columns?: number;
  /** @deprecated ปุ่มขอใบเสนอราคาย้ายไปหน้าตะกร้าแล้ว */
  onQuote?: () => void;
}) {
  const rows: ServiceShortcutRow[] =
    items && items.length
      ? items
      : DEFAULT_SHORTCUTS.map((s, i) => ({ ...s, id: `default-${i}` }));
  const sz = SIZES[size] ?? SIZES.md;
  const colClass = columns === 4 ? "grid-cols-4" : "grid-cols-5";

  return (
    <section aria-label="บริการของร้าน" className="mb-4" data-testid="shop-service-shortcuts">
      <div className={`grid ${colClass} md:grid-cols-8 lg:grid-cols-10 justify-items-center gap-y-3 gap-x-1 rounded-2xl border border-border bg-card p-3 shadow-card`}>
        {rows.map((s, i) => {
          const isActive = active === s.key;
          const Icon = resolveIcon(s.icon_name);
          const token = svcToken(i);
          return (
            <button
              key={s.id || s.key}
              type="button"
              data-testid={`service-${s.key}`}
              aria-pressed={isActive}
              onClick={() =>
                onPick({
                  key: s.key,
                  label: s.label,
                  term: s.target_type === "search" ? s.target_value : "",
                  target_type: s.target_type,
                  target_value: s.target_value,
                })
              }
              className={`min-h-11 w-full max-w-[104px] rounded-xl p-1 grid place-items-center gap-1.5 transition ${
                isActive ? "bg-primary/10 ring-1 ring-primary" : "hover:bg-accent"
              }`}

            >
              <span
                className={`${sz.box} rounded-full grid place-items-center overflow-hidden`}
                style={{ backgroundColor: `hsl(var(${token}) / 0.13)` }}
              >
                {s.icon_url ? (
                  <img src={s.icon_url} alt="" width={52} height={52} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                ) : (
                  <Icon className={sz.icon} style={{ color: `hsl(var(${token}))` }} strokeWidth={1.9} aria-hidden />
                )}
              </span>
              <span className={`${sz.text} leading-tight text-center break-words`}>{s.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  MapPin, Phone, ArrowRight, Clock, Menu, X, ShoppingBag, FileText, UserRound,
  Printer, Camera, PenLine, Folder, Megaphone, Palette, ShieldCheck, Zap, Sparkles,
} from "lucide-react";
import SeoHead from "@/components/SeoHead";
import CustomerHomePanel from "@/components/home/CustomerHomePanel";
import OrderStatusStrip from "@/components/home/OrderStatusStrip";
import SortableStack, { type StackBlock } from "@/components/common/SortableStack";


import heroAsset from "@/assets/stationery-hero.jpg.asset.json";
import { useSiteConfig } from "@/hooks/useSiteConfig";
import {
  DEFAULT_SITE_CONFIG, isCtaReady, sectionVisible, heroScaleOf, heroAlignOf,
  type SiteConfig, type SiteCta, type SiteHighlightIcon, type SiteMenuItem, type SiteMenuKind,
} from "@/lib/siteConfig";

const CATEGORIES = [
  { icon: Printer, title: "งานพิมพ์", desc: "งานพิมพ์ทุกชนิด" },
  { icon: Camera, title: "ถ่ายรูป", desc: "รูปติดบัตร รูปสูจิบัตร/รูปธุรกิจ" },
  { icon: PenLine, title: "เครื่องเขียน", desc: "อุปกรณ์การเรียน" },
  { icon: Folder, title: "อุปกรณ์สำนักงาน", desc: "แฟ้ม กระดาษ ฯลฯ" },
  { icon: Megaphone, title: "ป้าย & สื่อโฆษณา", desc: "ป้ายไวนิล สติกเกอร์" },
  { icon: Palette, title: "ออกแบบ & กราฟิก", desc: "ออกแบบสื่อสิ่งพิมพ์" },
];

const HIGHLIGHT_ICONS: Record<SiteHighlightIcon, typeof ShieldCheck> = {
  shield: ShieldCheck,
  zap: Zap,
  sparkles: Sparkles,
};

/**
 * ลิงก์เดียวที่ใช้ทั้งเมนูและปุ่ม CTA — label กับ destination แยกกันเสมอ
 * ในโหมดพรีวิว (หลังบ้าน) จะไม่พาไปไหนและไม่เขียนข้อมูลใด ๆ แค่บอกปลายทาง
 */
function SiteLink({
  kind, to, className, style, onClick, preview, children, testId,
}: {
  kind: SiteMenuKind;
  to: string;
  className: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  preview?: boolean;
  children: React.ReactNode;
  testId?: string;
}) {
  const common = {
    className,
    style,
    "data-testid": testId,
    "data-destination": to,
    title: preview ? `ปลายทาง: ${to}` : undefined,
  } as const;
  if (preview) {
    return (
      <a href={to} {...common} onClick={(e) => e.preventDefault()}>
        {children}
      </a>
    );
  }
  if (kind === "route") {
    return <Link to={to} {...common} onClick={onClick}>{children}</Link>;
  }
  return (
    <a
      href={to}
      {...common}
      onClick={onClick}
      {...(kind === "external" ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {children}
    </a>
  );
}

function MenuLink({
  item, className, onClick, preview,
}: { item: SiteMenuItem; className: string; onClick?: () => void; preview?: boolean }) {
  return (
    <SiteLink kind={item.kind} to={item.to} className={className} onClick={onClick} preview={preview}>
      {item.label}
    </SiteLink>
  );
}

/**
 * Public customer entry — ลูกค้าเท่านั้น
 * ไม่มีลิงก์/ปุ่ม/accordion ที่พาไปหน้า staff / admin / POS / owner login
 * (route หลังร้านยังเข้าตรงได้ แต่ถูก auth/role guard เดิมคุ้มครองอยู่)
 *
 * ข้อความ/รูป/เมนู/ลำดับ section อ่านจาก “จัดการหน้าเว็บไซต์” (site_settings)
 * ถ้ายังไม่เคยบันทึก จะแสดงค่าเริ่มต้นเดิมทุกประการ
 */
export default function Welcome() {
  const { config } = useSiteConfig();
  return <WelcomeView config={config} />;
}

/** ตัวหน้าแรกจริง — รับ config เข้ามาได้ เพื่อให้ Live Preview ในหลังบ้านใช้ซ้ำได้ */
export function WelcomeView({
  config = DEFAULT_SITE_CONFIG,
  preview = false,
}: { config?: SiteConfig; preview?: boolean }) {
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [heroOk, setHeroOk] = useState(true);
  const heroSrc = config.hero_image_url || heroAsset.url;
  // ขนาด/ตำแหน่งรูปโชว์แยกตามหน้าจอ (มือถือ / แท็บเล็ต / เดสก์ท็อป)
  const heroBoxStyle = {
    ["--hs-xs" as string]: String(heroScaleOf(config, "mobile") / 100),
    ["--hs-sm" as string]: String(heroScaleOf(config, "tablet") / 100),
    ["--hs-lg" as string]: String(heroScaleOf(config, "desktop") / 100),
    ["--hp-xs" as string]: heroAlignOf(config, "mobile"),
    ["--hp-sm" as string]: heroAlignOf(config, "tablet"),
    ["--hp-lg" as string]: heroAlignOf(config, "desktop"),
  } as React.CSSProperties;
  const heroBoxClass =
    "h-[calc(7.5rem*var(--hs-xs))] w-full sm:h-[calc(9rem*var(--hs-sm))] lg:h-[calc(10.5rem*var(--hs-lg))]";

  const heroPosClass =
    "[object-position:var(--hp-xs)_center] sm:[object-position:var(--hp-sm)_center] lg:[object-position:var(--hp-lg)_center]";
  const menu = config.menu.filter((m) => m.visible);
  const highlights = config.highlights.filter((h) => h.visible);
  const showHighlights = sectionVisible(config, "highlights") && highlights.length > 0;
  const bodySections = config.sections.filter((s) => s.key !== "hero" && s.key !== "highlights" && s.visible);
  const lineCta = config.line_cta;
  const lineCtaReady = lineCta.enabled && lineCta.label.trim().length > 0 && /^https?:\/\//i.test(lineCta.url);
  const ctaCategories: SiteCta = config.cta_categories;

  /** การ์ด “สั่งซื้อสินค้ากับร้าน” ถูกย้ายไปเป็นทางลัดในแผงต้อนรับลูกค้าแล้ว */


  const heroImageBlock = (
                <div className="relative min-w-0 overflow-hidden rounded-[1.75rem] border border-primary/15 bg-gradient-to-br from-brand-lavender to-white shadow-[var(--shadow-brand)]">
                  {/* รูปหน้าร้าน — เปลี่ยนได้จากหลังบ้าน “จัดการหน้าเว็บไซต์” (ถ้าโหลดไม่ได้จะแสดง placeholder โทนม่วง) */}
                  {heroOk ? (
                    <img
                      key={heroSrc}
                      src={heroSrc}
                      alt="หน้าร้าน NATTA GROUP งานพิมพ์ เครื่องเขียน และอุปกรณ์สำนักงาน"
                      className={`${heroBoxClass} ${heroPosClass} object-cover`}
                      loading="eager"
                      onError={() => setHeroOk(false)}
                    />
                  ) : (
                    <div className={`grid grid-cols-2 gap-3 p-6 ${heroBoxClass}`}>
                      {[
                        { icon: Printer, label: "เครื่องพิมพ์" },
                        { icon: PenLine, label: "เครื่องเขียน" },
                        { icon: Megaphone, label: "ป้าย & สติกเกอร์" },
                        { icon: Folder, label: "อุปกรณ์สำนักงาน" },
                      ].map(({ icon: Icon, label }) => (
                        <div key={label} className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-primary/15 bg-white/80">
                          <Icon className="h-8 w-8 shrink-0 text-primary" color="currentColor" strokeWidth={1.9} aria-hidden />
                          <span className="text-xs font-semibold text-foreground">{label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="pointer-events-none absolute inset-x-3 bottom-3 hidden rounded-xl border border-primary/15 bg-white/95 px-3 py-2 shadow-sm sm:block">
                    <p className="truncate text-[11px] text-muted-foreground">{config.hours_label}</p>
                    <p className="truncate text-xs font-bold text-primary">{config.hours_text}</p>
                  </div>
                </div>
  );

  


  const categoriesSection = (
    <section key="categories" className="portal-canvas border-y border-[hsl(var(--portal-line))]">
      <div className="ng-page px-4 py-12 sm:px-6 sm:py-14">
        <div className="flex flex-col gap-1 border-b border-[hsl(var(--portal-line))] pb-5 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {ctaCategories.label || "หมวดหมู่สินค้าและบริการ"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">เลือกงานที่ต้องการ แล้วให้เราดูแลให้ครบจบในที่เดียว</p>
          </div>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map(({ icon: Icon, title, desc }) => (
            <SiteLink
              key={title}
              kind={isCtaReady(ctaCategories) ? ctaCategories.kind : "route"}
              to={isCtaReady(ctaCategories) ? ctaCategories.to : "/shop"}
              preview={preview}
              className="portal-card portal-card-link group flex items-start gap-4 p-5"
            >
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-accent text-primary">
                <Icon className="h-6 w-6 shrink-0" color="currentColor" strokeWidth={1.9} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-base font-bold text-foreground">{title}</span>
                <span className="block text-sm text-muted-foreground">{desc}</span>
                <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                  ดูรายการ <ArrowRight className="portal-arrow h-4 w-4 shrink-0" color="currentColor" aria-hidden />
                </span>
              </span>
            </SiteLink>
          ))}
        </div>
      </div>
    </section>
  );


  const contactSection = (
    <section key="contact" id="contact" className="portal-canvas border-t border-[hsl(var(--portal-line))]">
      <div className="ng-page grid gap-4 px-4 py-12 sm:px-6 sm:py-14 lg:grid-cols-4">
        <div className="portal-card p-5">
          <MapPin className="h-5 w-5 text-brand" aria-hidden />
          <p className="mt-3 text-sm font-bold text-foreground">ที่อยู่ร้าน</p>
          <p className="mt-1 text-sm text-muted-foreground">หน้าโรงพยาบาลเชียงกลาง อ.เชียงกลาง จ.น่าน 55160</p>
        </div>
        <div className="portal-card p-5">
          <Phone className="h-5 w-5 text-brand" aria-hidden />
          <p className="mt-3 text-sm font-bold text-foreground">โทรศัพท์</p>
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm">
            <a href="tel:+66947799356" className="text-primary underline underline-offset-2">094-779-9356</a>
            <a href="tel:+66932296596" className="text-primary underline underline-offset-2">093-229-6596</a>
          </p>
        </div>
        <div className="portal-card p-5">
          <Clock className="h-5 w-5 text-brand" aria-hidden />
          <p className="mt-3 text-sm font-bold text-foreground">เวลาเปิดบริการ</p>
          <p className="mt-1 text-sm text-muted-foreground">{config.hours_text}</p>
        </div>
        {lineCtaReady && (
          <div className="portal-card p-5">
            <p className="text-sm font-bold text-foreground">LINE Official</p>
            <p className="mt-1 text-xs text-muted-foreground">เพิ่มเพื่อนเพื่อรับข่าวสารและโปรโมชั่น</p>
            <SiteLink
              kind="external"
              to={lineCta.url}
              preview={preview}
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl text-sm font-bold text-white"
              style={{ backgroundColor: "#06C755" }}
            >เพิ่มเพื่อน</SiteLink>
          </div>
        )}
      </div>
    </section>
  );

  const SECTION_NODES: Record<string, JSX.Element> = {
    categories: categoriesSection,
    contact: contactSection,
  };


  return (
    <div data-testid="public-home" className="min-h-[100dvh] overflow-x-hidden bg-white text-foreground">
      {!preview && (
        <SeoHead
          title="NATTA GROUP — งานพิมพ์ เครื่องเขียน ป้ายและสื่อสิ่งพิมพ์"
          description="NATTA GROUP เชียงกลาง น่าน ครบทุกงานพิมพ์ เครื่องเขียน อุปกรณ์สำนักงาน ป้ายโฆษณา และงานออกแบบ สั่งซื้อออนไลน์และติดตามคำสั่งซื้อได้จากมือถือ"
          path={pathname === "/" ? "/" : "/welcome"}
        />
      )}

      {/* ---------------- HEADER ---------------- */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-nt-navy text-white backdrop-blur">
        <div className="ng-page flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/" className="min-w-0">
            <span className="block text-xl font-black leading-tight tracking-tight text-white sm:text-2xl">
              NATTA GROUP
            </span>
            <span className="hidden text-[11px] text-white/70 sm:block">
              ครบทุกงานพิมพ์ เครื่องเขียน ป้ายและสื่อสิ่งพิมพ์
            </span>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex">
            {menu.map((item) => (
              <MenuLink
                key={item.id}
                item={item}
                preview={preview}
                className="rounded-xl px-3 py-2 text-sm font-medium text-white/85 transition-colors hover:bg-white/10 hover:text-white"
              />
            ))}
          </nav>


          <div className="flex items-center gap-2">
            {lineCtaReady && (
              <div className="hidden text-right sm:block">
                <SiteLink
                  kind="external"
                  to={lineCta.url}
                  preview={preview}
                  testId="welcome-line-cta"
                  className="inline-flex min-h-10 items-center justify-center rounded-xl px-4 text-sm font-bold text-white shadow-sm transition-transform hover:-translate-y-0.5"
                  style={{ backgroundColor: "#06C755" }}
                >
                  {lineCta.label}
                </SiteLink>
                {lineCta.note && <p className="mt-1 text-[11px] text-white/70">{lineCta.note}</p>}
              </div>
            )}
            <button
              type="button"
              aria-label="เปิดเมนู"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/25 text-white lg:hidden"

            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="border-t border-white/10 bg-nt-navy px-4 pb-4 pt-2 lg:hidden">
            <nav className="grid gap-1">
              {menu.map((item) => (
                <MenuLink
                  key={item.id}
                  item={item}
                  preview={preview}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-xl px-3 py-3 text-base font-medium text-white hover:bg-white/10"
                />

              ))}
              {lineCtaReady && (
                <>
                  <SiteLink
                    kind="external"
                    to={lineCta.url}
                    preview={preview}
                    className="mt-1 inline-flex min-h-12 items-center justify-center rounded-xl text-base font-bold text-white"
                    style={{ backgroundColor: "#06C755" }}
                  >
                    {lineCta.label}
                  </SiteLink>
                  {lineCta.note && <p className="text-center text-xs text-white/70">{lineCta.note}</p>}
                </>
              )}
            </nav>
          </div>
        )}
      </header>

      <main>
        {(() => {
          const heroBlock = sectionVisible(config, "hero") ? (
          <section className="portal-canvas border-b border-[hsl(var(--portal-line))]">
            <div className="ng-page px-4 py-8 sm:px-6 sm:py-10">
              {/* ---- หัวหน้า: ชื่อเรื่อง + แผงบัญชีลูกค้า ---- */}
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
                <div className="min-w-0 space-y-1">
                  <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden /> {config.brand_label}
                  </span>
                  <h1 className="text-[clamp(1.75rem,3.6vw,2.5rem)] font-bold leading-tight tracking-tight text-foreground">
                    {config.hero_title_line1}
                    {config.hero_title_line2 && <span className="block text-primary">{config.hero_title_line2}</span>}
                  </h1>
                  <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground sm:text-lg">
                    {config.hero_desc}
                  </p>
                </div>
              </div>

              {/* ---- แผงต้อนรับ / สถานะบัญชีลูกค้า ---- */}
              <div className="mt-6 min-w-0" style={heroBoxStyle}>
                {preview ? heroImageBlock : <CustomerHomePanel shopImage={heroImageBlock} />}
              </div>

              {/* ---- เส้นทางหลัก 3 ทาง ---- */}
              <div className="mt-6 grid gap-4 md:grid-cols-3">
                {[
                  { to: "/shop", icon: ShoppingBag, title: "สั่งซื้อสินค้า", desc: "เลือกสินค้า แล้วสั่งซื้อเลยหรือขอใบราคาก่อนได้ในตะกร้า", cta: "เริ่มสั่งซื้อ", testId: "portal-card-shop" },
                  { to: "/my-orders", icon: FileText, title: "งานและเอกสารของฉัน", desc: "ติดตามสถานะงาน ใบเสนอราคา ใบส่งของ และใบเสร็จทั้งหมด", cta: "เปิดรายการงาน", testId: "portal-card-orders" },
                  { to: "/my-account", icon: UserRound, title: "บัญชีของฉัน", desc: "ข้อมูลผู้ติดต่อ การเชื่อม LINE และประวัติการใช้บริการ", cta: "จัดการบัญชี", testId: "portal-card-account" },
                ].map(({ to, icon: Icon, title, desc, cta, testId }) => (
                  <SiteLink
                    key={to}
                    kind="route"
                    to={to}
                    preview={preview}
                    testId={testId}
                    className="portal-card portal-card-link group flex min-w-0 flex-col p-6"
                  >
                    <span className="mb-5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-accent text-primary">
                      <Icon className="h-6 w-6 shrink-0" color="currentColor" strokeWidth={1.9} aria-hidden />
                    </span>
                    <span className="text-xl font-bold text-foreground">{title}</span>
                    <span className="mt-2 text-sm leading-relaxed text-muted-foreground">{desc}</span>
                    <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                      {cta} <ArrowRight className="portal-arrow h-4 w-4 shrink-0" color="currentColor" aria-hidden />
                    </span>
                  </SiteLink>
                ))}
              </div>

              {showHighlights && (
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {highlights.map((h) => {
                    const Icon = HIGHLIGHT_ICONS[h.icon] ?? ShieldCheck;
                    return (
                      <div key={h.id} className="portal-card flex items-start gap-3 p-4">
                        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" color="currentColor" strokeWidth={1.9} aria-hidden />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-foreground">{h.title}</p>
                          <p className="text-xs leading-snug text-muted-foreground">{h.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {!preview && <OrderStatusStrip />}
            </div>
          </section>
          ) : null;


          const blocks: StackBlock[] = [
            ...(heroBlock ? [{ id: "hero", label: "แผงต้อนรับ", node: heroBlock }] : []),
            
            ...bodySections.map((s) => ({
              id: s.key,
              label: s.key === "categories" ? "หมวดหมู่สินค้า" : s.key === "contact" ? "ติดต่อร้าน" : s.key,
              node: SECTION_NODES[s.key] ?? null,
            })),
          ];

          if (preview) return blocks.map((b) => <div key={b.id}>{b.node}</div>);
          return <SortableStack stackKey="home" blocks={blocks} />;
        })()}

      </main>


      {/* ---------------- FOOTER ---------------- */}
      <footer className="bg-foreground py-10 text-white/80">
        <div className="ng-page flex w-full flex-col gap-4 px-4 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-lg font-black text-white">NATTA GROUP</p>
            <p className="text-xs">© {new Date().getFullYear()} NATTA GROUP · สงวนลิขสิทธิ์</p>
          </div>
          <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <a href="#contact" className="hover:text-white">เกี่ยวกับเรา</a>
            <Link to="/privacy" className="hover:text-white">นโยบายความเป็นส่วนตัว</Link>
            <Link to="/terms" className="hover:text-white">เงื่อนไขการใช้งาน</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

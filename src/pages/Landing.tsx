import { LEGACY_CUSTOMER_UI, PUBLIC_CUSTOMER_CATALOG } from "@/lib/legacyUi";
const CUSTOMER_OPEN = LEGACY_CUSTOMER_UI || PUBLIC_CUSTOMER_CATALOG;
import { ArrowDown, ArrowRight, CheckCircle2, Clock3, FileText, Instagram, Layers3, MapPin, MessageCircle, PackageCheck, Phone, Printer, Ruler, Send, Sparkles, Truck, WandSparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import SeoHead from "@/components/SeoHead";
import { DEFAULT_LINE_OA_URL } from "@/lib/siteConfig";
import heroShop from "@/assets/landing/hero-shop.jpg";
import workPrint from "@/assets/landing/work-print.jpg";
import workSign from "@/assets/landing/work-sign.jpg";
import workDesign from "@/assets/landing/work-design.jpg";

const services = [
  {
    number: "01",
    icon: Printer,
    title: "งานพิมพ์",
    detail: "นามบัตร โบรชัวร์ ใบปลิว สติ๊กเกอร์ และงานพิมพ์สำหรับทุกโอกาส",
    tone: "bg-nt-mist",
  },
  {
    number: "02",
    icon: FileText,
    title: "งานเอกสาร",
    detail: "พิมพ์เอกสาร เข้าเล่ม สแกน และจัดชุดเอกสารให้พร้อมใช้งาน",
    tone: "bg-nt-beige",
  },
  {
    number: "03",
    icon: Ruler,
    title: "ป้ายและสื่อ",
    detail: "ป้ายไวนิล ป้ายหน้าร้าน สื่อออกบูธ และงานติดตั้งตามขนาดจริง",
    tone: "bg-nt-mist",
  },
  {
    number: "04",
    icon: WandSparkles,
    title: "ออกแบบ",
    detail: "ช่วยวางภาพให้ชัด ตั้งแต่ไอเดียแรกจนได้ไฟล์พร้อมผลิต",
    tone: "bg-nt-beige",
  },
];

const steps = [
  { icon: MessageCircle, title: "คุยรายละเอียด", text: "ส่งโจทย์และไฟล์ผ่าน LINE ให้ทีมช่วยดูงาน" },
  { icon: Layers3, title: "ยืนยันแบบและราคา", text: "รับใบเสนอราคา ตรวจแบบ และยืนยันก่อนผลิต" },
  { icon: PackageCheck, title: "ผลิตอย่างตั้งใจ", text: "ทีมงานตรวจงานทุกขั้นตอนก่อนส่งมอบ" },
  { icon: Truck, title: "รับงานหรือจัดส่ง", text: "ติดตามสถานะงานได้ตลอดจากหน้าเว็บ" },
];

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="mb-4 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.18em] text-nt-blue">
      <span className="h-px w-8 bg-nt-blue" aria-hidden />
      {children}
    </p>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-nt-cream font-sans text-nt-navy">
      <SeoHead
        title="NATTA GROUP | งานพิมพ์ งานเอกสาร และงานออกแบบ"
        description="งานพิมพ์ งานเอกสาร ป้าย และงานออกแบบครบจบในที่เดียว พร้อมสั่งงานและติดตามสถานะได้ง่ายผ่าน NATTA GROUP"
        path="/landing"
      />

      <header className="absolute inset-x-0 top-0 z-20 border-b border-nt-cream/20 bg-nt-navy/90 text-nt-cream backdrop-blur-sm">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-12">
          <Link to="/landing" className="flex items-center gap-3" aria-label="NATTA GROUP หน้าแรก">
            <span className="flex h-9 w-9 items-center justify-center border border-nt-beige text-sm font-bold text-nt-beige">NG</span>
            <span>
              <span className="block text-sm font-bold tracking-[0.16em]">NATTA GROUP</span>
              <span className="hidden text-[9px] tracking-[0.22em] text-nt-beige sm:block">PRINT · DOCUMENT · DESIGN</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-8 text-sm font-medium md:flex" aria-label="เมนูหลัก">
            <a href="#services" className="transition-colors hover:text-nt-beige">บริการ</a>
            <a href="#process" className="transition-colors hover:text-nt-beige">ขั้นตอนงาน</a>
            <a href="#contact" className="transition-colors hover:text-nt-beige">ติดต่อเรา</a>
          </nav>
          <Button asChild className="h-10 bg-nt-beige px-4 text-xs font-bold text-nt-navy hover:bg-nt-cream">
            <a href={DEFAULT_LINE_OA_URL} target="_blank" rel="noreferrer">
              <MessageCircle className="mr-2 h-4 w-4" aria-hidden />
              คุยกับเราใน LINE
            </a>
          </Button>
        </div>
      </header>

      <main>
        <section className="relative min-h-[680px] overflow-hidden bg-nt-navy pt-[72px] text-nt-cream lg:min-h-[760px]" aria-labelledby="landing-title">
          <div className="absolute inset-0 opacity-35" aria-hidden>
            <img src={heroShop} alt="" className="h-full w-full object-cover object-center" />
          </div>
          <div className="absolute inset-0 bg-nt-navy/75" aria-hidden />
          <div className="relative mx-auto flex min-h-[608px] max-w-7xl items-center px-5 py-20 sm:px-8 lg:px-12">
            <div className="max-w-3xl">
              <p className="mb-7 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.22em] text-nt-beige">
                <Sparkles className="h-4 w-4" aria-hidden /> NATTA GROUP · ONE PLACE FOR EVERY DETAIL
              </p>
              <h1 id="landing-title" className="max-w-3xl text-4xl font-bold leading-[1.1] tracking-tight sm:text-6xl lg:text-7xl">
                งานพิมพ์ งานเอกสาร<br />
                <span className="text-nt-beige">และงานออกแบบ</span><br />
                ครบจบในที่เดียว
              </h1>
              <p className="mt-7 max-w-xl text-base leading-8 text-nt-cream/80 sm:text-lg">
                เปลี่ยนทุกไอเดียให้เป็นงานที่จับต้องได้ ด้วยทีมที่ดูแลตั้งแต่รายละเอียดเล็กที่สุดจนถึงวันส่งมอบ
              </p>
              {CUSTOMER_OPEN && <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Button asChild className="h-12 justify-center bg-nt-beige px-6 font-bold text-nt-navy hover:bg-nt-cream">
                  <Link to="/shop">
                    สั่งงานออนไลน์ <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                  </Link>
                </Button>
                <Button asChild variant="outline" className="h-12 justify-center border-nt-cream/50 bg-transparent px-6 font-bold text-nt-cream hover:bg-nt-cream/10 hover:text-nt-cream">
                  <Link to="/my-orders">
                    <Clock3 className="mr-2 h-4 w-4" aria-hidden /> ติดตามงานของฉัน
                  </Link>
                </Button>
              </div>}
            </div>
            <div className="absolute bottom-9 right-5 hidden items-center gap-3 text-xs text-nt-cream/70 lg:flex">
              <span className="h-px w-12 bg-nt-cream/50" aria-hidden />
              เลื่อนเพื่อดูบริการของเรา <ArrowDown className="h-4 w-4" aria-hidden />
            </div>
          </div>
        </section>

        <section id="services" className="bg-nt-cream py-20 sm:py-28" aria-labelledby="services-title">
          <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-12">
            <div className="flex flex-col justify-between gap-6 border-b border-nt-line pb-10 md:flex-row md:items-end">
              <div>
                <SectionLabel>บริการของเรา</SectionLabel>
                <h2 id="services-title" className="max-w-2xl text-3xl font-bold leading-tight sm:text-5xl">ทุกชิ้นงานมีความหมาย<br /><span className="text-nt-blue">เราช่วยทำให้ชัดเจนขึ้น</span></h2>
              </div>
              <p className="max-w-sm text-sm leading-7 text-nt-muted">จากงานด่วนชิ้นเดียว ไปจนถึงงานผลิตจำนวนมาก เราจัดการให้เป็นระบบและตรวจสอบได้</p>
            </div>
            <div className="mt-10 grid gap-px bg-nt-line sm:grid-cols-2 lg:grid-cols-4">
              {services.map(({ number, icon: Icon, title, detail, tone }) => (
                <article key={number} className="group bg-nt-cream p-7 transition-colors hover:bg-nt-mist sm:p-8">
                  <div className={`mb-16 flex h-14 w-14 items-center justify-center ${tone} text-nt-navy`}><Icon className="h-6 w-6" strokeWidth={1.6} aria-hidden /></div>
                  <p className="text-xs font-bold tracking-[0.15em] text-nt-blue">{number}</p>
                  <h3 className="mt-3 text-xl font-bold">{title}</h3>
                  <p className="mt-3 text-sm leading-7 text-nt-muted">{detail}</p>
                  <a href="#contact" className="mt-7 inline-flex items-center gap-2 text-xs font-bold text-nt-navy transition-colors hover:text-nt-blue">สอบถามรายละเอียด <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden /></a>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-nt-mist py-20 sm:py-28" aria-labelledby="order-title">
          <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[1fr_1.05fr] lg:items-center lg:gap-20 lg:px-12">
            <div className="relative order-2 lg:order-1">
              <div className="absolute -left-4 -top-4 h-24 w-24 border-l border-t border-nt-blue/50" aria-hidden />
              <img src={workPrint} alt="ตัวอย่างงานพิมพ์และงานเอกสารของ NATTA GROUP" className="relative aspect-[4/3] w-full object-cover shadow-[var(--nt-shadow)]" loading="lazy" />
              <div className="absolute -bottom-5 right-4 bg-nt-navy px-5 py-4 text-nt-cream sm:right-8"><p className="text-2xl font-bold">01—04</p><p className="mt-1 text-[10px] tracking-[0.14em] text-nt-beige">FROM BRIEF TO DONE</p></div>
            </div>
            <div className="order-1 lg:order-2">
              <SectionLabel>ทำงานกับเรา</SectionLabel>
              <h2 id="order-title" className="text-3xl font-bold leading-tight sm:text-5xl">ไม่ต้องวิ่งหาหลายที่<br /><span className="text-nt-blue">จัดการงานไว้ที่เดียว</span></h2>
              <p className="mt-6 max-w-xl text-base leading-8 text-nt-muted">เลือกสินค้าและบริการ ส่งรายละเอียด ขอใบเสนอราคา หรือเช็กสถานะงานได้จากระบบเดียว พร้อมทีมงานคอยตอบคำถามเมื่อคุณต้องการ</p>
              <ul className="mt-7 space-y-4 text-sm font-medium">
                {["สั่งซื้อหรือขอใบเสนอราคาได้ในตะกร้า", "ติดตามสถานะงานและเอกสารได้ทุกเวลา", "มีทีมงานช่วยตรวจรายละเอียดก่อนผลิต"].map((item) => <li key={item} className="flex items-center gap-3"><CheckCircle2 className="h-5 w-5 shrink-0 text-nt-blue" aria-hidden />{item}</li>)}
              </ul>
              {CUSTOMER_OPEN && <div className="mt-9 flex flex-wrap gap-3">
                <Button asChild className="h-11 bg-nt-navy px-5 text-nt-cream hover:bg-nt-navy-soft"><Link to="/shop">ดูสินค้าและบริการ <ArrowRight className="ml-2 h-4 w-4" aria-hidden /></Link></Button>
                <Button asChild variant="outline" className="h-11 border-nt-navy/30 bg-transparent px-5 text-nt-navy hover:bg-nt-navy/5"><Link to="/my-orders">ติดตามงาน</Link></Button>
              </div>}
            </div>
          </div>
        </section>

        <section id="process" className="bg-nt-navy py-20 text-nt-cream sm:py-28" aria-labelledby="process-title">
          <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-12">
            <div className="max-w-xl"><SectionLabel>ขั้นตอนการทำงาน</SectionLabel><h2 id="process-title" className="text-3xl font-bold leading-tight sm:text-5xl">ชัดเจนตั้งแต่เริ่ม<br /><span className="text-nt-beige">จนถึงวันรับงาน</span></h2></div>
            <div className="mt-14 grid gap-10 md:grid-cols-4 md:gap-5">
              {steps.map(({ icon: Icon, title, text }, index) => <div key={title} className="relative border-t border-nt-cream/25 pt-6"><span className="absolute right-0 top-5 text-xs text-nt-beige">0{index + 1}</span><Icon className="h-7 w-7 text-nt-beige" strokeWidth={1.5} aria-hidden /><h3 className="mt-6 text-lg font-bold">{title}</h3><p className="mt-2 text-sm leading-7 text-nt-cream/65">{text}</p>{index < steps.length - 1 && <ArrowRight className="absolute -right-3 top-[-9px] hidden h-4 w-4 text-nt-beige md:block" aria-hidden />}</div>)}
            </div>
          </div>
        </section>

        <section className="bg-nt-cream py-20 sm:py-28" aria-labelledby="portfolio-title">
          <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-12">
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><SectionLabel>ผลงานของเรา</SectionLabel><h2 id="portfolio-title" className="text-3xl font-bold sm:text-5xl">รายละเอียดที่มองเห็นได้</h2></div><p className="max-w-sm text-sm leading-7 text-nt-muted">งานที่ดีเริ่มจากการใส่ใจในทุกขั้นตอน</p></div>
            <div className="mt-10 grid gap-4 md:grid-cols-12 md:grid-rows-2">
              <div className="group relative min-h-[300px] overflow-hidden md:col-span-7 md:row-span-2"><img src={workSign} alt="ตัวอย่างงานป้ายและสื่อของ NATTA GROUP" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" /><div className="absolute inset-x-0 bottom-0 bg-nt-navy/90 p-5 text-nt-cream"><p className="text-xs text-nt-beige">SIGNAGE & DISPLAY</p><p className="mt-1 font-bold">ป้ายและสื่อที่ทำให้แบรนด์ถูกมองเห็น</p></div></div>
              <div className="group relative min-h-[230px] overflow-hidden md:col-span-5"><img src={workDesign} alt="ตัวอย่างงานออกแบบของ NATTA GROUP" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" /><div className="absolute inset-x-0 bottom-0 bg-nt-navy/90 p-5 text-nt-cream"><p className="text-xs text-nt-beige">DESIGN SERVICE</p><p className="mt-1 font-bold">ออกแบบให้ภาพของคุณชัดขึ้น</p></div></div>
              <div className="flex min-h-[180px] items-end bg-nt-beige p-6 md:col-span-5"><div><p className="text-4xl font-bold text-nt-navy">NATTA</p><p className="mt-2 max-w-xs text-sm leading-6 text-nt-navy-soft">คิด ทำ ผลิต และส่งมอบ — ในมาตรฐานเดียวกัน</p></div></div>
            </div>
          </div>
        </section>

        <section id="contact" className="border-t border-nt-line bg-nt-mist py-20 sm:py-24" aria-labelledby="contact-title">
          <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[1fr_0.9fr] lg:gap-20 lg:px-12">
            <div><SectionLabel>ติดต่อเรา</SectionLabel><h2 id="contact-title" className="text-3xl font-bold leading-tight sm:text-5xl">พร้อมเริ่มงานเมื่อคุณพร้อม</h2><p className="mt-5 max-w-md text-base leading-8 text-nt-muted">ส่งรายละเอียดงานมาให้เราดูได้เลย ทีมงานจะช่วยแนะนำทางเลือกที่เหมาะกับคุณ</p><div className="mt-8 flex flex-wrap gap-3"><Button asChild className="h-12 bg-nt-navy px-6 text-nt-cream hover:bg-nt-navy-soft"><a href={DEFAULT_LINE_OA_URL} target="_blank" rel="noreferrer"><Send className="mr-2 h-4 w-4" aria-hidden />เริ่มคุยผ่าน LINE</a></Button><Button asChild variant="outline" className="h-12 border-nt-navy/30 bg-transparent px-6 text-nt-navy hover:bg-nt-navy/5"><a href="tel:0812345678"><Phone className="mr-2 h-4 w-4" aria-hidden />โทรหาเรา</a></Button></div></div>
            <div className="border-l border-nt-line pl-6 sm:pl-10"><div className="space-y-6 text-sm"><div className="flex gap-4"><MapPin className="mt-1 h-5 w-5 shrink-0 text-nt-blue" aria-hidden /><div><p className="font-bold">NATTA GROUP</p><p className="mt-1 leading-7 text-nt-muted">รับงานออนไลน์และนัดหมายเข้าร้าน<br />กรุงเทพฯ และพื้นที่ใกล้เคียง</p></div></div><div className="flex gap-4"><Clock3 className="mt-1 h-5 w-5 shrink-0 text-nt-blue" aria-hidden /><div><p className="font-bold">เวลาทำการ</p><p className="mt-1 leading-7 text-nt-muted">จันทร์—เสาร์ · 09:00—18:00 น.</p></div></div><div className="flex gap-4"><Instagram className="mt-1 h-5 w-5 shrink-0 text-nt-blue" aria-hidden /><div><p className="font-bold">ติดตามผลงาน</p><p className="mt-1 leading-7 text-nt-muted">@nattagroup · อัปเดตงานใหม่ทุกสัปดาห์</p></div></div></div></div>
          </div>
        </section>
      </main>

      <footer className="bg-nt-navy py-8 text-nt-cream/70"><div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12"><p className="font-bold tracking-[0.16em] text-nt-cream">NATTA GROUP</p><p>© {new Date().getFullYear()} NATTA GROUP · PRINT · DOCUMENT · DESIGN</p><div className="flex gap-5"><Link to="/privacy" className="hover:text-nt-cream">นโยบายความเป็นส่วนตัว</Link><Link to="/terms" className="hover:text-nt-cream">เงื่อนไขการใช้งาน</Link></div></div></footer>
    </div>
  );
}

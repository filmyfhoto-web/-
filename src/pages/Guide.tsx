import { Link } from "react-router-dom";
import { Helmet } from "@/lib/head";
import { ArrowLeft, PlayCircle, ShoppingBag, Download } from "lucide-react";
import { TUTORIAL_VIDEOS, tutorialDeepLink } from "@/lib/tutorialVideos";

/**
 * คู่มือใช้งานแบบข้อความสั้น ๆ (เปิดสาธารณะ ไม่ต้องล็อกอิน)
 * ทุกขั้นตอนมีลิงก์ข้ามไปยังจุดเวลาในวิดีโอสอนบนหน้าแรก
 */
export default function Guide() {
  return (
    <main className="min-h-screen bg-brand-cream">
      <Helmet>
        <title>คู่มือสั่งซื้อสินค้าและติดตามงาน | NATTA GROUP</title>
        <meta
          name="description"
          content="คู่มือแบบข้อความสำหรับเลือกสินค้า ส่งคำขอราคา และติดตามงานกับ NATTA GROUP"
        />
        <link rel="canonical" href="https://www.filmyynatta.com/guide" />
      </Helmet>

      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        <Link
          to="/"
          className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-primary/25 bg-white px-4 text-sm font-bold text-primary hover:bg-accent"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> กลับหน้าแรก
        </Link>

        <h1 className="mt-5 text-3xl font-black text-foreground sm:text-4xl">
          คู่มือสั่งซื้อสินค้า และติดตามงาน
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          อ่านสั้น ๆ ทำตามได้เลย · แตะปุ่ม “ดูในวิดีโอ” เพื่อข้ามไปยังจุดนั้นในคลิปสอนบนหน้าแรก
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            to="/"
            className="inline-flex min-h-11 items-center gap-2 rounded-2xl px-4 text-sm font-bold text-primary-foreground"
            style={{ backgroundImage: "var(--gradient-brand)" }}
          >
            <ShoppingBag className="h-4 w-4" aria-hidden /> กลับหน้าแรก
          </Link>
          <a
            href="/tutorials/natta-guide-th.pdf"
            download="natta-guide-th.pdf"
            data-testid="guide-pdf"
            className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-primary/25 bg-white px-4 text-sm font-bold text-primary hover:bg-accent"
          >
            <Download className="h-4 w-4" aria-hidden /> ดาวน์โหลดคู่มือ PDF
          </a>
        </div>


        <div className="mt-8 space-y-6">
          {TUTORIAL_VIDEOS.map((v) => (
            <section
              key={v.key}
              id={v.key}
              className="rounded-3xl border border-primary/15 bg-white p-5 shadow-[var(--shadow-brand)] sm:p-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black text-foreground">{v.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{v.desc}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    to={tutorialDeepLink(v.key)}
                    className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-primary/25 bg-white px-4 text-sm font-bold text-primary hover:bg-accent"
                  >
                    <PlayCircle className="h-4 w-4" aria-hidden /> ดูวิดีโอเต็ม
                  </Link>
                  <a
                    href={v.srt}
                    download={`${v.key}-th.srt`}
                    className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-primary/25 bg-white px-4 text-sm font-bold text-primary hover:bg-accent"
                  >
                    <Download className="h-4 w-4" aria-hidden /> ซับไทย (.srt)
                  </a>
                </div>
              </div>

              <ol className="mt-4 space-y-3">
                {v.chapters.map((c, i) => (
                  <li
                    key={c.key}
                    className="flex flex-col gap-2 rounded-2xl border border-primary/15 bg-accent/30 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-primary">
                        {i + 1}. {c.label}
                      </p>
                      <p className="text-sm text-muted-foreground">{c.hint}</p>
                      {c.button && (
                        <p className="mt-1 text-xs font-bold text-primary">
                          ปุ่มที่ต้องกด: {c.button}
                        </p>
                      )}
                    </div>
                    <Link
                      to={tutorialDeepLink(v.key, c.at)}
                      data-testid={`guide-jump-${v.key}-${c.key}`}
                      className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-2xl bg-brand px-4 text-sm font-bold text-primary-foreground"
                    >
                      <PlayCircle className="h-4 w-4" aria-hidden /> ดูในวิดีโอ ({Math.floor(c.at / 60)}:
                      {String(Math.floor(c.at % 60)).padStart(2, "0")})
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>

      </div>
    </main>
  );
}

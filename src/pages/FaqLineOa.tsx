import { Link } from "react-router-dom";
import { Helmet } from "@/lib/head";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { AlertCircle, ArrowRight, CheckCircle2, MessageCircle, Sparkles } from "lucide-react";

/**
 * Public FAQ + SEO landing for LINE OA integration.
 * Keywords targeted: ระบบเชื่อม LINE OA, LINE Official Account สำหรับร้านค้า,
 * ระบบตอบกลับลูกค้า LINE OA, ระบบจัดการออเดอร์ผ่าน LINE, เทมเพลตตอบกลับลูกค้า.
 */

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: "LINE Official Account (LINE OA) คืออะไร",
    a: "LINE Official Account หรือ LINE OA คือบัญชี LINE สำหรับธุรกิจ ที่ร้านค้าใช้พูดคุย รับออเดอร์ และส่งข้อความหาลูกค้าได้ผ่านช่องทาง LINE เพียงช่องทางเดียว เหมาะสำหรับร้านถ่ายรูป ร้านปริ้นงาน ร้านเครื่องเขียน และธุรกิจที่รับออเดอร์ผ่าน LINE เป็นหลัก",
  },
  {
    q: "ระบบนี้เชื่อมกับ LINE OA ได้อย่างไร",
    a: "ระบบเชื่อมกับ LINE OA ผ่าน Messaging API ของ LINE เมื่อลูกค้าสั่งซื้อผ่านระบบ แอดมินสามารถกดปุ่มตอบกลับจากหน้ารายละเอียดออเดอร์ เลือกเทมเพลตข้อความภาษาไทย เช่น รับออเดอร์แล้ว แจ้งยอดรวม สินค้าพร้อมรับ แล้วส่งให้ลูกค้าผ่าน LINE Official Account ได้ทันที",
  },
  {
    q: "ต้องเตรียมอะไรบ้างก่อนเชื่อมต่อ",
    a: "1) LINE Official Account (สมัครฟรีที่ LINE for Business)\n2) LINE Developers Account\n3) เปิด Messaging API channel และเก็บ Channel Access Token กับ Channel Secret เอาไว้\n4) Webhook URL สำหรับรับข้อความจากลูกค้า",
  },
  {
    q: "วิธีเปิดใช้งาน Messaging API (Step by step)",
    a: "Step 1: เข้า LINE Developers Console แล้วสร้าง Provider ใหม่\nStep 2: สร้าง Channel แบบ Messaging API แล้วผูกกับ LINE OA ของร้าน\nStep 3: ที่แท็บ Messaging API เปิดใช้งาน และคัดลอก Channel Access Token (long-lived) กับ Channel Secret\nStep 4: นำ Token และ Secret มาบันทึกในระบบที่หน้าตั้งค่า LINE OA",
  },
  {
    q: "วิธีตั้งค่า Webhook URL",
    a: "Step 1: เข้าหน้าตั้งค่า LINE OA ในระบบ แล้วคัดลอก Webhook URL ที่ระบบสร้างให้\nStep 2: กลับไปที่ LINE Developers Console เลือก channel Messaging API\nStep 3: วาง Webhook URL ในช่อง Webhook URL แล้วกด Verify\nStep 4: เปิดสวิตช์ Use webhook ให้เป็น ON\nStep 5: ปิดการใช้ Auto-reply ของ LINE OA เพื่อไม่ให้ตอบซ้อนกับระบบ",
  },
  {
    q: "วิธีทดสอบว่าส่งข้อความได้หรือไม่",
    a: "ในหน้าตั้งค่า LINE OA ให้กดปุ่ม ทดสอบการเชื่อมต่อ ระบบจะเรียก /bot/info เพื่อเช็ก Token และแสดงชื่อ LINE OA ของท่าน หากขึ้นเขียวว่าเชื่อมต่อสำเร็จ แสดงว่าพร้อมส่งข้อความหาลูกค้าที่กด Follow LINE OA ของร้านแล้ว",
  },
  {
    q: "ถ้ายังไม่พร้อมเชื่อม LINE จริง ระบบใช้โหมดคัดลอกข้อความได้ไหม",
    a: "ได้แน่นอน ระบบมีโหมด Copy Message เป็น fallback อัตโนมัติ หาก Token ยังไม่ถูกตั้งค่า หรือลูกค้าคนนั้นยังไม่ได้ผูก LINE ระบบจะคัดลอกข้อความให้ทันที เพื่อให้แอดมินนำไปวางใน LINE OA ด้วยตัวเองได้ ข้อความจะยังคงจัดรูปแบบและขึ้นบรรทัดอย่างถูกต้อง",
  },
  {
    q: "วิธีส่งข้อความตอบกลับลูกค้าจากหน้าออเดอร์",
    a: "Step 1: เปิดหน้ารายละเอียดออเดอร์\nStep 2: กดปุ่ม ตอบกลับลูกค้าผ่าน LINE OA\nStep 3: เลือกเทมเพลต เช่น รับออเดอร์แล้ว / แจ้งยอดรวม / สินค้าพร้อมรับ\nStep 4: ระบบจะแทนค่าตัวแปรจากข้อมูลออเดอร์จริง เช่น ชื่อลูกค้า เลขออเดอร์ ยอดรวม\nStep 5: ตรวจ preview แก้ไขข้อความได้ตามต้องการ แล้วกด ส่ง LINE OA หรือ คัดลอกข้อความ",
  },
  {
    q: "วิธีใช้เทมเพลตข้อความตอบกลับ",
    a: "แอดมินสามารถเข้าไปที่เมนู เทมเพลตตอบกลับ LINE OA เพื่อเพิ่ม แก้ไข ลบ หรือเปิด/ปิดการใช้งานเทมเพลต โดยรองรับตัวแปร {{customer_name}}, {{order_number}}, {{order_items}}, {{total_amount}}, {{pickup_date}} ฯลฯ เพื่อให้ข้อความถูกต้องกับออเดอร์อัตโนมัติ",
  },
];

const TROUBLESHOOTING: Array<{ q: string; a: string }> = [
  {
    q: "Access Token ไม่ถูกต้อง",
    a: "ให้ตรวจสอบว่าใช้ Channel Access Token แบบ long-lived จาก Messaging API channel เท่านั้น ไม่ใช่ Token ของ LINE Login และคัดลอกครบทุกตัวอักษรโดยไม่มีช่องว่างต้น/ท้าย",
  },
  {
    q: "Webhook ไม่ทำงาน",
    a: "ตรวจสอบว่าเปิดสวิตช์ Use webhook เป็น ON แล้ว, Webhook URL ตรงกับที่ระบบให้, และ Verify ผ่านจาก LINE Developers Console",
  },
  {
    q: "ส่งข้อความไม่เข้า LINE",
    a: "ลูกค้าต้อง Follow LINE OA ของร้านก่อน ระบบจึงจะส่ง Push Message ให้ได้ หากลูกค้ายังไม่เคยผูก LINE ระบบจะ fallback เป็นโหมดคัดลอกข้อความให้อัตโนมัติ",
  },
  {
    q: "ภาษาไทยเพี้ยน",
    a: "ระบบเราใช้ UTF-8 ทั้งฝั่งเว็บ ฐานข้อมูล และการส่ง LINE ข้อความไทยจะไม่เพี้ยน หากพบปัญหาให้ลองรีเฟรชหน้า และตรวจสอบว่าคัดลอกจาก preview ตรงในระบบ ไม่ผ่านโปรแกรมอื่นที่แปลง encoding",
  },
  {
    q: "ลูกค้าไม่ได้รับข้อความ",
    a: "ตรวจสอบว่า 1) LINE OA ยังไม่โดนบล็อกจากลูกค้า 2) ลูกค้ายังไม่ยกเลิกการเป็นเพื่อน 3) Token ยังใช้งานได้ 4) โควตาการส่งข้อความรายเดือนของ LINE OA ยังเหลือ",
  },
];

function faqJsonLd() {
  const all = [...FAQ, ...TROUBLESHOOTING];
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: all.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export default function FaqLineOa() {
  const title = "เชื่อม LINE OA สำหรับร้านค้า — ตอบกลับและแจ้งสถานะออเดอร์";
  const description =
    "เชื่อม LINE OA กับระบบร้านค้า ตอบกลับลูกค้า แจ้งยอด และสถานะออเดอร์ผ่าน LINE Official Account ได้ในที่เดียว";

  return (
    <main lang="th" className="min-h-screen bg-gradient-soft">
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href="https://www.filmyynatta.com/faq/line-oa" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content="https://www.filmyynatta.com/faq/line-oa" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <script type="application/ld+json">{JSON.stringify(faqJsonLd())}</script>
      </Helmet>

      <div className="max-w-4xl mx-auto px-4 py-8 lg:py-14 space-y-10">
        {/* Hero / SEO Landing Section */}
        <section className="text-center space-y-4">
          <Badge className="bg-[#06C755] text-white">LINE Official Account</Badge>
          <h1 className="text-3xl lg:text-4xl font-bold leading-tight">
            ระบบเชื่อม LINE OA สำหรับร้านค้า
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            {description}
          </p>
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <Button asChild className="rounded-xl">
              <Link to="/admin/line-settings">
                เริ่มตั้งค่า LINE OA <ArrowRight className="w-4 h-4 ml-1" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="rounded-xl">
              <Link to="/admin/reply-templates">จัดการเทมเพลตตอบกลับ</Link>
            </Button>
          </div>
        </section>

        {/* Benefits */}
        <section aria-labelledby="benefits">
          <h2 id="benefits" className="text-2xl font-bold mb-4">
            ทำไมร้านค้าต้องใช้ระบบจัดการออเดอร์ผ่าน LINE OA
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {[
              {
                icon: MessageCircle,
                t: "ระบบตอบกลับลูกค้า LINE OA",
                d: "แอดมินตอบกลับลูกค้าได้จากหน้าออเดอร์โดยตรง เลือกเทมเพลตข้อความภาษาไทย แล้วส่งผ่าน LINE Official Account ได้ทันที",
              },
              {
                icon: Sparkles,
                t: "เทมเพลตตอบกลับลูกค้าพร้อมใช้",
                d: "มีเทมเพลตพร้อมใช้กว่า 10 แบบ: รับออเดอร์แล้ว, แจ้งยอดรวม, สินค้าพร้อมรับ, รอเสนอราคา, ยืนยันชำระเงิน — พร้อมตัวแปรอัตโนมัติ",
              },
              {
                icon: CheckCircle2,
                t: "ระบบจัดการออเดอร์ผ่าน LINE",
                d: "รวมออเดอร์ทุกช่องทางไว้ที่เดียว แอดมินติดตามสถานะ เปลี่ยนสถานะ และแจ้งลูกค้าผ่าน LINE ได้ในคลิกเดียว",
              },
              {
                icon: AlertCircle,
                t: "ระบบส่งข้อความหาลูกค้าอัตโนมัติ",
                d: "หากยังไม่ได้เปิดใช้งาน API ระบบมีโหมดคัดลอกข้อความให้ทันที ใช้งานได้แม้ไม่มี Channel Access Token",
              },
            ].map((b, i) => (
              <Card key={i} className="rounded-2xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <b.icon className="w-4 h-4 text-primary" />
                    {b.t}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground leading-relaxed">
                  {b.d}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Use cases */}
        <section aria-labelledby="use-cases" className="rounded-2xl border border-border bg-card p-6">
          <h2 id="use-cases" className="text-xl font-bold mb-3">
            ตัวอย่างการใช้งาน โปรแกรมจัดการออเดอร์ LINE OA
          </h2>
          <ul className="list-disc pl-6 space-y-1.5 text-sm leading-relaxed">
            <li>ร้านปริ้นงาน / ถ่ายเอกสาร รับไฟล์งานผ่าน LINE แล้วแจ้งราคาและวันรับได้ทันที</li>
            <li>ร้านถ่ายรูป / ปริ้นภาพ ส่งใบเสนอราคาและแจ้งสถานะสินค้าพร้อมรับให้ลูกค้าผ่าน LINE</li>
            <li>ร้านเครื่องเขียน / อุปกรณ์การเรียน ตอบกลับโรงเรียนและหน่วยงานอย่างเป็นระบบ</li>
            <li>ธุรกิจที่รับออเดอร์และตอบกลับผ่าน LINE Official Account เป็นหลัก</li>
          </ul>
        </section>

        {/* Sample message */}
        <section aria-labelledby="sample" className="rounded-2xl border border-border bg-accent/30 p-6">
          <h2 id="sample" className="text-xl font-bold mb-3">
            ตัวอย่างข้อความตอบกลับภาษาไทย
          </h2>
          <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans bg-background border border-border rounded-xl p-4">
{`สวัสดีค่ะ คุณสมชาย ใจดี
ทางร้านได้รับออเดอร์เลขที่ GO-2601-0123 เรียบร้อยแล้วค่ะ

รายการสินค้า:
• กระดาษการ์ดสีขาว 150 แกรม × 2 แพ็ค = 250.00 บาท
• ปริ้นงาน A4 สี × 10 แผ่น = 100.00 บาท

ยอดรวมทั้งหมด: 350.00 บาท

ทางร้านจะตรวจสอบและแจ้งกลับอีกครั้งนะคะ 🙏
ร้านนัฐภรณ์ เชียงกลาง`}
          </pre>
        </section>

        {/* FAQ */}
        <section aria-labelledby="faq">
          <h2 id="faq" className="text-2xl font-bold mb-4">
            คำถามที่พบบ่อย — การเชื่อม LINE Official Account
          </h2>
          <Accordion type="single" collapsible className="rounded-2xl border border-border bg-card">
            {FAQ.map((f, i) => (
              <AccordionItem key={i} value={`f-${i}`} className="px-4">
                <AccordionTrigger className="text-left text-base font-medium">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="whitespace-pre-line text-sm leading-relaxed">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        {/* Warning box */}
        <aside className="rounded-2xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm leading-relaxed">
            <b>ข้อควรรู้:</b> Channel Access Token และ Channel Secret เป็นข้อมูลลับ
            ระบบจะเก็บใน Secret Storage ปลอดภัยเท่านั้น ไม่บันทึกลงฐานข้อมูล
            และไม่แสดง Token เต็มหลังจากบันทึกแล้ว
          </div>
        </aside>

        {/* Troubleshooting */}
        <section aria-labelledby="troubleshoot">
          <h2 id="troubleshoot" className="text-2xl font-bold mb-4">
            ปัญหาที่พบบ่อยและวิธีแก้
          </h2>
          <Accordion type="single" collapsible className="rounded-2xl border border-border bg-card">
            {TROUBLESHOOTING.map((f, i) => (
              <AccordionItem key={i} value={`t-${i}`} className="px-4">
                <AccordionTrigger className="text-left text-base font-medium">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="whitespace-pre-line text-sm leading-relaxed">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        {/* CTA */}
        <section className="rounded-2xl bg-gradient-primary text-primary-foreground p-6 text-center space-y-3">
          <h2 className="text-xl font-bold">พร้อมเริ่มใช้งานระบบเชื่อม LINE OA แล้วหรือยัง</h2>
          <p className="text-sm opacity-90">
            เข้าไปตั้งค่า LINE Official Account หรือจัดการเทมเพลตข้อความตอบกลับได้เลย
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild variant="secondary" className="rounded-xl">
              <Link to="/admin/line-settings">เริ่มตั้งค่า LINE OA</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-xl bg-white/10 border-white/40 text-white hover:bg-white/20">
              <Link to="/admin/reply-templates">จัดการเทมเพลตตอบกลับ</Link>
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}
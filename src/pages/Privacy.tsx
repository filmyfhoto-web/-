import { Link } from "react-router-dom";
import { ArrowLeft, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import SeoHead from "@/components/SeoHead";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-gradient-soft">
      <SeoHead
        title="นโยบายความเป็นส่วนตัว — ร้านนัฐภรณ์ เชียงกลาง"
        description="นโยบายความเป็นส่วนตัวของร้านนัฐภรณ์ เชียงกลาง เกี่ยวกับการเก็บ ใช้ และดูแลข้อมูลลูกค้า"
        path="/privacy-policy"
      />

      <header className="sticky top-0 z-30 backdrop-blur bg-background/80 border-b border-border">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-bold text-lg">
            <div className="w-9 h-9 rounded-xl bg-primary grid place-items-center text-primary-foreground">
              <Shield className="w-5 h-5" />
            </div>
            <span className="hidden sm:inline">ร้านนัฐภรณ์ เชียงกลาง</span>
          </Link>
          <Button asChild variant="ghost" size="sm" className="rounded-xl">
            <Link to="/">
              <ArrowLeft className="w-4 h-4 mr-2" />
              กลับหน้าหลัก
            </Link>
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-10 max-w-3xl">
        <Card className="shadow-card">
          <CardHeader>
            <h1 className="text-2xl md:text-3xl font-semibold leading-none tracking-tight">นโยบายความเป็นส่วนตัว</h1>

            <p className="text-sm text-muted-foreground">ปรับปรุงล่าสุด: {new Date().getFullYear()}</p>
          </CardHeader>
          <CardContent className="space-y-6 text-foreground/90 leading-relaxed">
            <section>
              <h2 className="text-lg font-semibold mb-2">1. ข้อมูลที่เราเก็บรวบรวม</h2>
              <p>
                เมื่อท่านสมัครสมาชิก สั่งซื้อสินค้า/บริการ หรือใช้งานระบบของร้าน เราอาจเก็บรวบรวมข้อมูลต่อไปนี้:
              </p>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>ชื่อ-นามสกุล ชื่อหน่วยงาน/องค์กร</li>
                <li>เบอร์โทรศัพท์ และอีเมล</li>
                <li>ข้อมูลบัญชี LINE (เมื่อท่านเลือกผูกบัญชีเพื่อรับแจ้งเตือน)</li>
                <li>รายการสั่งซื้อ ใบเสนอราคา ใบส่งของ ใบเสร็จรับเงิน และข้อมูลการชำระเงิน</li>
                <li>ที่อยู่จัดส่งหรือสถานที่ติดต่อ (หากมีการจัดส่ง)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2">2. วัตถุประสงค์ในการใช้ข้อมูล</h2>
              <p>เรานำข้อมูลของท่านไปใช้เพื่อ:</p>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>ยืนยันตัวตนและจัดการบัญชีผู้ใช้</li>
                <li>สร้างและติดตามรายการสั่งซื้อ ใบเสนอราคา และเอกสารทางการค้า</li>
                <li>ส่งแจ้งเตือนสถานะงานผ่านอีเมลหรือ LINE Official Account</li>
                <li>ติดต่อกลับเพื่อยืนยันรายการ หรือแจ้งปัญหาที่เกี่ยวข้อง</li>
                <li>ออกเอกสารทางบัญชีและรายงานสรุปยอดการขายภายในร้าน</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2">3. การผูกบัญชี LINE</h2>
              <p>
                ท่านสามารถเลือกผูกบัญชี LINE เพื่อรับข้อความแจ้งเตือน เช่น สถานะคำสั่งซื้อ หรือการยืนยันการผูกบัญชีสำเร็จ
                ท่านสามารถยกเลิกการผูกบัญชีได้ตลอดเวลาจากหน้า "บัญชีของฉัน"
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2">4. การจัดเก็บและความปลอดภัย</h2>
              <p>
                ข้อมูลของท่านถูกจัดเก็บบนบริการคลาวด์ที่มีมาตรฐานความปลอดภัย โดยมีการควบคุมสิทธิ์การเข้าถึง
                ระบบยืนยันตัวตน และการเข้ารหัสในการส่งข้อมูล เฉพาะผู้ที่มีสิทธิ์เท่านั้นจึงจะสามารถเข้าถึงข้อมูลของท่านได้
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2">5. การแบ่งปันข้อมูล</h2>
              <p>
                เราไม่ขาย ไม่ให้เช่า และไม่เปิดเผยข้อมูลส่วนบุคคลของท่านให้กับบุคคลภายนอก เว้นแต่จะได้รับความยินยอมจากท่าน
                หรือจำเป็นต้องปฏิบัติตามกฎหมาย
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2">6. สิทธิ์ของท่าน</h2>
              <p>
                ท่านมีสิทธิ์ขอเข้าถึง แก้ไข หรือขอลบข้อมูลของตนเองได้ หากมีข้อสงสัยหรือต้องการใช้สิทธิ์
                กรุณาติดต่อเจ้าหน้าที่ของร้าน
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2">7. การเปลี่ยนแปลงนโยบาย</h2>
              <p>
                เราอาจปรับปรุงนโยบายความเป็นส่วนตัวนี้เป็นครั้งคราว โดยจะแจ้งให้ท่านทราบผ่านทางเว็บไซต์หรือช่องทางแจ้งเตือนที่เกี่ยวข้อง
                การใช้งานต่อไปถือว่าท่านยอมรับเงื่อนไขฉบับปรับปรุง
              </p>
            </section>
          </CardContent>
        </Card>
      </main>

      <footer className="border-t border-border bg-background/80">
        <div className="container mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} ร้านนัฐภรณ์ เชียงกลาง</span>
          <div className="flex items-center gap-4">
            <Link to="/privacy-policy" className="hover:text-foreground transition-colors">นโยบายความเป็นส่วนตัว</Link>
            <Link to="/terms-of-use" className="hover:text-foreground transition-colors">เงื่อนไขการใช้งาน</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

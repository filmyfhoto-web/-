import { Link } from "react-router-dom";
import { ArrowLeft, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import SeoHead from "@/components/SeoHead";

export default function Terms() {
  return (
    <div className="min-h-screen bg-gradient-soft">
      <SeoHead
        title="เงื่อนไขการใช้งาน — ร้านนัฐภรณ์ เชียงกลาง"
        description="เงื่อนไขการใช้งานระบบของร้านนัฐภรณ์ เชียงกลาง สำหรับสมาชิก การสั่งซื้อ และการใช้บริการเอกสาร"
        path="/terms-of-use"
      />

      <header className="sticky top-0 z-30 backdrop-blur bg-background/80 border-b border-border">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-bold text-lg">
            <div className="w-9 h-9 rounded-xl bg-primary grid place-items-center text-primary-foreground">
              <FileText className="w-5 h-5" />
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
            <h1 className="text-2xl md:text-3xl font-semibold leading-none tracking-tight">เงื่อนไขการใช้งาน</h1>

            <p className="text-sm text-muted-foreground">ปรับปรุงล่าสุด: {new Date().getFullYear()}</p>
          </CardHeader>
          <CardContent className="space-y-6 text-foreground/90 leading-relaxed">
            <section>
              <h2 className="text-lg font-semibold mb-2">1. การยอมรับเงื่อนไข</h2>
              <p>
                การใช้งานเว็บไซต์และระบบของร้านนัฐภรณ์ เชียงกลาง ถือว่าท่านได้อ่าน เข้าใจ และยอมรับเงื่อนไขการใช้งานนี้แล้ว
                หากท่านไม่เห็นด้วย กรุณาหยุดใช้งานระบบ
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2">2. การสมัครสมาชิกและเข้าสู่ระบบ</h2>
              <p>
                ท่านต้องให้ข้อมูลที่ถูกต้องและเป็นปัจจุบันในการสมัครสมาชิก ท่านมีหน้าที่รักษาความปลอดภัยของรหัสผ่านและบัญชีของตน
                หากพบการใช้งานโดยไม่ได้รับอนุญาต กรุณาแจ้งทางร้านทันที
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2">3. การผูกบัญชี LINE</h2>
              <p>
                ท่านสามารถเลือกผูกบัญชี LINE Official Account เพื่อรับข้อความแจ้งเตือน การผูกบัญชีเป็นไปโดยสมัครใจ
                และท่านสามารถยกเลิกการผูกได้ตลอดเวลา
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2">4. การสั่งซื้อสินค้า/บริการ</h2>
              <p>
                การสั่งซื้อผ่านระบบถือเป็นการเสนอซื้อ ทางร้านจะตรวจสอบสต็อกและยืนยันรายการอีกครั้งก่อนดำเนินการ
                ราคาที่แสดงอาจมีการเปลี่ยนแปลงตามกลุ่มลูกค้า โปรโมชั่น หรือเงื่อนไขเฉพาะ
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2">5. การออกเอกสาร</h2>
              <p>
                ระบบรองรับการออกใบเสนอราคา ใบส่งของ และใบเสร็จรับเงิน โดยเอกสารมีการรันเลขที่ไม่ซ้ำกัน
                ทางร้านขอสงวนสิทธิ์ในการตรวจสอบและแก้ไขข้อมูลเอกสารตามความเหมาะสม
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2">6. การชำระเงิน</h2>
              <p>
                ท่านต้องชำระเงินตามเงื่อนไขที่ตกลงกันไว้ หากมีหลักฐานการชำระเงิน กรุณาอัปโหลดหรือแจ้งทางร้านเพื่อยืนยัน
                การยกเลิกรายการหลังชำระเงินอาจต้องดำเนินการตามนโยบายการคืนเงินของร้าน
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2">7. การยกเลิก/แก้ไขคำสั่งซื้อ</h2>
              <p>
                ท่านสามารถขอยกเลิกหรือแก้ไขคำสั่งซื้อได้ ทั้งนี้ขึ้นอยู่กับสถานะของรายการ หากรายการดำเนินการไปแล้ว
                ทางร้านอาจไม่สามารถยกเลิกได้ และจะบันทึกเหตุผลไว้ตรวจสอบ
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2">8. ข้อจำกัดความรับผิดชอบ</h2>
              <p>
                ระบบของร้านจัดทำขึ้นเพื่ออำนวยความสะดวกในการสั่งซื้อและออกเอกสาร ทางร้านไม่รับผิดชอบต่อความเสียหาย
                ที่เกิดจากการใช้งานนอกเหนือความเหมาะสม หรือจากเหตุสุดวิสัยที่ทำให้ระบบไม่สามารถให้บริการได้ชั่วคราว
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2">9. การเปลี่ยนแปลงเงื่อนไข</h2>
              <p>
                ทางร้านขอสงวนสิทธิ์ในการแก้ไขเงื่อนไขการใช้งานเมื่อใดก็ได้ โดยจะแจ้งให้ทราบผ่านเว็บไซต์
                การใช้งานต่อเนื่องถือว่าท่านยอมรับเงื่อนไขฉบับปรับปรุง
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2">10. ติดต่อเรา</h2>
              <p>
                หากท่านมีคำถามหรือข้อสงสัยเกี่ยวกับเงื่อนไขการใช้งาน กรุณาติดต่อเจ้าหน้าที่ของร้านผ่านช่องทางที่ระบุในเว็บไซต์
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

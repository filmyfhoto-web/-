import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ShoppingBag } from "lucide-react";
import SeoHead from "@/components/SeoHead";

/** หน้าแทนที่หน้าที่ปิดให้บริการแล้ว — ไม่มีลิงก์ออกไปภายนอก */
export default function MovedToMyShop() {
  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
      <SeoHead
        title="หน้านี้ปิดให้บริการแล้ว"
        description="หน้านี้ถูกปิดให้บริการ กรุณากลับไปหน้าแรกเพื่อสั่งงานหรือดูสินค้า"
        path="/"
      />
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-primary/10 text-primary">
        <ShoppingBag className="h-8 w-8" />
      </div>
      <h1 className="text-2xl font-bold">หน้านี้ปิดให้บริการแล้ว</h1>
      <p className="text-muted-foreground">
        สั่งงานหรือดูสินค้าได้จากหน้าแรกของ NATTA GROUP ได้เลย
      </p>
      <div className="flex w-full flex-col gap-2">
        <Button asChild size="lg"><Link to="/">กลับหน้าแรก</Link></Button>
      </div>
    </main>
  );
}

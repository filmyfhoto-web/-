import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useHubData } from "@/components/admin/hub/useHubData";
import CustomersTab from "@/components/admin/hub/CustomersTab";

/**
 * “จับคู่ลูกค้ากับ LINE ด้วยมือ” — ย้ายมาจากหน้า /admin/customer-hub เดิม
 * โหลดข้อมูลศูนย์รวมลูกค้า (useHubData) เฉพาะตอนคอมโพเนนต์นี้ถูก mount เท่านั้น
 * จึงต้อง import แบบ lazy จากหน้า work-docs
 */
export default function LineMatchDialog({ onClose }: { onClose: () => void }) {
  const data = useHubData();

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[min(1200px,96vw)] max-h-[92vh] overflow-auto" data-testid="work-line-match-dialog">
        <DialogHeader>
          <DialogTitle>จับคู่ลูกค้ากับบัญชี LINE</DialogTitle>
          <DialogDescription>
            เลือกลูกค้าในระบบทางซ้าย แล้วเลือกบัญชี LINE ที่ทักเข้ามาเพื่อจับคู่ด้วยมือ
          </DialogDescription>
        </DialogHeader>
        <CustomersTab data={data} />
      </DialogContent>
    </Dialog>
  );
}

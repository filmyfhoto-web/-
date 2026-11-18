import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { UserPlus } from "lucide-react";

export type QuickLineTarget = {
  line_user_id: string;
  display_name?: string | null;
};

/**
 * “สร้างลูกค้าใหม่ + เชื่อมเลย” — สำหรับบัญชี LINE ที่ทักเข้ามาแต่ยังไม่มีชื่อในระบบ
 * ใช้ RPC เดิมของระบบ (admin_create_line_customer) ที่สร้างรายชื่อลูกค้าและผูก LINE ในขั้นตอนเดียว
 */
export default function QuickLineCustomerDialog({
  target,
  onOpenChange,
  onDone,
}: {
  target: QuickLineTarget | null;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(target?.display_name?.trim() || "");
    setPhone("");
  }, [target?.line_user_id, target?.display_name]);

  async function save(force = false) {
    if (!target) return;
    setSaving(true);
    const { data: res, error } = await (supabase as any).rpc("admin_create_line_customer", {
      p_line_user_id: target.line_user_id,
      p_name: name.trim() || target.display_name || null,
      p_phone: phone.trim() || null,
      p_force: force,
    });
    setSaving(false);
    if (error) { toast.error(`สร้างลูกค้าไม่สำเร็จ: ${error.message}`); return; }
    if (res && res.ok === false) {
      if (res.conflict && !force) {
        if (window.confirm("บัญชี LINE นี้ผูกกับลูกค้ารายอื่นอยู่แล้ว ต้องการสร้างใหม่และเขียนทับหรือไม่?")) {
          return save(true);
        }
        return;
      }
      toast.error(`สร้างลูกค้าไม่สำเร็จ: ${res.reason ?? "unknown"}`);
      return;
    }
    toast.success(`สร้างลูกค้า “${res?.name ?? name}” และเชื่อม LINE แล้ว`);
    onOpenChange(false);
    await onDone?.();
  }

  return (
    <Dialog open={Boolean(target)} onOpenChange={onOpenChange}>
      <DialogContent data-testid="hub-quick-line-customer">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" /> สร้างลูกค้าใหม่ + เชื่อม LINE
          </DialogTitle>
          <DialogDescription>
            บัญชี LINE: <b>{target?.display_name || target?.line_user_id || "—"}</b>
            <br />
            ตั้งชื่อลูกค้าให้เรียบร้อย แล้วกดยืนยัน ระบบจะสร้างรายชื่อและผูก LINE ให้ทันที
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label className="block text-xs font-semibold">ชื่อลูกค้า</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ชื่อที่ใช้เรียกลูกค้า"
            data-testid="hub-quick-line-name"
          />
          <label className="block text-xs font-semibold">เบอร์โทร (ถ้ามี)</label>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="08x-xxx-xxxx"
            inputMode="tel"
            data-testid="hub-quick-line-phone"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>ยกเลิก</Button>
          <Button onClick={() => void save(false)} disabled={saving || !name.trim()} data-testid="hub-quick-line-save">
            {saving ? "กำลังบันทึก..." : "สร้างและเชื่อมเลย"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

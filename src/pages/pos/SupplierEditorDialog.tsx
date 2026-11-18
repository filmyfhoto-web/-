import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface SupplierRow {
  id: string;
  name: string;
  code?: string | null;
  branch?: string | null;
  tax_id?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  note?: string | null;
  is_active?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange(o: boolean): void;
  initial?: Partial<SupplierRow> | null;
  onSaved?(id: string): void;
}

export default function SupplierEditorDialog({ open, onOpenChange, initial, onSaved }: Props) {
  const [row, setRow] = useState<Partial<SupplierRow>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) setRow({ is_active: true, ...(initial || {}) }); }, [open, initial]);

  async function save() {
    if (!row.name?.trim()) { toast.error("กรุณากรอกชื่อ"); return; }
    setBusy(true);
    try {
      const { data, error } = await (supabase as any).rpc("pos_supplier_upsert", { p: row });
      if (error) throw error;
      toast.success("บันทึกผู้ขายแล้ว");
      onSaved?.(data as string);
      onOpenChange(false);
    } catch (e: any) { toast.error(e?.message || "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="pos-supplier-dialog">
        <DialogHeader>
          <DialogTitle>{row.id ? "แก้ไขผู้ขาย" : "เพิ่มผู้ขาย"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>ชื่อผู้ขาย *</Label>
            <Input value={row.name || ""} onChange={(e) => setRow({ ...row, name: e.target.value })} data-testid="pos-supplier-name" /></div>
          <div><Label>รหัสผู้ขาย</Label>
            <Input value={row.code || ""} onChange={(e) => setRow({ ...row, code: e.target.value })} /></div>
          <div><Label>สาขา</Label>
            <Input value={row.branch || ""} onChange={(e) => setRow({ ...row, branch: e.target.value })} /></div>
          <div><Label>เลขผู้เสียภาษี</Label>
            <Input value={row.tax_id || ""} onChange={(e) => setRow({ ...row, tax_id: e.target.value })} /></div>
          <div><Label>โทรศัพท์</Label>
            <Input value={row.phone || ""} onChange={(e) => setRow({ ...row, phone: e.target.value })} /></div>
          <div className="col-span-2"><Label>อีเมล</Label>
            <Input type="email" value={row.email || ""} onChange={(e) => setRow({ ...row, email: e.target.value })} /></div>
          <div className="col-span-2"><Label>ที่อยู่</Label>
            <Textarea rows={2} value={row.address || ""} onChange={(e) => setRow({ ...row, address: e.target.value })} /></div>
          <div className="col-span-2"><Label>หมายเหตุ</Label>
            <Textarea rows={2} value={row.note || ""} onChange={(e) => setRow({ ...row, note: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
          <Button disabled={busy} onClick={save} data-testid="pos-supplier-save">บันทึก</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

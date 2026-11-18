import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { ArrowLeft, ShieldQuestion, Send } from "lucide-react";

type StaffRole = "admin" | "stock_staff" | "photo_staff";

const ROLE_LABEL: Record<StaffRole, string> = {
  admin: "Admin — เข้าถึงแดชบอร์ด/รายงานได้เต็ม",
  stock_staff: "Stock staff — POS + สต๊อก + PO",
  photo_staff: "Photo staff — POS + จัดการรูปสินค้า",
};

export default function StaffRoleRequest() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [role, setRole] = useState<StaffRole>("stock_staff");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [binding, setBinding] = useState<
    { id: string; status: string; requested_role: string | null; note: string | null; approved_at: string | null } | null
  >(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("staff_line_bindings")
      .select("id,status,requested_role,note,approved_at")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setBinding(data as any);
          if (data.requested_role) setRole(data.requested_role as StaffRole);
          if (data.note) setNote(data.note);
        }
      });
  }, [user]);

  async function submit() {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("staff_request_role_change" as any, {
        p_role: role,
        p_note: note.trim() || null,
      });
      if (error) throw error;
      toast.success("ส่งคำขอถึงเจ้าของกิจการแล้ว");
      setBinding((b) => (b ? { ...b, requested_role: role, note: note.trim() || null } : b));
    } catch (e: any) {
      toast.error(e?.message || "ส่งคำขอไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto" data-testid="staff-role-request">
      <div className="mb-4 flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => nav(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> ย้อนกลับ
        </Button>
      </div>
      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldQuestion className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold">ขอปรับสิทธิ์ / เปลี่ยนบทบาท</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          กรอกบทบาทที่ต้องการและเหตุผลสั้นๆ ระบบจะแจ้งเตือนเจ้าของกิจการเพื่อพิจารณาอนุมัติที่หน้าจัดการพนักงาน
        </p>

        {binding?.requested_role && (
          <div className="rounded-md border bg-muted/40 p-3 text-sm" data-testid="pending-request">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="border-warning text-warning">รอเจ้าของอนุมัติ</Badge>
              <span className="font-medium">{binding.requested_role}</span>
            </div>
            {binding.note && <div className="text-muted-foreground">หมายเหตุ: {binding.note}</div>}
          </div>
        )}

        <div>
          <label className="text-sm font-medium">บทบาทที่ต้องการ</label>
          <Select value={role} onValueChange={(v) => setRole(v as StaffRole)}>
            <SelectTrigger data-testid="role-select"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(ROLE_LABEL) as StaffRole[]).map((k) => (
                <SelectItem key={k} value={k}>{ROLE_LABEL[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium">เหตุผล / รายละเอียด (ไม่บังคับ)</label>
          <Textarea
            data-testid="role-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="เช่น ต้องช่วยดูรายงาน / รับสินค้าเข้าคลังเพิ่ม"
            rows={4}
          />
        </div>

        <div className="flex gap-2">
          <Button onClick={submit} disabled={busy} data-testid="submit-request">
            <Send className="h-4 w-4 mr-1" /> {busy ? "กำลังส่ง..." : "ส่งคำขอ"}
          </Button>
          <Button variant="outline" asChild>
            <Link to="/pos/staff">ยกเลิก</Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}
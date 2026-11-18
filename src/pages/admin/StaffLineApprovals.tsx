import AdminLayout from "@/components/layout/AdminLayout";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { RefreshCw, Check, Ban, ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";

type Row = {
  id: string;
  user_id: string | null;
  line_user_id: string;
  display_name: string | null;
  picture_url: string | null;
  status: "pending" | "approved" | "revoked";
  approved_at: string | null;
  created_at: string;
  requested_role?: "admin" | "stock_staff" | "photo_staff" | null;
  note?: string | null;
};

type StaffRole = "admin" | "stock_staff" | "photo_staff";

export default function StaffLineApprovals() {
  const { isOwner, loading } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [approving, setApproving] = useState<Row | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("stock_staff");
  const [busy, setBusy] = useState(false);

  async function load() {
    setRefreshing(true);
    const { data, error } = await supabase
      .from("staff_line_bindings")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    setRefreshing(false);
    if (error) return toast.error(error.message);
    setRows((data as Row[]) || []);
  }
  useEffect(() => { if (isOwner) load(); }, [isOwner]);

  useEffect(() => {
    if (approving?.requested_role) setRole(approving.requested_role);
  }, [approving]);

  if (loading) return null;
  if (!isOwner) return <Navigate to="/admin/home" replace />;

  async function approve() {
    if (!approving) return;
    setBusy(true);
    try {
      // Resolve user_id from email (owner must ensure the auth user exists).
      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("id,email")
        .ilike("email", email.trim())
        .maybeSingle();
      if (profErr) throw profErr;
      if (!prof?.id) {
        throw new Error("ไม่พบผู้ใช้อีเมลนี้ — กรุณาสร้างบัญชีก่อนที่หน้าสมัคร/พนักงาน");
      }
      const { error } = await supabase.rpc("owner_approve_staff_line" as any, {
        p_binding: approving.id,
        p_user_id: prof.id,
        p_role: role,
      });
      if (error) throw error;
      toast.success("อนุมัติเรียบร้อย");
      setApproving(null);
      setEmail("");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "อนุมัติไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(r: Row) {
    if (!confirm(`เพิกถอนสิทธิ์ของ ${r.display_name || r.line_user_id}?`)) return;
    const { error } = await supabase.rpc("owner_revoke_staff_line" as any, { p_binding: r.id });
    if (error) return toast.error(error.message);
    toast.success("เพิกถอนแล้ว");
    load();
  }

  function badge(s: string) {
    if (s === "approved") return <Badge className="bg-success text-white">อนุมัติแล้ว</Badge>;
    if (s === "revoked") return <Badge variant="outline" className="border-destructive text-destructive">เพิกถอน</Badge>;
    return <Badge variant="outline" className="border-warning text-warning">รออนุมัติ</Badge>;
  }

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary" /> อนุมัติพนักงาน LINE
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            เจ้าของกิจการเท่านั้นที่ทำหน้านี้ได้ — อนุมัติหลังตรวจสอบตัวตนพนักงาน
          </p>
        </div>
        <Button variant="outline" onClick={load} disabled={refreshing}>
          <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? "animate-spin" : ""}`} /> รีเฟรช
        </Button>
      </div>

      <div className="grid gap-3">
        {rows.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground">ยังไม่มีคำขอ</Card>
        )}
        {rows.map((r) => (
          <Card key={r.id} className="p-4 flex items-center gap-4">
            {r.picture_url ? (
              <img src={r.picture_url} alt="" className="w-12 h-12 rounded-full" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-muted" />
            )}
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">{r.display_name || "-"}</div>
              <div className="text-xs text-muted-foreground truncate">LINE ID: {r.line_user_id}</div>
              <div className="text-xs text-muted-foreground">
                ขอเมื่อ {new Date(r.created_at).toLocaleString("th-TH")}
              </div>
              {r.requested_role && (
                <div className="mt-1 text-xs">
                  <Badge variant="outline" className="border-primary text-primary">
                    ขอบทบาท: {r.requested_role}
                  </Badge>
                </div>
              )}
              {r.note && (
                <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  หมายเหตุ: {r.note}
                </div>
              )}
            </div>
            <div>{badge(r.status)}</div>
            <div className="flex gap-2">
              {r.status !== "approved" && (
                <Button size="sm" onClick={() => setApproving(r)}>
                  <Check className="w-4 h-4 mr-1" /> อนุมัติ
                </Button>
              )}
              {r.status === "approved" && (
                <Button size="sm" variant="outline" onClick={() => revoke(r)}>
                  <Ban className="w-4 h-4 mr-1" /> เพิกถอน
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={!!approving} onOpenChange={(v) => !v && setApproving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>อนุมัติ {approving?.display_name || "พนักงาน"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">อีเมลบัญชีพนักงาน</label>
              <Input
                type="email"
                placeholder="staff@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                ต้องเป็นบัญชีที่สร้างไว้แล้วในระบบ (ผูก LINE ID นี้เข้ากับบัญชีดังกล่าว)
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">บทบาท</label>
              <Select value={role} onValueChange={(v) => setRole(v as StaffRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin — เข้าถึงแดชบอร์ด/รายงานได้เต็ม</SelectItem>
                  <SelectItem value="stock_staff">Stock staff — POS + สต๊อก + PO</SelectItem>
                  <SelectItem value="photo_staff">Photo staff — POS + จัดการรูปสินค้า</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproving(null)}>ยกเลิก</Button>
            <Button onClick={approve} disabled={busy || !email.trim()}>
              {busy ? "กำลังอนุมัติ..." : "ยืนยันอนุมัติ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
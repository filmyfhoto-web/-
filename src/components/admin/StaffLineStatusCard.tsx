import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { liveSubscribe } from "@/lib/realtimeChannel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ShieldCheck, Check, ArrowRight, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type Row = {
  id: string;
  line_user_id: string;
  display_name: string | null;
  picture_url: string | null;
  status: "pending" | "approved" | "revoked";
  created_at: string;
  requested_role?: "admin" | "stock_staff" | "photo_staff" | null;
};

type StaffRole = "admin" | "stock_staff" | "photo_staff";

const TONE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  revoked: "bg-rose-50 text-rose-700 border-rose-200",
};
const LABEL: Record<string, string> = { pending: "รออนุมัติ", approved: "อนุมัติแล้ว", revoked: "เพิกถอน" };

/** Owner shortcut: live staff LINE binding status + one-click approve, right on the admin home. */
export default function StaffLineStatusCard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [approving, setApproving] = useState<Row | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("stock_staff");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data } = await supabase
        .from("staff_line_bindings")
        .select("id,line_user_id,display_name,picture_url,status,created_at,requested_role")
        .order("created_at", { ascending: false })
        .limit(20);
      if (alive) setRows(((data ?? []) as any[]) as Row[]);
    };
    load();
    const stop = liveSubscribe(
      "admin-home-staff-line",
      (ch) => ch.on("postgres_changes", { event: "*", schema: "public", table: "staff_line_bindings" }, () => load()),
      () => load(),
    );
    return () => { alive = false; stop(); };
  }, []);

  useEffect(() => {
    if (approving) {
      setErr(null);
      setRole(approving.requested_role ?? "stock_staff");
    }
  }, [approving]);

  const pending = rows.filter((r) => r.status === "pending");

  async function approve() {
    if (!approving) return;
    setBusy(true);
    setErr(null);
    try {
      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("id,email")
        .ilike("email", email.trim())
        .maybeSingle();
      if (profErr) throw profErr;
      if (!prof?.id) throw new Error("ไม่พบผู้ใช้อีเมลนี้ — ให้พนักงานสมัครบัญชีก่อน แล้วค่อยอนุมัติอีกครั้ง");
      const { error } = await supabase.rpc("owner_approve_staff_line" as any, {
        p_binding: approving.id,
        p_user_id: prof.id,
        p_role: role,
      });
      if (error) throw error;
      toast.success("อนุมัติเรียบร้อย");
      setApproving(null);
      setEmail("");
    } catch (e: any) {
      const msg: string = e?.message || "อนุมัติไม่สำเร็จ";
      setErr(
        /permission|denied|row-level|policy/i.test(msg)
          ? "อนุมัติไม่ผ่าน: บัญชีนี้ไม่มีสิทธิ์เจ้าของร้าน (owner) — ให้เจ้าของร้านเป็นผู้กดอนุมัติ"
          : msg,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section data-testid="admin-staff-line-card" className="rounded-3xl border border-slate-200 bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-5 pt-5 pb-3">
        <h2 className="flex items-center gap-2 text-lg font-bold text-[#15182a]">
          <ShieldCheck className="h-5 w-5 text-primary" /> ผูกบัญชี LINE พนักงาน
          {pending.length > 0 && (
            <span
              data-testid="admin-staff-line-pending-badge"
              className="grid h-5 min-w-5 place-items-center rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-white"
            >
              {pending.length}
            </span>
          )}
        </h2>
        <Link
          to="/admin/staff-line"
          data-testid="admin-staff-line-shortcut"
          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-slate-50"
        >
          ไปหน้าอนุมัติ <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">ยังไม่มีคำขอผูกบัญชี</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.slice(0, 4).map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-5 py-3">
              {r.picture_url ? (
                <img src={r.picture_url} alt="" loading="lazy" className="h-9 w-9 shrink-0 rounded-full object-cover" />
              ) : (
                <span className="h-9 w-9 shrink-0 rounded-full bg-muted" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-[#15182a]">{r.display_name || r.line_user_id.slice(0, 12)}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {new Date(r.created_at).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  {r.requested_role ? ` · ขอบทบาท ${r.requested_role}` : ""}
                </span>
              </span>
              <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] ${TONE[r.status] ?? ""}`}>{LABEL[r.status] ?? r.status}</span>
              {r.status !== "approved" && (
                <Button size="sm" data-testid="admin-staff-line-approve" onClick={() => setApproving(r)}>
                  <Check className="mr-1 h-4 w-4" /> ยืนยัน/อนุมัติ
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!approving} onOpenChange={(v) => !v && setApproving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>อนุมัติ {approving?.display_name || "พนักงาน"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">อีเมลบัญชีพนักงาน</label>
              <Input type="email" placeholder="staff@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              <p className="mt-1 text-xs text-muted-foreground">ต้องเป็นบัญชีที่สร้างไว้แล้วในระบบ</p>
            </div>
            <div>
              <label className="text-sm font-medium">บทบาท</label>
              <Select value={role} onValueChange={(v) => setRole(v as StaffRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="stock_staff">Stock staff</SelectItem>
                  <SelectItem value="photo_staff">Photo staff</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {err && (
              <p data-testid="admin-staff-line-error" className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {err}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproving(null)}>ยกเลิก</Button>
            <Button onClick={approve} disabled={busy || !email.trim()}>{busy ? "กำลังอนุมัติ..." : "ยืนยันอนุมัติ"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
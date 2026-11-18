import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Trash2, UserPlus, RefreshCw, Copy } from "lucide-react";

type Scope = "store" | "global";
type Channel = "email" | "line" | "existing";
type Role = "admin" | "stock_staff" | "photo_staff";

const ROLE_LABEL: Record<Role, string> = {
  admin: "ผู้ดูแลร้าน (แอดมิน)",
  stock_staff: "พนักงานสต๊อก",
  photo_staff: "พนักงานถ่ายงาน",
};

export default function StoreAdminsTab({ storeId }: { storeId: string }) {
  const qc = useQueryClient();

  // Members of this store (staff_stores → profiles)
  const members = useQuery({
    queryKey: ["store-admins", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_stores")
        .select("user_id, created_at, profiles:user_id(email, full_name)")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      // fetch roles for these users
      const ids = (data ?? []).map((r: any) => r.user_id);
      let roles: Record<string, string[]> = {};
      if (ids.length) {
        const { data: rr } = await supabase.from("user_roles").select("user_id, role").in("user_id", ids);
        for (const r of rr ?? []) {
          (roles[r.user_id] ??= []).push(r.role);
        }
      }
      return (data ?? []).map((r: any) => ({
        user_id: r.user_id,
        email: r.profiles?.email ?? null,
        full_name: r.profiles?.full_name ?? null,
        joined_at: r.created_at,
        roles: roles[r.user_id] ?? [],
      }));
    },
  });

  // Pending invitations for this store
  const invites = useQuery({
    queryKey: ["store-invites", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_invitations")
        .select("id, channel, target, role, status, expires_at, created_at, token")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-4">
      <Card className="p-4 md:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">แอดมินของร้านนี้</h2>
            <p className="text-sm text-muted-foreground">
              เพิ่มผู้ดูแลได้ 3 วิธี: อีเมล, LINE ID, หรือเลือกจากผู้ใช้ที่ลงทะเบียนแล้ว
            </p>
          </div>
          <InviteDialog
            storeId={storeId}
            onDone={() => {
              qc.invalidateQueries({ queryKey: ["store-invites", storeId] });
              qc.invalidateQueries({ queryKey: ["store-admins", storeId] });
            }}
          />
        </div>

        <div className="rounded-md border overflow-hidden">
          <div className="hidden md:grid grid-cols-[1fr_auto_auto_auto] px-3 py-2 text-xs text-muted-foreground bg-muted/40">
            <div>ผู้ใช้</div>
            <div>บทบาท</div>
            <div>เข้าร่วม</div>
            <div></div>
          </div>
          {members.isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">กำลังโหลด…</div>
          ) : (members.data ?? []).length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">ยังไม่มีแอดมินในร้านนี้</div>
          ) : (
            (members.data ?? []).map((m) => (
              <div key={m.user_id} className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_auto_auto_auto] items-center gap-2 px-3 py-2 border-t text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{m.full_name || m.email || m.user_id.slice(0, 8)}</div>
                  {m.email && <div className="truncate text-xs text-muted-foreground">{m.email}</div>}
                </div>
                <div className="hidden md:flex flex-wrap gap-1">
                  {m.roles.length ? m.roles.map((r) => <Badge key={r} variant="secondary">{r}</Badge>) : <span className="text-xs text-muted-foreground">—</span>}
                </div>
                <div className="hidden md:block text-xs text-muted-foreground">{new Date(m.joined_at).toLocaleDateString("th-TH")}</div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    if (!confirm("ถอดแอดมินคนนี้ออกจากร้าน?")) return;
                    const { error } = await supabase
                      .from("staff_stores")
                      .delete()
                      .eq("user_id", m.user_id)
                      .eq("store_id", storeId);
                    if (error) toast.error(error.message);
                    else {
                      toast.success("ถอดออกแล้ว");
                      qc.invalidateQueries({ queryKey: ["store-admins", storeId] });
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card className="p-4 md:p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">คำเชิญที่ค้างอยู่</h3>
          <Button size="sm" variant="ghost" onClick={() => invites.refetch()}><RefreshCw className="h-4 w-4" /></Button>
        </div>
        {invites.isLoading ? (
          <p className="text-sm text-muted-foreground">กำลังโหลด…</p>
        ) : (invites.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">ไม่มีคำเชิญค้างอยู่</p>
        ) : (
          <div className="rounded-md border divide-y">
            {(invites.data ?? []).map((inv: any) => (
              <div key={inv.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <Badge variant={inv.status === "pending" ? "default" : "secondary"}>{inv.status}</Badge>
                <span className="uppercase text-xs text-muted-foreground">{inv.channel}</span>
                <span className="font-mono truncate max-w-[220px]">{inv.target}</span>
                <Badge variant="outline">{ROLE_LABEL[inv.role as Role] ?? inv.role}</Badge>
                <span className="text-xs text-muted-foreground ml-auto">
                  หมดอายุ {new Date(inv.expires_at).toLocaleDateString("th-TH")}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const url = `${window.location.origin}/accept-admin?token=${inv.token}`;
                    navigator.clipboard.writeText(url);
                    toast.success("คัดลอกลิงก์แล้ว");
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                {inv.status === "pending" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      const { error } = await supabase.from("admin_invitations").update({ status: "revoked" }).eq("id", inv.id);
                      if (error) toast.error(error.message);
                      else {
                        toast.success("ยกเลิกแล้ว");
                        qc.invalidateQueries({ queryKey: ["store-invites", storeId] });
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function InviteDialog({ storeId, onDone }: { storeId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<Scope>("store");
  const [channel, setChannel] = useState<Channel>("email");
  const [role, setRole] = useState<Role>("admin");
  const [target, setTarget] = useState("");
  const [existingUserId, setExistingUserId] = useState<string>("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // For "existing" — search staff/customers by email
  const [q, setQ] = useState("");
  const users = useQuery({
    queryKey: ["invite-user-search", q],
    enabled: open && channel === "existing" && q.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .or(`email.ilike.%${q}%,full_name.ilike.%${q}%`)
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  async function handleSubmit() {
    setSubmitting(true);
    try {
      if (channel === "existing") {
        if (!existingUserId) throw new Error("เลือกผู้ใช้ก่อน");
        if (scope === "store") {
          const { error } = await supabase
            .from("staff_stores")
            .upsert({ user_id: existingUserId, store_id: storeId }, { onConflict: "user_id,store_id", ignoreDuplicates: true });
          if (error) throw error;
        }
        // Also add role for both scopes so app-level checks pass
        const { error: rErr } = await supabase
          .from("user_roles")
          .upsert({ user_id: existingUserId, role }, { onConflict: "user_id,role", ignoreDuplicates: true });
        if (rErr) throw rErr;
        toast.success("เพิ่มแอดมินเรียบร้อย");
      } else {
        const { data, error } = await supabase.functions.invoke("admin-invite-create", {
          body: {
            channel,
            target: target.trim(),
            role,
            message: message.trim() || null,
            origin: window.location.origin,
            store_id: scope === "store" ? storeId : null,
          },
        });
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);
        toast.success(
          (data as any)?.delivered
            ? "ส่งคำเชิญเรียบร้อย"
            : "สร้างคำเชิญแล้ว แต่ส่งไม่สำเร็จ — คัดลอกลิงก์เชิญได้จากรายการด้านล่าง",
        );
      }
      setOpen(false);
      setTarget("");
      setExistingUserId("");
      setMessage("");
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><UserPlus className="h-4 w-4 mr-1" /> เพิ่มแอดมิน</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>เพิ่มแอดมิน</DialogTitle></DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>ขอบเขต</Label>
            <RadioGroup value={scope} onValueChange={(v) => setScope(v as Scope)} className="flex gap-4">
              <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="store" /> เฉพาะร้านนี้</label>
              <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="global" /> ทุกร้าน (owner-only)</label>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label>วิธี</Label>
            <RadioGroup value={channel} onValueChange={(v) => setChannel(v as Channel)} className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="email" /> อีเมล</label>
              <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="line" /> LINE ID</label>
              <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="existing" /> เลือกจากผู้ใช้เดิม</label>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label>บทบาท</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                  <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {channel === "email" && (
            <div className="space-y-2">
              <Label>อีเมลผู้รับ</Label>
              <Input type="email" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="name@example.com" />
            </div>
          )}
          {channel === "line" && (
            <div className="space-y-2">
              <Label>LINE User ID (ขึ้นต้น U + 32 อักขระ)</Label>
              <Input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="U1234abcd…" />
            </div>
          )}
          {channel === "existing" && (
            <div className="space-y-2">
              <Label>ค้นหาผู้ใช้ (อีเมล / ชื่อ)</Label>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="พิมพ์อย่างน้อย 2 ตัวอักษร" />
              <div className="max-h-48 overflow-auto rounded-md border divide-y">
                {(users.data ?? []).map((u: any) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setExistingUserId(u.id)}
                    className={`w-full text-left px-2 py-1.5 text-sm hover:bg-muted ${existingUserId === u.id ? "bg-muted" : ""}`}
                  >
                    <div className="font-medium truncate">{u.full_name || u.email || u.id}</div>
                    {u.email && <div className="text-xs text-muted-foreground truncate">{u.email}</div>}
                  </button>
                ))}
                {q.length >= 2 && !users.isLoading && (users.data ?? []).length === 0 && (
                  <div className="p-2 text-sm text-muted-foreground">ไม่พบผู้ใช้</div>
                )}
              </div>
            </div>
          )}

          {channel !== "existing" && (
            <div className="space-y-2">
              <Label>ข้อความ (ไม่บังคับ)</Label>
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} maxLength={500} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>ยกเลิก</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "กำลังส่ง…" : channel === "existing" ? "เพิ่มเลย" : "ส่งคำเชิญ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
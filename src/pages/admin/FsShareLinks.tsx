import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Copy, Link2, Loader2, RefreshCw, Ban, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { publicOrigin } from "@/lib/hostMode";

interface ShareRow {
  id: string;
  token: string;
  label: string;
  user_id: string;
  expires_at: string | null;
  revoked: boolean;
  use_count: number;
  last_used_at: string | null;
  created_at: string;
}

interface StaffRow { user_id: string; email: string; full_name: string; role: string; staff_active: boolean }

function newToken() {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/** ลิงก์แชร์: `?app=` บอกว่าเปิด/ติดตั้งเป็นเว็บแอปตัวไหน (ค่าเริ่มต้น = ผู้ดูแลระบบ) */
const APP_OPTIONS: { value: string; label: string }[] = [
  { value: "admin", label: "ผู้ดูแลระบบ (แอดมินหลัก)" },
  { value: "film-shop", label: "Film Shop" },
  { value: "receipts", label: "Receipt & Delivery" },
  { value: "pos", label: "POS หน้าร้าน" },
  { value: "staff", label: "งานและสต๊อก (พนักงาน)" },
];
const shareUrl = (t: string, app = "admin") => `${publicOrigin()}/fs/${t}?app=${encodeURIComponent(app)}`;

/** สร้าง/ยกเลิกลิงก์แชร์เข้าหน้า FS FILM SHOP แบบไม่ต้องล็อกอิน */
export default function FsShareLinks() {
  const [rows, setRows] = useState<ShareRow[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [label, setLabel] = useState("ลิงก์แชร์ FS");
  const [userId, setUserId] = useState("");
  const [days, setDays] = useState("30");
  const [app, setApp] = useState("admin");
  const [qr, setQr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: links, error }, { data: st }] = await Promise.all([
      supabase.from("fs_share_links" as any).select("*").order("created_at", { ascending: false }),
      supabase.rpc("admin_list_staff"),
    ]);
    setLoading(false);
    if (error) { toast.error("โหลดลิงก์ไม่สำเร็จ: " + error.message); return; }
    setRows((links as any[]) ?? []);
    const list = ((st as any[]) ?? []).filter((s) => s.staff_active);
    setStaff(list);
    if (!userId && list[0]) setUserId(list[0].user_id);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const create = async () => {
    if (!userId) { toast.error("เลือกบัญชีพนักงานที่ลิงก์นี้จะใช้สิทธิ์ก่อน"); return; }
    const d = Number(days);
    const expires_at = d > 0 ? new Date(Date.now() + d * 86400_000).toISOString() : null;
    const { data: me } = await supabase.auth.getUser();
    const { error } = await supabase.from("fs_share_links" as any).insert({
      token: newToken(),
      label: label.trim() || "ลิงก์แชร์ FS",
      user_id: userId,
      expires_at,
      created_by: me.user?.id ?? null,
    } as any);
    if (error) { toast.error("สร้างลิงก์ไม่สำเร็จ: " + error.message); return; }
    toast.success("สร้างลิงก์แล้ว");
    load();
  };

  const revoke = async (id: string, revoked: boolean) => {
    const { error } = await supabase.from("fs_share_links" as any).update({ revoked } as any).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(revoked ? "ยกเลิกลิงก์แล้ว" : "เปิดใช้งานลิงก์อีกครั้ง");
    load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("fs_share_links" as any).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("ลบลิงก์แล้ว");
    load();
  };

  const staffName = (id: string) => {
    const s = staff.find((x) => x.user_id === id);
    return s ? `${s.full_name || s.email} (${s.role})` : id.slice(0, 8) + "…";
  };

  return (
    <main className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <header>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <Link2 className="w-5 h-5 text-primary" /> ลิงก์แชร์ FS FILM SHOP
        </h1>
        <p className="text-sm text-muted-foreground">
          แชร์ลิงก์แล้วเปิดใช้งานศูนย์รันคิว/อินบ็อกซ์ได้ทันที ไม่ต้องล็อกอิน — ยกเลิกได้ทุกเมื่อ
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>สร้างลิงก์ใหม่</CardTitle>
          <CardDescription>ลิงก์จะใช้สิทธิ์ของบัญชีพนักงานที่เลือก</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div className="md:col-span-2 space-y-1">
            <Label>ชื่อกำกับ</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="เช่น ทีมหน้าร้าน" />
          </div>
          <div className="space-y-1">
            <Label>ใช้สิทธิ์ของ</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger><SelectValue placeholder="เลือกพนักงาน" /></SelectTrigger>
              <SelectContent>
                {staff.map((s) => (
                  <SelectItem key={s.user_id} value={s.user_id}>{s.full_name || s.email} · {s.role}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>อายุลิงก์ (วัน, 0 = ไม่หมดอายุ)</Label>
            <Input type="number" min={0} value={days} onChange={(e) => setDays(e.target.value)} />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>เปิดเป็นเว็บแอป</Label>
            <Select value={app} onValueChange={setApp}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {APP_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">ลิงก์ที่แชร์จะเปิดแอปนี้ ติดตั้งลงหน้าจอโฮมและเปิดแจ้งเตือนได้ทันที</p>
          </div>
          <div className="md:col-span-4">
            <Button onClick={create}>สร้างลิงก์</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>ลิงก์ทั้งหมด</CardTitle>
            <CardDescription>คัดลอกไปแชร์ได้ทันที</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> รีเฟรช
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : rows.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">ยังไม่มีลิงก์</p>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ชื่อกำกับ</TableHead>
                    <TableHead>ใช้สิทธิ์ของ</TableHead>
                    <TableHead>สถานะ</TableHead>
                    <TableHead>ใช้ไป</TableHead>
                    <TableHead className="text-right">จัดการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const expired = !!r.expires_at && new Date(r.expires_at).getTime() < Date.now();
                    const url = shareUrl(r.token, app);
                    return (
                      <TableRow key={r.id}>
                        <TableCell>
                          <div className="font-medium">{r.label}</div>
                          <div className="font-mono text-[11px] text-muted-foreground break-all">{url}</div>
                        </TableCell>
                        <TableCell className="text-sm">{staffName(r.user_id)}</TableCell>
                        <TableCell>
                          {r.revoked ? <Badge variant="destructive">ยกเลิกแล้ว</Badge>
                            : expired ? <Badge variant="outline">หมดอายุ</Badge>
                            : <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-300">ใช้งานได้</Badge>}
                          {r.expires_at && (
                            <div className="text-[11px] text-muted-foreground mt-1">
                              ถึง {new Date(r.expires_at).toLocaleDateString("th-TH")}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{r.use_count}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(url); toast.success("คัดลอกลิงก์แล้ว"); }}>
                            <Copy className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setQr(qr === r.id ? null : r.id)}>QR</Button>
                          <Button size="sm" variant="ghost" asChild>
                            <a href={url} target="_blank" rel="noreferrer"><ExternalLink className="w-4 h-4" /></a>
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => revoke(r.id, !r.revoked)}>
                            <Ban className={`w-4 h-4 ${r.revoked ? "" : "text-destructive"}`} />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => remove(r.id)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                          {qr === r.id && (
                            <div className="flex justify-end p-3">
                              <div className="bg-white p-3 rounded-md border"><QRCodeSVG value={url} size={160} /></div>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

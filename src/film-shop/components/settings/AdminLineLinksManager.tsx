import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/film-shop/lib/supabase";
import { useUserRole } from "@/film-shop/hooks/useUserRole";
import { Link2, RefreshCw, Trash2, Copy, ExternalLink, Loader2, QrCode, Users } from "lucide-react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { useRealtimeTable } from "@/film-shop/hooks/useRealtimeTable";

interface LinkRow {
  id: string;
  user_id: string;
  line_user_id: string | null;
  display_name: string | null;
  link_token: string | null;
  linked_at: string | null;
  created_at: string;
}

const mask = (s: string) => (s.length > 10 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s);

export function AdminLineLinksManager() {
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [rows, setRows] = useState<LinkRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showQR, setShowQR] = useState(false);

  const requestUrl = `${window.location.origin}/request`;

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("admin_line_links")
      .select("*")
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) { toast.error("โหลดข้อมูลไม่สำเร็จ"); return; }
    setRows((data as any[]) as LinkRow[]);
  };

  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);
  useRealtimeTable('admin_line_links', () => { if (isAdmin) load(); }, isAdmin);

  if (roleLoading) return null;
  if (!isAdmin) return (
    <Card>
      <CardHeader>
        <CardTitle>จัดการบัญชี LINE ของแอดมิน</CardTitle>
        <CardDescription>เฉพาะผู้ดูแลระบบเท่านั้น</CardDescription>
      </CardHeader>
    </Card>
  );

  const unlink = async (id: string) => {
    const { error } = await supabase.from("admin_line_links").delete().eq("id", id);
    if (error) { toast.error("ลบไม่สำเร็จ: " + error.message); return; }
    toast.success("ลบรายการแล้ว");
    load();
  };

  const linkedCount = rows.filter((r) => r.linked_at && r.line_user_id).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5 text-primary" /> ลิงก์รับคำสั่งงานจากลูกค้า
          </CardTitle>
          <CardDescription>นำลิงก์ด้านล่างไปตั้งเป็น Action ใน Rich Menu ของ LINE OA (รองรับหลายไอดี)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 flex-wrap items-center">
            <Input readOnly value={requestUrl} className="font-mono text-sm flex-1 min-w-[240px]" />
            <Button variant="outline" onClick={() => { navigator.clipboard.writeText(requestUrl); toast.success("คัดลอกแล้ว"); }}>
              <Copy className="w-4 h-4 mr-1" /> คัดลอก
            </Button>
            <Button variant="outline" asChild>
              <a href={requestUrl} target="_blank" rel="noreferrer"><ExternalLink className="w-4 h-4 mr-1" /> เปิดดู</a>
            </Button>
            <Button variant="outline" onClick={() => setShowQR((v) => !v)}>
              <QrCode className="w-4 h-4 mr-1" /> {showQR ? "ซ่อน QR" : "แสดง QR"}
            </Button>
          </div>
          {showQR && (
            <div className="flex justify-center p-4 bg-white rounded-md border">
              <QRCodeSVG value={requestUrl} size={200} />
            </div>
          )}
          <div className="rounded-md bg-muted/40 p-3 text-xs space-y-1">
            <p className="font-medium">วิธีใช้กับ LINE Rich Menu (หลายบัญชี):</p>
            <ol className="list-decimal pl-5 space-y-0.5 text-muted-foreground">
              <li>เข้า LINE Official Account Manager → เลือกบัญชี</li>
              <li>ไปที่ Rich Menu → สร้างใหม่ / แก้ไข</li>
              <li>เลือก Action ของปุ่ม → "Link" → วาง URL ด้านบน</li>
              <li>ทำซ้ำสำหรับทุก LINE OA ID ที่ต้องการ</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" /> บัญชี LINE ที่ผูกแล้ว
            </CardTitle>
            <CardDescription>รายชื่อแอดมินที่เชื่อมต่อ LINE สำหรับรับการแจ้งเตือน</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">ผูกแล้ว {linkedCount} / {rows.length}</Badge>
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> รีเฟรช
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : rows.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">ยังไม่มีรายการ — ให้แอดมินไปที่ "ตั้งค่า → LINE → ผูกบัญชี"</p>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>LINE Display Name</TableHead>
                    <TableHead>LINE User ID</TableHead>
                    <TableHead>User ID (ระบบ)</TableHead>
                    <TableHead>สถานะ</TableHead>
                    <TableHead>ผูกเมื่อ</TableHead>
                    <TableHead className="text-right">การจัดการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const linked = !!r.linked_at && !!r.line_user_id;
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.display_name || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{r.line_user_id ? mask(r.line_user_id) : "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{mask(r.user_id)}</TableCell>
                        <TableCell>
                          {linked
                            ? <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-300">ผูกแล้ว</Badge>
                            : r.link_token
                              ? <Badge variant="outline">รหัส: {r.link_token}</Badge>
                              : <Badge variant="outline">ยังไม่ผูก</Badge>}
                        </TableCell>
                        <TableCell className="text-sm">
                          {r.linked_at ? new Date(r.linked_at).toLocaleString("th-TH") : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => unlink(r.id)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
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
    </div>
  );
}

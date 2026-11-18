import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Copy as CopyIcon, Eye } from "lucide-react";
import { renderPreview, TEMPLATE_VARIABLES } from "@/lib/templateRender";
import { fmtDateTime } from "@/lib/format";

type Template = {
  id: string;
  name: string;
  category: string;
  content: string;
  is_active: boolean;
  sort_order: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  quick_reply?: boolean;
  shortcut?: string | null;
};

const CATEGORIES: Array<{ value: string; label: string }> = [
  { value: "order", label: "ออเดอร์" },
  { value: "payment", label: "การชำระเงิน" },
  { value: "shipping", label: "จัดส่ง/รับสินค้า" },
  { value: "info", label: "ขอข้อมูล" },
  { value: "status", label: "สถานะ" },
  { value: "general", label: "ทั่วไป" },
];

function categoryLabel(v: string): string {
  return CATEGORIES.find((c) => c.value === v)?.label || v;
}

export default function ReplyTemplates() {
  const { user } = useAuth();
  const [items, setItems] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("reply_templates" as any)
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setItems((data as any) ?? []);
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return items.filter((t) => {
      if (filterCat !== "all" && t.category !== filterCat) return false;
      const q = search.trim().toLowerCase();
      if (q && !(t.name.toLowerCase().includes(q) || t.content.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [items, filterCat, search]);

  async function toggleActive(t: Template) {
    const { error } = await supabase
      .from("reply_templates" as any)
      .update({ is_active: !t.is_active, updated_by: user?.id ?? null })
      .eq("id", t.id);
    if (error) { toast.error(error.message); return; }
    toast.success(!t.is_active ? "เปิดใช้งานเทมเพลตแล้ว" : "ปิดใช้งานเทมเพลตแล้ว");
    load();
  }

  async function remove(t: Template) {
    const { error } = await supabase.from("reply_templates" as any).delete().eq("id", t.id);
    if (error) { toast.error(error.message); return; }
    toast.success("ลบเทมเพลตแล้ว");
    load();
  }

  function openNew() {
    setEditing({
      id: "", name: "", category: "order", content: "", is_active: true, quick_reply: false, shortcut: null,
      sort_order: 100, created_by: null, updated_by: null,
      created_at: "", updated_at: "",
    });
    setEditOpen(true);
  }
  function openEdit(t: Template) { setEditing({ ...t }); setEditOpen(true); }

  async function save() {
    if (!editing) return;
    const name = editing.name.trim();
    const content = editing.content.trim();
    if (name.length < 2) { toast.error("กรุณากรอกชื่อเทมเพลต"); return; }
    if (content.length < 5) { toast.error("กรุณากรอกข้อความ"); return; }
    const payload: any = {
      name, category: editing.category, content,
      is_active: editing.is_active, sort_order: editing.sort_order || 100,
      quick_reply: !!editing.quick_reply,
      shortcut: editing.shortcut?.trim() || null,
      updated_by: user?.id ?? null,
    };
    if (editing.id) {
      const { error } = await supabase.from("reply_templates" as any).update(payload).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
      toast.success("บันทึกเทมเพลตแล้ว");
    } else {
      payload.created_by = user?.id ?? null;
      const { error } = await supabase.from("reply_templates" as any).insert(payload);
      if (error) { toast.error(error.message); return; }
      toast.success("เพิ่มเทมเพลตใหม่แล้ว");
    }
    setEditOpen(false);
    setEditing(null);
    load();
  }

  return (
    <AdminLayout>
      <div lang="th" className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">เทมเพลตตอบกลับ LINE OA</h1>
            <p className="text-sm text-muted-foreground">
              จัดการข้อความตอบกลับลูกค้าสำหรับใช้ในหน้ารายละเอียดออเดอร์
            </p>
          </div>
          <Button className="rounded-xl" onClick={openNew}>
            <Plus className="w-4 h-4 mr-1" /> เพิ่มเทมเพลตใหม่
          </Button>
        </div>

        {/* Filters */}
        <div className="grid gap-3 md:grid-cols-3">
          <Input
            placeholder="ค้นหาเทมเพลต..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-xl"
          />
          <Select value={filterCat} onValueChange={setFilterCat}>
            <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกหมวดหมู่</SelectItem>
              {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="text-sm text-muted-foreground self-center">
            แสดง {filtered.length} จาก {items.length} เทมเพลต
          </div>
        </div>

        {/* List */}
        {loading ? (
          <p className="text-sm text-muted-foreground">กำลังโหลด...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">ไม่พบเทมเพลต</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {filtered.map((t) => (
              <Card key={t.id} className="rounded-2xl">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base leading-snug">{t.name}</CardTitle>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline">{categoryLabel(t.category)}</Badge>
                      {t.quick_reply && <Badge className="bg-primary/10 text-primary border-primary/20" variant="outline">Quick Reply</Badge>}
                      <Switch checked={t.is_active} onCheckedChange={() => toggleActive(t)} />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <pre className="whitespace-pre-wrap text-xs bg-muted/40 border border-border rounded-lg p-2 max-h-40 overflow-auto font-sans">
                    {t.content}
                  </pre>
                  <div className="text-[11px] text-muted-foreground">
                    แก้ไขล่าสุด: {fmtDateTime(t.updated_at)}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button size="sm" variant="outline" className="rounded-lg" onClick={() => openEdit(t)}>
                      <Pencil className="w-3.5 h-3.5 mr-1" /> แก้ไข
                    </Button>
                    <PreviewDialog content={t.content} name={t.name} />
                    <Button size="sm" variant="ghost" className="rounded-lg"
                      onClick={async () => {
                        try { await navigator.clipboard.writeText(t.content); toast.success("คัดลอกแล้ว"); }
                        catch { toast.error("คัดลอกไม่สำเร็จ"); }
                      }}>
                      <CopyIcon className="w-3.5 h-3.5 mr-1" /> คัดลอก
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="rounded-lg text-destructive">
                          <Trash2 className="w-3.5 h-3.5 mr-1" /> ลบ
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>ลบเทมเพลต "{t.name}"?</AlertDialogTitle>
                          <AlertDialogDescription>
                            ประวัติการตอบกลับที่ใช้เทมเพลตนี้จะไม่ถูกลบ แต่จะไม่ผูกกับเทมเพลตอีกต่อไป
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
                          <AlertDialogAction onClick={() => remove(t)}>ลบ</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Edit dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent lang="th" className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing?.id ? "แก้ไขเทมเพลต" : "เพิ่มเทมเพลตใหม่"}</DialogTitle>
            </DialogHeader>
            {editing && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium">ชื่อเทมเพลต</label>
                    <Input value={editing.name}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                      className="rounded-xl" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">หมวดหมู่</label>
                    <Select value={editing.category}
                      onValueChange={(v) => setEditing({ ...editing, category: v })}>
                      <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">ลำดับการแสดงผล</label>
                    <Input type="number" value={editing.sort_order}
                      onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) || 100 })}
                      className="rounded-xl" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={editing.is_active}
                      onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
                    <span className="text-sm">เปิดใช้งาน</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={!!editing.quick_reply}
                      onCheckedChange={(v) => setEditing({ ...editing, quick_reply: v })} />
                    <span className="text-sm">แสดงเป็น Quick Reply (ปุ่มลัดตอบเร็ว)</span>
                  </div>
                  <div>
                    <label className="text-sm font-medium">ทางลัด (ไม่บังคับ)</label>
                    <Input value={editing.shortcut ?? ""} placeholder="เช่น /ok"
                      onChange={(e) => setEditing({ ...editing, shortcut: e.target.value })}
                      className="rounded-xl" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">ข้อความ</label>
                    <Textarea rows={12} value={editing.content}
                      onChange={(e) => setEditing({ ...editing, content: e.target.value })}
                      className="rounded-xl font-sans" lang="th"
                      placeholder="พิมพ์ข้อความ..." />
                  </div>
                  <div className="text-xs">
                    <div className="font-medium mb-1">ตัวแปรที่รองรับ (คลิกเพื่อแทรก):</div>
                    <div className="flex flex-wrap gap-1">
                      {TEMPLATE_VARIABLES.map((v) => (
                        <Button
                          key={v.key}
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px] rounded-md"
                          onClick={() => setEditing({
                            ...editing,
                            content: (editing.content || "") + `{{${v.key}}}`,
                          })}
                        >
                          {`{{${v.key}}}`} — {v.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">ตัวอย่าง (Preview)</label>
                  <pre className="whitespace-pre-wrap text-xs bg-muted/40 border border-border rounded-xl p-3 min-h-[300px] font-sans">
                    {renderPreview(editing.content || "—")}
                  </pre>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    * ระบบจะแทนค่าตัวแปรจากข้อมูลออเดอร์จริงเมื่อใช้งาน
                  </p>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditOpen(false)}>ยกเลิก</Button>
              <Button onClick={save}>บันทึก</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}

function PreviewDialog({ content, name }: { content: string; name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="rounded-lg">
          <Eye className="w-3.5 h-3.5 mr-1" /> ดูตัวอย่าง
        </Button>
      </DialogTrigger>
      <DialogContent lang="th" className="max-w-lg">
        <DialogHeader><DialogTitle>ตัวอย่าง — {name}</DialogTitle></DialogHeader>
        <pre className="whitespace-pre-wrap text-sm bg-muted/40 border border-border rounded-xl p-3 font-sans">
          {renderPreview(content)}
        </pre>
      </DialogContent>
    </Dialog>
  );
}
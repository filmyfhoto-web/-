import AdminLayout from "@/components/layout/AdminLayout";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Copy, ExternalLink, Pencil, Check, X, LayoutGrid, Table as TableIcon, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { publicOrigin } from "@/lib/hostMode";

export default function AdminCustomers() {
  const [orgs, setOrgs] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newGroup, setNewGroup] = useState<string>("__none__");
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<"buckets" | "table">(() => {
    try { return (localStorage.getItem("admin_customers_view") as any) || "buckets"; } catch { return "buckets"; }
  });
  useEffect(() => { try { localStorage.setItem("admin_customers_view", view); } catch {} }, [view]);

  async function load() {
    const [{ data: o }, { data: g }] = await Promise.all([
      supabase.from("organizations")
        .select("id, name, slug, school_token, price_group_id, price_groups(name)")
        .is("deleted_at", null)
        .order("name"),
      supabase.from("price_groups").select("id, name").order("name"),
    ]);
    setOrgs(o ?? []);
    setGroups(g ?? []);
  }
  useEffect(() => { load(); }, []);

  const filtered = orgs.filter((o) =>
    !q.trim() || o.name.toLowerCase().includes(q.trim().toLowerCase()),
  );

  // Bucket by % from price_group name (regex \d+%). Missing group => 0%.
  const BUCKETS: Array<{ key: 0 | 10 | 15 | 20; label: string }> = [
    { key: 0, label: "0%" }, { key: 10, label: "10%" }, { key: 15, label: "15%" }, { key: 20, label: "20%" },
  ];
  const bucketOf = (o: any): 0 | 10 | 15 | 20 => {
    const name: string | undefined = o.price_groups?.name;
    const m = name?.match(/(\d{1,2})\s*%/);
    const n = m ? Number(m[1]) : 0;
    if (n >= 20) return 20;
    if (n >= 15) return 15;
    if (n >= 10) return 10;
    return 0;
  };
  const grouped = useMemo(() => {
    const g: Record<number, any[]> = { 0: [], 10: [], 15: [], 20: [] };
    for (const o of filtered) g[bucketOf(o)].push(o);
    return g;
  }, [filtered]);

  function findGroupIdByPct(pct: 0 | 10 | 15 | 20): string | null {
    if (pct === 0) return null;
    const g = groups.find((g) => (g.name || "").includes(`${pct}%`));
    return g?.id ?? null;
  }

  async function saveName(id: string) {
    const name = editingName.trim();
    if (name.length < 2) return toast.error("ชื่อสั้นเกินไป");
    const { error } = await supabase.from("organizations").update({ name }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("เปลี่ยนชื่อโรงเรียนแล้ว (เอกสารเดิมไม่หาย)");
    setEditingId(null); setEditingName(""); load();
  }

  async function setGroup(id: string, gid: string) {
    const value = gid === "__none__" ? null : gid;
    const { error } = await supabase.rpc("admin_set_org_price_group" as any, {
      p_org_id: id, p_price_group_id: value,
    });
    if (error) return toast.error(error.message);
    toast.success("อัปเดตฐานราคาแล้ว");
    load();
  }

  async function softDelete(o: any) {
    if (!window.confirm(`ลบ "${o.name}" ออกจากรายการ?\n(เอกสาร/ใบเสร็จเดิมทั้งหมดจะยังคงอยู่ในระบบ)`)) return;
    const { error } = await supabase.rpc("admin_soft_delete_org" as any, { p_id: o.id });
    if (error) return toast.error(error.message);
    toast.success("ลบออกจากรายการแล้ว (เอกสารเดิมไม่หาย)");
    load();
  }

  function orgLink(o: any) {
    if (o.school_token) return `${publicOrigin()}/school/${o.school_token}`;
    if (o.slug) return `${publicOrigin()}/s/${o.slug}`;
    return "";
  }

  async function copyLink(url: string) {
    try { await navigator.clipboard.writeText(url); toast.success("คัดลอกลิงก์แล้ว"); }
    catch { toast.error("คัดลอกไม่สำเร็จ"); }
  }

  async function createOrg() {
    const name = newName.trim();
    if (name.length < 2) return toast.error("ชื่อสั้นเกินไป");
    setSaving(true);
    const { error } = await supabase.rpc("admin_create_org" as any, {
      p_name: name,
      p_price_group_id: newGroup === "__none__" ? null : newGroup,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("เพิ่มโรงเรียน/หน่วยงานแล้ว");
    setAddOpen(false); setNewName(""); setNewGroup("__none__");
    load();
  }

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold">โรงเรียน / หน่วยงาน</h1>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline" className="rounded-xl">
            <a href="/admin/customer-360">Customer 360</a>
          </Button>
          <Button size="sm" className="rounded-xl" onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> เพิ่มลูกค้า
          </Button>
          <div className="inline-flex rounded-xl border border-border bg-card p-1">
          <button
            onClick={() => setView("buckets")}
            className={`px-3 py-1.5 rounded-lg text-xs inline-flex items-center gap-1 ${view === "buckets" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          ><LayoutGrid className="w-3.5 h-3.5" /> แยกตาม %</button>
          <button
            onClick={() => setView("table")}
            className={`px-3 py-1.5 rounded-lg text-xs inline-flex items-center gap-1 ${view === "table" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          ><TableIcon className="w-3.5 h-3.5" /> ตาราง</button>
          </div>
        </div>
      </div>

      <div className="mb-4">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นหาชื่อโรงเรียน..."
          className="rounded-xl max-w-md"
        />
      </div>

      {view === "buckets" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {BUCKETS.map((b) => {
            const list = grouped[b.key] ?? [];
            const targetGid = findGroupIdByPct(b.key);
            return (
              <div key={b.key} className="bg-card rounded-2xl border border-border shadow-card overflow-hidden flex flex-col">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-accent/30">
                  <div className="font-bold text-lg">{b.label}</div>
                  <div className="text-xs text-muted-foreground">{list.length} โรงเรียน</div>
                </div>
                <div className="p-3 space-y-2 flex-1 min-h-[80px]">
                  {list.length === 0 && (
                    <div className="text-xs text-muted-foreground text-center py-6">— ไม่มี —</div>
                  )}
                  {list.map((o) => {
                    const link = orgLink(o);
                    return (
                      <div key={o.id} className="border border-border rounded-xl p-3 space-y-2">
                        {editingId === o.id ? (
                          <div className="flex items-center gap-1">
                            <Input
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveName(o.id);
                                if (e.key === "Escape") { setEditingId(null); setEditingName(""); }
                              }}
                              className="h-8 rounded-lg text-sm"
                              autoFocus
                            />
                            <Button size="icon" className="h-8 w-8 rounded-lg" onClick={() => saveName(o.id)}>
                              <Check className="w-4 h-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg" onClick={() => { setEditingId(null); setEditingName(""); }}>
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="font-medium text-sm break-words">{o.name}</div>
                        )}
                        <div className="flex items-center gap-1 flex-wrap">
                          {link && (
                            <>
                              <Button size="sm" variant="outline" className="h-7 rounded-lg text-[11px]" onClick={() => copyLink(link)}>
                                <Copy className="w-3 h-3 mr-1" /> คัดลอกลิงก์
                              </Button>
                              <Button size="icon" variant="outline" className="h-7 w-7 rounded-lg" title="เปิด" onClick={() => window.open(link, "_blank", "noopener,noreferrer")}>
                                <ExternalLink className="w-3 h-3" />
                              </Button>
                            </>
                          )}
                          <Button size="icon" variant="outline" className="h-7 w-7 rounded-lg" title="แก้ชื่อ" onClick={() => { setEditingId(o.id); setEditingName(o.name); }}>
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg text-destructive" title="ลบ" onClick={() => softDelete(o)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                        <div className="pt-1">
                          <Select value={o.price_group_id ?? "__none__"} onValueChange={(v) => setGroup(o.id, v)}>
                            <SelectTrigger className="rounded-lg h-7 text-[11px]">
                              <SelectValue placeholder="เลือกฐานราคา" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">— 0% (มาตรฐาน) —</SelectItem>
                              {groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Quick assign target group name */}
                {b.key !== 0 && !targetGid && (
                  <div className="px-3 pb-3 text-[10px] text-muted-foreground">
                    * ยังไม่มีกลุ่มราคาชื่อมี "{b.label}" — สร้างที่หน้ากลุ่มราคา
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
      <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-card">
        <div className="p-3 border-b border-border text-sm text-muted-foreground">
          ทั้งหมด {filtered.length} รายการ — ส่งลิงก์เฉพาะโรงเรียนให้ลูกค้าเพื่อดูราคาตามฐานของโรงเรียน
        </div>
        {/* Mobile: card list */}
        <div className="md:hidden divide-y divide-border">
          {filtered.length === 0 && (
            <div className="p-8 text-center text-muted-foreground text-sm">ไม่มีข้อมูลโรงเรียน</div>
          )}
          {filtered.map((o) => {
            const link = orgLink(o);
            return (
              <div key={o.id} className="p-3 space-y-2">
                {editingId === o.id ? (
                  <div className="flex items-center gap-1">
                    <Input value={editingName} onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveName(o.id); if (e.key === "Escape") { setEditingId(null); setEditingName(""); } }}
                      className="h-9 rounded-lg text-sm" autoFocus />
                    <Button size="icon" className="h-9 w-9 rounded-lg" onClick={() => saveName(o.id)}><Check className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" className="h-9 w-9 rounded-lg" onClick={() => { setEditingId(null); setEditingName(""); }}><X className="w-4 h-4" /></Button>
                  </div>
                ) : (
                  <div className="font-medium break-words">{o.name}</div>
                )}
                {link && (
                  <div className="text-[11px] font-mono truncate text-muted-foreground" title={link}>{link}</div>
                )}
                <Select value={o.price_group_id ?? "__none__"} onValueChange={(v) => setGroup(o.id, v)}>
                  <SelectTrigger className="rounded-xl h-9 text-xs"><SelectValue placeholder="-" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— ไม่กำหนด (ราคามาตรฐาน) —</SelectItem>
                    {groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="flex flex-wrap gap-1">
                  {link && (
                    <>
                      <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs" onClick={() => copyLink(link)}>
                        <Copy className="w-3 h-3 mr-1" /> คัดลอก
                      </Button>
                      <Button size="icon" variant="outline" className="h-8 w-8 rounded-lg" onClick={() => window.open(link, "_blank", "noopener,noreferrer")}>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                  <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs" onClick={() => { setEditingId(o.id); setEditingName(o.name); }}>
                    <Pencil className="w-3 h-3 mr-1" /> แก้ชื่อ
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg text-destructive ml-auto" onClick={() => softDelete(o)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-accent text-xs">
              <tr>
                <th className="text-left p-3">ชื่อโรงเรียน</th>
                <th className="text-left p-3 min-w-[280px]">ลิงก์โรงเรียน</th>
                <th className="text-left p-3">ฐานราคา</th>
                <th className="text-right p-3">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={4} className="p-8 text-center text-muted-foreground text-sm">
                  ไม่มีข้อมูลโรงเรียน
                </td></tr>
              )}
              {filtered.map((o) => {
                const link = orgLink(o);
                return (
                  <tr key={o.id} className="border-t border-border">
                    <td className="p-3 font-medium">
                      {editingId === o.id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveName(o.id);
                              if (e.key === "Escape") { setEditingId(null); setEditingName(""); }
                            }}
                            className="h-8 rounded-lg text-sm"
                            autoFocus
                          />
                          <Button size="icon" className="h-8 w-8 rounded-lg" onClick={() => saveName(o.id)}>
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg" onClick={() => { setEditingId(null); setEditingName(""); }}>
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <span>{o.name}</span>
                      )}
                    </td>
                    <td className="p-3 text-xs">
                      {link ? (
                        <div className="flex items-stretch gap-1">
                          <div className="flex-1 min-w-0 bg-muted/40 rounded-lg px-2 py-1 border border-border">
                            <span className="text-[11px] font-mono truncate block" title={link}>{link}</span>
                          </div>
                          <Button size="icon" variant="outline" className="rounded-lg h-8 w-8" title="คัดลอก" onClick={() => copyLink(link)}>
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="icon" variant="outline" className="rounded-lg h-8 w-8" title="เปิดในแท็บใหม่" onClick={() => window.open(link, "_blank", "noopener,noreferrer")}>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">ไม่มี slug</span>
                      )}
                    </td>
                    <td className="p-3">
                      <Select value={o.price_group_id ?? "__none__"} onValueChange={(v) => setGroup(o.id, v)}>
                        <SelectTrigger className="rounded-xl w-44 h-8 text-xs"><SelectValue placeholder="-" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— ไม่กำหนด (ราคามาตรฐาน) —</SelectItem>
                          {groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="outline" className="rounded-xl" onClick={() => { setEditingId(o.id); setEditingName(o.name); }}>
                          <Pencil className="w-3.5 h-3.5 mr-1" /> แก้ชื่อ
                        </Button>
                        <Button size="icon" variant="ghost" className="rounded-xl text-destructive h-8 w-8" title="ลบ (เอกสารเดิมไม่หาย)" onClick={() => softDelete(o)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader><DialogTitle>เพิ่มโรงเรียน / หน่วยงาน</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">ชื่อโรงเรียน / หน่วยงาน</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="เช่น โรงเรียนเจดีย์เชียงโคม"
                className="rounded-xl mt-1"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") createOrg(); }}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">ฐานราคา</label>
              <Select value={newGroup} onValueChange={setNewGroup}>
                <SelectTrigger className="rounded-xl mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— ไม่กำหนด (ราคามาตรฐาน) —</SelectItem>
                  {groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="rounded-xl" onClick={() => setAddOpen(false)}>ยกเลิก</Button>
            <Button className="rounded-xl" disabled={saving} onClick={createOrg}>
              {saving ? "กำลังบันทึก..." : "เพิ่ม"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
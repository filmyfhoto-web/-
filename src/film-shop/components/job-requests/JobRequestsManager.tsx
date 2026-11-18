import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/film-shop/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/film-shop/hooks/use-toast";
import {
  Loader2, Download, Phone, RefreshCw, Inbox, ExternalLink, Search,
  FileText, Receipt, FileImage, FileType, Package, CheckCircle2, PlayCircle, X,
  Send,
} from "lucide-react";
import JSZip from "jszip";
import { CreateDocFromRequestDialog } from "./CreateDocFromRequestDialog";
import { Invoice } from "@/film-shop/types";
import { useRealtimeTable } from "@/film-shop/hooks/useRealtimeTable";
import { useLineProfiles } from "@/film-shop/hooks/useLineProfiles";
import { CustomerAvatar } from "@/film-shop/components/common/CustomerAvatar";

interface Attachment { path: string; name: string; size: number; type: string; }
interface JobRequest {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  category: string | null;
  title: string;
  description: string | null;
  width: number | null;
  length: number | null;
  quantity: number | null;
  attachments: Attachment[];
  status: string;
  notes: string | null;
  created_at: string;
  linked_invoice_id?: string | null;
  linked_doc_type?: string | null;
  line_update_sent_at?: string | null;
  line_update_count?: number | null;
  line_user_id?: string | null;
  line_display_name?: string | null;
}

const STATUS_OPTIONS = [
  { value: "new", label: "ใหม่", variant: "default" as const },
  { value: "in-progress", label: "กำลังดำเนินการ", variant: "secondary" as const },
  { value: "completed", label: "เสร็จสิ้น", variant: "outline" as const },
  { value: "cancelled", label: "ยกเลิก", variant: "destructive" as const },
];

const fmtThaiDate = (iso: string) => new Date(iso).toLocaleString("th-TH", {
  year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
});

const isImage = (t: string, name: string) =>
  t.startsWith("image/") || /\.(jpe?g|png|gif|webp|heic)$/i.test(name);

function FileIcon({ type, name }: { type: string; name: string }) {
  if (isImage(type, name)) return <FileImage className="w-4 h-4" />;
  if (/pdf/i.test(type) || /\.pdf$/i.test(name)) return <FileType className="w-4 h-4 text-red-500" />;
  return <Package className="w-4 h-4" />;
}

function AttachmentBlock({ attachments, onDownload, onPreview }: {
  attachments: Attachment[];
  onDownload: (a: Attachment) => void;
  onPreview: (url: string) => void;
}) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  useEffect(() => {
    const imgs = attachments.filter((a) => isImage(a.type, a.name));
    if (imgs.length === 0) return;
    (async () => {
      const next: Record<string, string> = {};
      await Promise.all(imgs.map(async (a) => {
        const { data } = await supabase.storage.from("job-attachments").createSignedUrl(a.path, 3600);
        if (data?.signedUrl) next[a.path] = data.signedUrl;
      }));
      setThumbs(next);
    })();
  }, [attachments]);

  if (attachments.length === 0) return null;
  const images = attachments.filter((a) => isImage(a.type, a.name));
  const others = attachments.filter((a) => !isImage(a.type, a.name));

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">ไฟล์แนบ ({attachments.length})</p>
      {images.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {images.map((a) => (
            <button
              key={a.path}
              onClick={() => thumbs[a.path] && onPreview(thumbs[a.path])}
              className="group relative aspect-square rounded-md overflow-hidden bg-muted border hover:border-primary"
              title={a.name}
            >
              {thumbs[a.path] ? (
                <img src={thumbs[a.path]} alt={a.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center"><Loader2 className="w-4 h-4 animate-spin" /></div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-[10px] p-1 truncate opacity-0 group-hover:opacity-100">
                {a.name}
              </div>
            </button>
          ))}
        </div>
      )}
      {others.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {others.map((a) => (
            <Button key={a.path} size="sm" variant="outline" onClick={() => onDownload(a)}>
              <FileIcon type={a.type} name={a.name} />
              <span className="ml-1">{a.name}</span>
              <span className="text-muted-foreground ml-1">({(a.size / 1024 / 1024).toFixed(2)}MB)</span>
            </Button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        {attachments.map((a) => (
          <Button key={`dl-${a.path}`} size="sm" variant="ghost" onClick={() => onDownload(a)}>
            <Download className="w-3 h-3 mr-1" /> {a.name}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function JobRequestsManager() {
  const { toast } = useToast();
  const [items, setItems] = useState<JobRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusTab, setStatusTab] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<"new" | "old">("new");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [docDialog, setDocDialog] = useState<{ open: boolean; request: JobRequest | null; type: Invoice["type"] }>({
    open: false, request: null, type: "quotation",
  });

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("film_job_requests")
      .select("*")
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      toast({ variant: "destructive", title: "โหลดข้อมูลไม่สำเร็จ", description: error.message });
      return;
    }
    setItems((data as any[]) as JobRequest[]);
  };
  useEffect(() => { load(); }, []);
  useRealtimeTable('film_job_requests', () => { load(); });

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("film_job_requests").update({ status }).eq("id", id);
    if (error) {
      toast({ variant: "destructive", title: "อัพเดทสถานะไม่สำเร็จ", description: error.message });
      return;
    }
    setItems((p) => p.map((it) => (it.id === id ? { ...it, status } : it)));
  };

  /**
   * Fire a LINE update to the customer.
   * Persists `line_update_sent_at` / `line_update_count` before opening the
   * LINE share URL so the card can show "ส่งอัปเดตแล้ว n ครั้ง" even after
   * a refresh. LINE deep-link send stays a client-side share (no bot needed).
   */
  const sendLineUpdate = async (it: JobRequest) => {
    const label = STATUS_OPTIONS.find((s) => s.value === it.status)?.label ?? it.status;
    const msg = `แจ้งอัปเดตงาน "${it.title}"\nสถานะ: ${label}${it.description ? `\nรายละเอียด: ${it.description}` : ""}`;
    const nextCount = (it.line_update_count ?? 0) + 1;
    const nextTs = new Date().toISOString();
    const { error } = await supabase
      .from("film_job_requests")
      .update({ line_update_sent_at: nextTs, line_update_count: nextCount })
      .eq("id", it.id);
    if (error) {
      toast({ variant: "destructive", title: "บันทึกสถานะส่งไลน์ไม่ได้", description: error.message });
      return;
    }
    setItems((p) => p.map((x) => x.id === it.id ? { ...x, line_update_sent_at: nextTs, line_update_count: nextCount } : x));
    window.open(`https://line.me/R/msg/text/?${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
    toast({ title: "เปิดหน้าต่าง LINE แล้ว", description: `บันทึกการส่งครั้งที่ ${nextCount}` });
  };

  const downloadFile = async (a: Attachment) => {
    const { data, error } = await supabase.storage.from("job-attachments").createSignedUrl(a.path, 3600);
    if (error || !data?.signedUrl) {
      toast({ variant: "destructive", title: "ดาวน์โหลดไม่ได้", description: error?.message || "" });
      return;
    }
    const link = document.createElement("a");
    link.href = data.signedUrl;
    link.download = a.name;
    link.target = "_blank";
    link.click();
  };

  const downloadAllAsZip = async (req: JobRequest) => {
    if (!req.attachments?.length) return;
    toast({ title: "กำลังเตรียมไฟล์ zip..." });
    try {
      const zip = new JSZip();
      await Promise.all(req.attachments.map(async (a) => {
        const { data } = await supabase.storage.from("job-attachments").createSignedUrl(a.path, 3600);
        if (!data?.signedUrl) return;
        const blob = await fetch(data.signedUrl).then((r) => r.blob());
        zip.file(a.name, blob);
      }));
      const out = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(out);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${req.customer_name}_${req.title}.zip`.replace(/[\\/:*?"<>|]/g, "_");
      link.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast({ variant: "destructive", title: "ดาวน์โหลด zip ล้มเหลว", description: e.message });
    }
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    STATUS_OPTIONS.forEach((s) => { c[s.value] = items.filter((i) => i.status === s.value).length; });
    return c;
  }, [items]);

  const categories = useMemo(() => Array.from(new Set(items.map((i) => i.category).filter(Boolean))) as string[], [items]);

  const lineProfiles = useLineProfiles(items.map((i) => i.line_user_id));

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    let arr = items.filter((i) => {
      if (statusTab !== "all" && i.status !== statusTab) return false;
      if (categoryFilter !== "all" && i.category !== categoryFilter) return false;
      if (!s) return true;
      return [i.customer_name, i.customer_phone, i.title, i.description].some(
        (v) => v && v.toLowerCase().includes(s)
      );
    });
    arr.sort((a, b) => {
      const da = new Date(a.created_at).getTime();
      const db = new Date(b.created_at).getTime();
      return sortOrder === "new" ? db - da : da - db;
    });
    return arr;
  }, [items, search, statusTab, categoryFilter, sortOrder]);

  const requestUrl = `${window.location.origin}/request`;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle>ลิงก์สำหรับให้ลูกค้าสั่งงาน</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">นำลิงก์นี้ไปใส่ใน Rich Menu LINE หรือส่งให้ลูกค้า</p>
          </div>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="w-4 h-4 mr-2" /> รีเฟรช
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 flex-wrap">
            <code className="flex-1 min-w-[200px] px-3 py-2 bg-muted rounded text-sm break-all">{requestUrl}</code>
            <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(requestUrl); toast({ title: "คัดลอกแล้ว" }); }}>คัดลอก</Button>
            <Button size="sm" variant="outline" asChild>
              <a href={requestUrl} target="_blank" rel="noreferrer"><ExternalLink className="w-4 h-4" /></a>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="ค้นหาชื่อ/เบอร์/หัวข้อ/รายละเอียด..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="หมวด" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทุกหมวด</SelectItem>
                {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={sortOrder} onValueChange={(v: "new" | "old") => setSortOrder(v)}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="new">ใหม่สุด</SelectItem>
                <SelectItem value="old">เก่าสุด</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Tabs value={statusTab} onValueChange={setStatusTab}>
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="all">ทั้งหมด ({counts.all})</TabsTrigger>
              {STATUS_OPTIONS.map((s) => (
                <TabsTrigger key={s.value} value={s.value}>{s.label} ({counts[s.value] || 0})</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Inbox className="w-12 h-12 mx-auto mb-2 opacity-40" />
          {items.length === 0 ? "ยังไม่มีคำสั่งงานจากลูกค้า" : "ไม่พบรายการที่ตรงกับเงื่อนไข"}
        </CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((it) => {
            const opt = STATUS_OPTIONS.find((s) => s.value === it.status) || STATUS_OPTIONS[0];
            const linked = !!it.linked_invoice_id;
            const prof = it.line_user_id ? lineProfiles[it.line_user_id] : undefined;
            const custName = it.customer_name || prof?.displayName || it.line_display_name || "ลูกค้า LINE";
            return (
              <Card key={it.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                    <CustomerAvatar name={custName} pictureUrl={prof?.pictureUrl} className="h-10 w-10" />
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-lg">{it.title}</h3>
                        <Badge variant={opt.variant}>{opt.label}</Badge>
                        {it.category && <Badge variant="outline">{it.category}</Badge>}
                        {linked && (
                          <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-300">
                            📄 มีเอกสาร ({it.linked_doc_type === "quotation" ? "เสนอราคา" : it.linked_doc_type === "invoice" ? "วางบิล" : "ใบเสร็จ"})
                          </Badge>
                        )}
                        {it.line_update_sent_at && (
                          <Badge className="bg-[#06C755]/10 text-[#06C755] border border-[#06C755]/30">
                            ✅ ส่งอัปเดตแล้ว {it.line_update_count ?? 1} ครั้ง · {fmtThaiDate(it.line_update_sent_at)}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        👤 {custName}
                        {it.customer_phone && (
                          <> · <a href={`tel:${it.customer_phone}`} className="inline-flex items-center gap-1 hover:underline"><Phone className="w-3 h-3" />{it.customer_phone}</a></>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">{fmtThaiDate(it.created_at)}</p>
                    </div>
                    </div>
                    <Select value={it.status} onValueChange={(v) => updateStatus(it.id, v)}>
                      <SelectTrigger className="w-full min-h-11 sm:w-[180px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  {(it.width || it.length || it.quantity) && (
                    <div className="text-sm flex gap-4 flex-wrap">
                      {it.width && it.length && <span>📐 {it.width} × {it.length} ม.</span>}
                      {it.quantity && <span>🔢 จำนวน {it.quantity}</span>}
                    </div>
                  )}

                  {it.description && (
                    <p className="text-sm whitespace-pre-wrap bg-muted p-3 rounded">{it.description}</p>
                  )}

                  <AttachmentBlock
                    attachments={it.attachments || []}
                    onDownload={downloadFile}
                    onPreview={setPreviewUrl}
                  />

                  {it.attachments && it.attachments.length > 1 && (
                    <Button size="sm" variant="ghost" onClick={() => downloadAllAsZip(it)}>
                      <Download className="w-3 h-3 mr-1" /> ดาวน์โหลดทั้งหมด (ZIP)
                    </Button>
                  )}

                  <div className="flex flex-wrap gap-2 pt-2 border-t">
                    {!linked && (
                      <>
                        <Button size="sm" onClick={() => setDocDialog({ open: true, request: it, type: "quotation" })}>
                          <FileText className="w-4 h-4 mr-1" /> สร้างใบเสนอราคา
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setDocDialog({ open: true, request: it, type: "invoice" })}>
                          <Receipt className="w-4 h-4 mr-1" /> สร้างใบวางบิล
                        </Button>
                      </>
                    )}
                    {it.status === "new" && (
                      <Button size="sm" variant="outline" onClick={() => updateStatus(it.id, "in-progress")}>
                        <PlayCircle className="w-4 h-4 mr-1" /> เริ่มงาน
                      </Button>
                    )}
                    {it.status === "in-progress" && (
                      <Button size="sm" variant="outline" onClick={() => updateStatus(it.id, "completed")}>
                        <CheckCircle2 className="w-4 h-4 mr-1" /> เสร็จสิ้น
                      </Button>
                    )}
                    {/* Send an update message to the customer over LINE and
                        persist send state (timestamp + counter) so staff can
                        see whether a follow-up has already been dispatched. */}
                    <Button
                      size="sm"
                      variant={it.line_update_sent_at ? "secondary" : "outline"}
                      onClick={() => sendLineUpdate(it)}
                      data-testid="job-line-send"
                    >
                      <Send className="w-4 h-4 mr-1" />
                      {it.line_update_sent_at ? "ส่งอัปเดตอีกครั้ง" : "ส่งอัปเดตทาง LINE"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Image lightbox */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <Button size="icon" variant="secondary" className="absolute top-4 right-4" onClick={() => setPreviewUrl(null)}>
            <X className="w-4 h-4" />
          </Button>
          <img src={previewUrl} alt="preview" className="max-w-full max-h-full object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      <CreateDocFromRequestDialog
        open={docDialog.open}
        onOpenChange={(v) => setDocDialog((p) => ({ ...p, open: v }))}
        request={docDialog.request}
        docType={docDialog.type}
        onLinked={() => { setDocDialog({ open: false, request: null, type: "quotation" }); load(); }}
      />
    </div>
  );
}

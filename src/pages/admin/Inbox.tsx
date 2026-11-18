import { useEffect, useMemo, useState } from "react";
import { liveChannel } from "@/lib/realtimeChannel";
import AdminLayout from "@/components/layout/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { fmtDateTime } from "@/lib/format";
import { Inbox as InboxIcon, MessageCircle, Send, Loader2, Copy, Search, Pin, PinOff, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import QuickReplyBar from "@/components/admin/live/QuickReplyBar";
import ChatTemplateBar from "@/components/admin/inbox/ChatTemplateBar";
import CustomerOrderStatusCard from "@/components/admin/inbox/CustomerOrderStatusCard";
import { useCustomerLatestOrder } from "@/hooks/useCustomerLatestOrder";
import { useLineProfileMap } from "@/hooks/useLineProfileMap";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useSearchParams } from "react-router-dom";

type Thread = {
  line_user_id: string;
  last_message_at: string | null;
  last_message_text: string | null;
  last_event_type: string | null;
  last_replied_at: string | null;
  unread_count: number;
  pinned: boolean;
  customer_name: string | null;
  customer_phone: string | null;
};
type Msg = { id: string; received_at: string; event_type: string; message_text: string | null; source_user_id: string | null };

export default function AdminInbox() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [selected, setSelected] = useState<Thread | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [params, setParams] = useSearchParams();
  const profiles = useLineProfileMap(threads.map((t) => t.line_user_id));
  const { order: latestOrder } = useCustomerLatestOrder(selected?.line_user_id ?? null);

  /** ชื่อที่แสดงให้พนักงานเห็น — ชื่อลูกค้า > ชื่อ LINE > เบอร์ > UID ย่อ */
  function nameOf(t: Thread) {
    return t.customer_name || profiles[t.line_user_id]?.displayName || t.customer_phone || `LINE:${t.line_user_id.slice(0, 8)}…`;
  }

  async function loadThreads() {
    setLoading(true);
    const { data } = await supabase
      .from("inbox_threads" as any)
      .select("*")
      .order("pinned", { ascending: false })
      .order("last_message_at", { ascending: false })
      .limit(200);
    setThreads(((data ?? []) as any) as Thread[]);
    setLoading(false);
  }

  useEffect(() => {
    loadThreads();
    const ch = liveChannel("admin-inbox-threads")
      .on("postgres_changes", { event: "*", schema: "public", table: "inbox_threads" }, () => {
        loadThreads();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  useEffect(() => {
    if (!selected) { setMsgs([]); return; }
    (async () => {
      const { data } = await supabase
        .from("line_webhook_events")
        .select("id, received_at, event_type, message_text, source_user_id")
        .eq("source_user_id", selected.line_user_id)
        .in("event_type", ["message","postback","follow"])
        .order("received_at", { ascending: false })
        .limit(50);
      setMsgs(((data ?? []) as any).reverse());
    })();
  }, [selected?.line_user_id]);

  // เปิดจากหน้าอื่นด้วยลิงก์ /admin/inbox?u=<line_user_id> แล้วเด้งเข้าห้องแชทเลย
  useEffect(() => {
    const u = params.get("u");
    if (!u || selected?.line_user_id === u) return;
    const t = threads.find((x) => x.line_user_id === u);
    if (t) { setSelected(t); markRead(t); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, threads]);

  const filtered = useMemo(() => {
    let list = threads;
    if (tab === "unread") list = list.filter((t) => (t.unread_count || 0) > 0);
    const s = q.trim().toLowerCase();
    if (s) list = list.filter((t) =>
      (t.customer_name || "").toLowerCase().includes(s) ||
      (profiles[t.line_user_id]?.displayName || "").toLowerCase().includes(s) ||
      (t.customer_phone || "").includes(s) ||
      (t.line_user_id || "").toLowerCase().includes(s) ||
      (t.last_message_text || "").toLowerCase().includes(s));
    return list;
  }, [threads, tab, q, profiles]);

  async function markRead(t: Thread) {
    if (t.unread_count === 0) return;
    await supabase.from("inbox_threads" as any)
      .update({ unread_count: 0 })
      .eq("line_user_id", t.line_user_id)
      .eq("store_id", (t as any).store_id ?? "default");
    setThreads((prev) => prev.map((x) => x.line_user_id === t.line_user_id ? { ...x, unread_count: 0 } : x));
  }

  async function togglePin(t: Thread) {
    const next = !t.pinned;
    await supabase.from("inbox_threads" as any)
      .update({ pinned: next })
      .eq("line_user_id", t.line_user_id)
      .eq("store_id", (t as any).store_id ?? "default");
    setThreads((prev) => prev.map((x) => x.line_user_id === t.line_user_id ? { ...x, pinned: next } : x));
  }

  async function send() {
    if (!selected || !reply.trim()) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("reply-send-line", {
        body: {
          line_user_id: selected.line_user_id,
          message: reply.trim(),
          store_id: (selected as any).store_id ?? "default",
        },
      });
      if (error) { toast.error(error.message); return; }
      if (data?.ok) {
        toast.success(data?.message_th || "เข้าคิวส่ง LINE แล้ว");
        setReply("");
        loadThreads();
      } else {
        try { await navigator.clipboard.writeText(reply); } catch {}
        toast.warning(data?.message_th || "ส่งไม่สำเร็จ — คัดลอกให้แล้ว");
      }
    } finally { setSending(false); }
  }

  return (
    <AdminLayout>
      <div className="p-4 max-w-7xl mx-auto space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <InboxIcon className="w-6 h-6 text-primary" /> LINE OA
            </h1>
            <p className="text-sm text-muted-foreground">ใครทักมา ตอบกลับได้ในหน้าเดียว</p>
          </div>
          <Button size="sm" variant="outline" onClick={loadThreads} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> รีเฟรช
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-3 min-h-[70vh]">
          {/* Thread list */}
          <Card>
            <CardContent className="p-3 space-y-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                <Input className="pl-8 h-9" placeholder="ค้นหา ชื่อ/เบอร์/UID/ข้อความ" value={q} onChange={(e)=>setQ(e.target.value)} />
              </div>
              <div className="flex gap-1 text-xs">
                <Button size="sm" variant={tab==="all"?"default":"outline"} className="h-7 px-2 text-xs" onClick={()=>setTab("all")}>ทั้งหมด ({threads.length})</Button>
                <Button size="sm" variant={tab==="unread"?"default":"outline"} className="h-7 px-2 text-xs" onClick={()=>setTab("unread")}>
                  ยังไม่ตอบ ({threads.filter(t=>t.unread_count>0).length})
                </Button>
              </div>
              <ul className="space-y-1 max-h-[calc(70vh-100px)] overflow-y-auto">
                {filtered.length === 0 && <li className="text-xs text-muted-foreground text-center py-6">ไม่มีเธรด</li>}
                {filtered.map((t) => (
                  <li key={t.line_user_id}>
                    <button
                      className={`w-full text-left rounded-lg p-2 border transition-colors ${selected?.line_user_id===t.line_user_id ? "border-primary bg-primary/5" : "border-border hover:bg-accent"}`}
                      onClick={() => { setSelected(t); markRead(t); setParams({ u: t.line_user_id }, { replace: true }); }}
                    >
                      <div className="flex items-center gap-2">
                        <Avatar className="h-9 w-9 shrink-0 border border-border">
                          {profiles[t.line_user_id]?.pictureUrl && (
                            <AvatarImage src={profiles[t.line_user_id]!.pictureUrl!} alt={`รูปโปรไฟล์ของ ${nameOf(t)}`} loading="lazy" />
                          )}
                          <AvatarFallback className="bg-muted text-[11px] font-semibold">{nameOf(t).slice(0, 2)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1 justify-between">
                            <div className="text-sm font-medium truncate flex items-center gap-1">
                              {t.pinned && <Pin className="w-3 h-3 text-primary" />}
                              {nameOf(t)}
                            </div>
                            {t.unread_count > 0 && <Badge className="h-5 text-[10px]">{t.unread_count}</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">{t.last_message_text || t.last_event_type || "-"}</div>
                          <div className="text-[10px] text-muted-foreground">{t.last_message_at ? fmtDateTime(t.last_message_at) : "-"}</div>
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Conversation */}
          <Card>
            <CardContent className="p-3 flex flex-col h-[calc(70vh)]">
              {!selected ? (
                <div className="m-auto text-center text-muted-foreground text-sm">
                  <MessageCircle className="w-10 h-10 mx-auto opacity-40 mb-2" />
                  เลือกเธรดจากด้านซ้ายเพื่อดูข้อความและตอบกลับ
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between border-b pb-2 mb-2 gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar className="h-10 w-10 shrink-0 border border-border">
                        {profiles[selected.line_user_id]?.pictureUrl && (
                          <AvatarImage src={profiles[selected.line_user_id]!.pictureUrl!} alt={`รูปโปรไฟล์ของ ${nameOf(selected)}`} />
                        )}
                        <AvatarFallback className="bg-muted text-xs font-semibold">{nameOf(selected).slice(0, 2)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{nameOf(selected)}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {selected.customer_phone || <code className="text-[10px]">{selected.line_user_id}</code>}
                        </div>
                      </div>
                    </div>
                     <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => togglePin(selected)}>
                        {selected.pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="mb-2">
                    <CustomerOrderStatusCard order={latestOrder} />
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                    {msgs.length === 0 && <div className="text-xs text-muted-foreground text-center py-4">ยังไม่มีข้อความ</div>}
                    {msgs.map((m) => (
                      <div key={m.id} className="max-w-[80%] rounded-2xl border p-2 bg-accent/30">
                        <div className="text-sm whitespace-pre-wrap">
                          {m.event_type === "follow" ? "🎉 เพิ่มเพื่อน" : (m.message_text || `(${m.event_type})`)}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">{fmtDateTime(m.received_at)}</div>
                      </div>
                    ))}
                  </div>

                  <div className="border-t pt-2 mt-2 space-y-2">
                    <ChatTemplateBar
                      onPick={(t) => setReply(t)}
                      customerName={nameOf(selected)}
                      order={latestOrder}
                    />
                    <QuickReplyBar onPick={(t) => setReply((p) => p ? p + "\n" + t : t)} />
                    <Textarea
                      lang="th"
                      rows={3}
                      value={reply}
                      onChange={(e)=>setReply(e.target.value)}
                      placeholder="พิมพ์ข้อความตอบลูกค้า..."
                      style={{ fontFamily: '"Sarabun","Noto Sans Thai",system-ui,sans-serif' }}
                    />
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" disabled={!reply.trim()} onClick={async () => {
                        try { await navigator.clipboard.writeText(reply); toast.success("คัดลอกแล้ว"); } catch {}
                      }}><Copy className="w-4 h-4 mr-1" /> คัดลอก</Button>
                      <Button size="sm" className="bg-[#06C755] hover:bg-[#05b84c] text-white" disabled={sending || !reply.trim()} onClick={send}>
                        {sending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
                        ส่ง LINE
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Eye, ShieldAlert, Filter } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { storeBasePath, useStoreSlug } from "../useStore";
import { tbl } from "../lib/tbl";

interface Revision {
  id: string;
  action: string;
  note: string | null;
  created_at: string;
  actor: string | null;
  snapshot: any;
}

const TRACK_FIELDS: Array<{ key: string; label: string }> = [
  { key: "customer_name", label: "ผู้ขาย/ร้านค้า" },
  { key: "project_name", label: "ชื่อโครงการ" },
  { key: "signer_receiver", label: "ผู้รับของ/ผู้รับผิดชอบ" },
  { key: "customer_address", label: "ที่อยู่" },
  { key: "customer_phone", label: "เบอร์โทร" },
  { key: "customer_tax_id", label: "เลขผู้เสียภาษี" },
  { key: "notes", label: "หมายเหตุ" },
  { key: "payment_method", label: "วิธีชำระเงิน" },
];

export default function RevisionHistory() {
  const storeSlug = useStoreSlug();
  const { id } = useParams<{ id: string }>();
  const [diffPair, setDiffPair] = useState<{ before: any; after: any; rev: Revision } | null>(null);
  const { isStaffAny, loading: authLoading, roles } = useAuth();

  // Filters
  const [fDocNo, setFDocNo] = useState("");
  const [fName, setFName] = useState("");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");

  const docQ = useQuery({
    queryKey: ["rds_doc_meta", id],
    enabled: !!id && isStaffAny,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(tbl("documents") as any)
        .select("document_no, document_type, customer_name")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const revsQ = useQuery<Revision[]>({
    queryKey: ["rds_revs", id],
    enabled: !!id && isStaffAny,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(tbl("document_revisions") as any)
        .select("id, action, note, created_at, actor, snapshot")
        .eq("document_id", id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const allRevisions = revsQ.data ?? [];
  const doc = docQ.data;

  const revisions = useMemo(() => {
    return allRevisions.filter((r) => {
      // Date range on created_at
      if (fFrom) {
        const fromTs = new Date(fFrom + "T00:00:00").getTime();
        if (new Date(r.created_at).getTime() < fromTs) return false;
      }
      if (fTo) {
        const toTs = new Date(fTo + "T23:59:59").getTime();
        if (new Date(r.created_at).getTime() > toTs) return false;
      }
      const snap = r.snapshot?.state ?? {};
      // Doc number filter (matches current doc no or snapshot doc no)
      if (fDocNo) {
        const q = fDocNo.toLowerCase();
        const hay = `${doc?.document_no ?? ""} ${snap.document_no ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      // Name filter — search receiver/responsible/customer name in snapshot
      if (fName) {
        const q = fName.toLowerCase();
        const hay = `${snap.customer_name ?? doc?.customer_name ?? ""} ${snap.signer_receiver ?? doc?.signer_receiver ?? ""} ${snap.signer_responsible ?? doc?.signer_responsible ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allRevisions, fDocNo, fName, fFrom, fTo, doc]);

  function openDiff(idx: number) {
    const after = revisions[idx]?.snapshot?.state;
    const before = revisions[idx + 1]?.snapshot?.state ?? null;
    if (!after) return;
    setDiffPair({ before, after, rev: revisions[idx] });
  }

  // Permission guard — show clear UI even though RLS already blocks non-staff.
  if (authLoading) return <p className="text-muted-foreground p-4">กำลังตรวจสอบสิทธิ์…</p>;
  if (!isStaffAny) {
    return (
      <Card className="p-6 max-w-xl space-y-3">
        <div className="flex items-center gap-2 text-destructive">
          <ShieldAlert className="h-5 w-5" />
          <h2 className="font-semibold text-lg">ไม่มีสิทธิ์เข้าถึง</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          ประวัติการแก้ไขเอกสารเปิดให้เฉพาะเจ้าของร้าน / แอดมิน / พนักงานสต๊อก / พนักงานภาพถ่ายเท่านั้น
          {roles.length > 0 && <> · บทบาทของคุณ: <span className="font-mono">{roles.join(", ")}</span></>}
        </p>
        <Button asChild variant="outline" size="sm">
          <Link to={`${storeBasePath(storeSlug)}/documents`}>กลับไปยังรายการเอกสาร</Link>
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4 max-w-5xl print:hidden">
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-1 -ml-2">
            <Link to={`${storeBasePath(storeSlug)}/documents`}><ArrowLeft className="h-4 w-4 mr-1" />กลับไปยังรายการเอกสาร</Link>
          </Button>
          <h1 className="text-2xl md:text-3xl font-bold">ประวัติการแก้ไขเอกสาร</h1>
          <p className="text-sm text-muted-foreground">
            {docQ.data ? <>เลขที่ <span className="font-mono">{docQ.data.document_no}</span> · {docQ.data.customer_name ?? "-"}</> : "กำลังโหลด..."}
          </p>
        </div>
        {id && (
          <Button variant="outline" asChild>
            <Link to={`${storeBasePath(storeSlug)}/documents/${id}/edit`}>แก้ไขเอกสาร</Link>
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card className="p-3 grid md:grid-cols-4 gap-3">
        <div>
          <Label className="text-xs flex items-center gap-1"><Filter className="h-3 w-3" />เลขที่เอกสาร</Label>
          <Input value={fDocNo} onChange={(e) => setFDocNo(e.target.value)} placeholder="เช่น RC-2025-001" />
        </div>
        <div>
          <Label className="text-xs">ชื่อผู้รับ/ผู้รับของ/ผู้รับผิดชอบ</Label>
          <Input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="ชื่อ" />
        </div>
        <div>
          <Label className="text-xs">วันที่แก้ไข (จาก)</Label>
          <Input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">ถึง</Label>
          <Input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} />
        </div>
        {(fDocNo || fName || fFrom || fTo) && (
          <div className="md:col-span-4 flex justify-between items-center">
            <span className="text-xs text-muted-foreground">
              พบ {revisions.length} จาก {allRevisions.length} รายการ
            </span>
            <Button size="sm" variant="ghost" onClick={() => { setFDocNo(""); setFName(""); setFFrom(""); setFTo(""); }}>
              ล้างฟิลเตอร์
            </Button>
          </div>
        )}
      </Card>

      <Card className="p-4">
        {revsQ.isLoading && <p className="text-muted-foreground text-sm">กำลังโหลด...</p>}
        {!revsQ.isLoading && revisions.length === 0 && (
          <p className="text-muted-foreground text-sm">
            {allRevisions.length === 0 ? "ยังไม่มีการแก้ไขใดๆ" : "ไม่พบรายการที่ตรงกับฟิลเตอร์"}
          </p>
        )}
        <ol className="relative border-l border-border ml-2">
          {revisions.map((r, idx) => (
            <li key={r.id} className="ml-4 pb-4">
              <span className="absolute -left-1.5 w-3 h-3 rounded-full bg-primary" />
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{r.action}</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("th-TH")}</span>
                  {r.actor && <span className="text-[11px] text-muted-foreground">โดย {String(r.actor).slice(0, 8)}…</span>}
                </div>
                {r.snapshot?.state && (
                  <Button size="sm" variant="outline" onClick={() => openDiff(idx)}>
                    <Eye className="h-3.5 w-3.5 mr-1" /> ดูข้อมูลก่อน-หลัง
                  </Button>
                )}
              </div>
              {r.note && (
                <p className="text-xs italic mt-1 border-l-2 border-border pl-2 text-foreground/80 whitespace-pre-line">
                  {r.note}
                </p>
              )}
            </li>
          ))}
        </ol>
      </Card>

      <Dialog open={!!diffPair} onOpenChange={(o) => !o && setDiffPair(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>
              ก่อน-หลัง · {diffPair?.rev.action} · {diffPair && new Date(diffPair.rev.created_at).toLocaleString("th-TH")}
            </DialogTitle>
          </DialogHeader>
          {diffPair && <DiffView before={diffPair.before} after={diffPair.after} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DiffView({ before, after }: { before: any | null; after: any }) {
  const fieldRows = TRACK_FIELDS
    .map((f) => ({ ...f, b: before?.[f.key], a: after?.[f.key] }))
    .filter((r) => JSON.stringify(r.b ?? "") !== JSON.stringify(r.a ?? ""));

  const beforeItems = (before?.items ?? []) as any[];
  const afterItems = (after?.items ?? []) as any[];
  const bMap = new Map(beforeItems.map((it) => [it.key, it]));
  const aMap = new Map(afterItems.map((it) => [it.key, it]));
  const added = afterItems.filter((it) => !bMap.has(it.key));
  const removed = beforeItems.filter((it) => !aMap.has(it.key));
  const modified = afterItems.filter((it) => {
    const b = bMap.get(it.key);
    return b && (b.name !== it.name || b.price !== it.price || b.quantity !== it.quantity || b.unit !== it.unit);
  });

  if (!before) {
    return <p className="text-sm text-muted-foreground">นี่คือ revision แรก ไม่มี snapshot ก่อนหน้าให้เทียบ</p>;
  }

  return (
    <div className="space-y-4 text-sm">
      {fieldRows.length === 0 && added.length + removed.length + modified.length === 0 && (
        <p className="text-muted-foreground">ไม่มีการเปลี่ยนแปลงในฟิลด์ที่ติดตาม</p>
      )}
      {fieldRows.length > 0 && (
        <div>
          <h3 className="font-semibold mb-2">ข้อมูลทั่วไป</h3>
          <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 border border-border rounded-md overflow-hidden">
            <div className="bg-muted p-2 text-xs font-medium">ฟิลด์</div>
            <div className="bg-muted p-2 text-xs font-medium">ก่อน</div>
            <div className="bg-muted p-2 text-xs font-medium">หลัง</div>
            {fieldRows.map((r) => (
              <div key={r.key} className="contents">
                <div className="p-2 text-xs border-t border-border">{r.label}</div>
                <div className="p-2 text-xs border-t border-border bg-destructive/5 text-destructive whitespace-pre-line">{String(r.b ?? "—")}</div>
                <div className="p-2 text-xs border-t border-border bg-emerald-500/5 text-emerald-700 dark:text-emerald-300 whitespace-pre-line">{String(r.a ?? "—")}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(added.length > 0 || removed.length > 0 || modified.length > 0) && (
        <div>
          <h3 className="font-semibold mb-2">รายการสินค้า</h3>
          {added.length > 0 && (
            <div className="mb-2">
              <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium mb-1">+ เพิ่ม {added.length} รายการ</p>
              <ul className="text-xs space-y-0.5 list-disc list-inside">
                {added.map((it) => <li key={it.key}>{it.name} × {it.quantity} @ {it.price}</li>)}
              </ul>
            </div>
          )}
          {removed.length > 0 && (
            <div className="mb-2">
              <p className="text-xs text-destructive font-medium mb-1">− ลบ {removed.length} รายการ</p>
              <ul className="text-xs space-y-0.5 list-disc list-inside">
                {removed.map((it) => <li key={it.key}>{it.name} × {it.quantity} @ {it.price}</li>)}
              </ul>
            </div>
          )}
          {modified.length > 0 && (
            <div>
              <p className="text-xs text-amber-700 dark:text-amber-300 font-medium mb-1">~ แก้ไข {modified.length} รายการ</p>
              <ul className="text-xs space-y-1">
                {modified.map((it) => {
                  const b = bMap.get(it.key);
                  return (
                    <li key={it.key} className="border border-border rounded p-1.5">
                      <div className="text-destructive">ก่อน: {b.name} × {b.quantity} @ {b.price}</div>
                      <div className="text-emerald-700 dark:text-emerald-300">หลัง: {it.name} × {it.quantity} @ {it.price}</div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
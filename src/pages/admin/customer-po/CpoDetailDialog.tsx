import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  fmtMoney, itemTotal, CPO_REVIEW_LABEL, CPO_REVIEW_TONE,
  type CpoItem, type CpoReviewStatus,
} from "@/lib/customerPoTotals";

const db = supabase as any;

export interface CpoDetailRow {
  id: string;
  po_number: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  school_or_org: string | null;
  note: string | null;
  review_status: string;
  created_at: string;
  net_total: number | null;
  subtotal: number | null;
}

interface Props {
  row: CpoDetailRow | null;
  items: CpoItem[];
  onClose: () => void;
}

/**
 * รายละเอียดออเดอร์สั่งสินค้าเข้า: รายการสินค้า จำนวน จำนวนคงเหลือในสต๊อก
 * หมายเหตุ และประวัติการเปลี่ยนสถานะ (อ่านอย่างเดียว)
 */
export function CpoDetailDialog({ row, items, onClose }: Props) {
  const [stock, setStock] = useState<Record<string, number>>({});
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!row) return;
    let alive = true;
    setLoading(true);
    (async () => {
      const names = items.map((i) => (i.name || "").trim()).filter(Boolean);
      const [prodRes, evRes] = await Promise.all([
        names.length
          ? db.from("products").select("name, stock").in("name", names)
          : Promise.resolve({ data: [] }),
        db.from("customer_po_review_events")
          .select("id, event, note, actor, created_at")
          .eq("po_id", row.id)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
      if (!alive) return;
      const map: Record<string, number> = {};
      (prodRes?.data ?? []).forEach((p: any) => { map[String(p.name).trim()] = Number(p.stock ?? 0); });
      setStock(map);
      setEvents(evRes?.data ?? []);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [row?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalQty = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);

  return (
    <Dialog open={!!row} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            รายละเอียดออเดอร์ {row?.po_number || ""}
            {row && (
              <Badge variant="outline" className={CPO_REVIEW_TONE[row.review_status as CpoReviewStatus]}>
                {CPO_REVIEW_LABEL[row.review_status as CpoReviewStatus] ?? row.review_status}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {row && (
          <div className="space-y-4 text-sm">
            <div className="grid gap-1 sm:grid-cols-2">
              <div><span className="text-slate-500">ลูกค้า: </span>{row.customer_name || "(ยังไม่ระบุ)"}</div>
              <div><span className="text-slate-500">เบอร์โทร: </span>{row.customer_phone || "-"}</div>
              <div><span className="text-slate-500">หน่วยงาน: </span>{row.school_or_org || "-"}</div>
              <div><span className="text-slate-500">วันที่: </span>{new Date(row.created_at).toLocaleString("th-TH")}</div>
            </div>

            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[560px] text-sm" data-testid="cpo-detail-items">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-2 py-2 text-left">รายการ</th>
                    <th className="px-2 py-2 text-right">จำนวน</th>
                    <th className="px-2 py-2 text-left">หน่วย</th>
                    <th className="px-2 py-2 text-right">คงเหลือในสต๊อก</th>
                    <th className="px-2 py-2 text-right">ราคา</th>
                    <th className="px-2 py-2 text-right">รวม</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const left = stock[(it.name || "").trim()];
                    const short = typeof left === "number" && left < (Number(it.quantity) || 0);
                    return (
                      <tr key={it.key} className="border-t">
                        <td className="px-2 py-2">{it.name || "-"}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{it.quantity}</td>
                        <td className="px-2 py-2">{it.unit || "ชิ้น"}</td>
                        <td className={`px-2 py-2 text-right tabular-nums ${short ? "font-semibold text-rose-600" : ""}`}>
                          {typeof left === "number" ? left : "-"}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{fmtMoney(it.price)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{fmtMoney(itemTotal(it))}</td>
                      </tr>
                    );
                  })}
                  {items.length === 0 && (
                    <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">ยังไม่มีรายการ</td></tr>
                  )}
                </tbody>
                <tfoot className="border-t bg-slate-50 text-xs">
                  <tr>
                    <td className="px-2 py-2 font-medium">รวม {items.length} รายการ</td>
                    <td className="px-2 py-2 text-right font-medium tabular-nums">{totalQty}</td>
                    <td colSpan={3} className="px-2 py-2 text-right font-medium">ยอดสุทธิ</td>
                    <td className="px-2 py-2 text-right font-semibold tabular-nums">
                      {fmtMoney(Number(row.net_total ?? row.subtotal ?? 0))} บาท
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="rounded-xl border p-3">
              <div className="mb-1 text-xs font-medium text-slate-500">หมายเหตุ</div>
              <div className="whitespace-pre-wrap">{row.note?.trim() || "-"}</div>
            </div>

            <div className="rounded-xl border p-3">
              <div className="mb-2 text-xs font-medium text-slate-500">ประวัติการเปลี่ยนสถานะ</div>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              ) : events.length === 0 ? (
                <div className="text-xs text-muted-foreground">ยังไม่มีประวัติ</div>
              ) : (
                <ul className="space-y-1 text-xs" data-testid="cpo-detail-history">
                  {events.map((e) => (
                    <li key={e.id} className="flex flex-wrap gap-2">
                      <span className="text-slate-400">{new Date(e.created_at).toLocaleString("th-TH")}</span>
                      <span className="font-medium">{e.event}</span>
                      {e.note && <span className="text-slate-600">· {e.note}</span>}
                      {e.actor && <span className="text-slate-400">({e.actor})</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default CpoDetailDialog;
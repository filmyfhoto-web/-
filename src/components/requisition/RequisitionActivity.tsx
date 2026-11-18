import { useEffect, useState } from "react";
import { History, Loader2 } from "lucide-react";
import {
  fetchRequisitionLogs, formatLogTime, requisitionActionLabel, type RequisitionLogRow,
} from "@/lib/requisitionLog";

/** ไทม์ไลน์ประวัติการแก้ไขของใบเขียนเบิก 1 ใบ (ใช้ทั้งฝั่งลูกค้าและแอดมิน) */
export default function RequisitionActivity({ requisitionId }: { requisitionId: string }) {
  const [rows, setRows] = useState<RequisitionLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchRequisitionLogs(requisitionId)
      .then((r) => { if (alive) setRows(r); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [requisitionId]);

  return (
    <section className="rounded-lg border bg-card p-3">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <History className="h-4 w-4" /> ประวัติการแก้ไข
      </h3>
      {loading ? (
        <p className="py-3 text-center text-xs text-muted-foreground">
          <Loader2 className="mr-1.5 inline h-3.5 w-3.5 animate-spin" /> กำลังโหลดประวัติ...
        </p>
      ) : rows.length === 0 ? (
        <p className="py-3 text-center text-xs text-muted-foreground">ยังไม่มีประวัติการแก้ไขสำหรับเอกสารนี้</p>
      ) : (
        <ol className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-md border bg-muted/20 p-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-foreground">{requisitionActionLabel(r.action)}</span>
                <time className="text-muted-foreground">{formatLogTime(r.created_at)}</time>
              </div>
              {r.changes.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-muted-foreground">
                  {r.changes.map((c, i) => (
                    <li key={`${c.field}-${i}`}>
                      {c.label}: <span className="line-through">{c.from}</span> → <span className="text-foreground">{c.to}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

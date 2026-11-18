import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2, PencilLine } from "lucide-react";
import { toast } from "sonner";
import { useSubmitGuard } from "@/hooks/useSubmitGuard";
import { CPO_REVIEW_LABEL, CPO_REVIEW_TONE, fmtMoney, type CpoReviewStatus } from "@/lib/customerPoTotals";

type Po = {
  id: string; po_number: string | null; customer_name: string; school_or_org: string;
  items: any[]; note: string; subtotal: number; discount: number;
  vat_enabled: boolean; vat_rate: number; vat_amount: number;
  wht_enabled: boolean; wht_rate: number; wht_amount: number;
  net_total: number; review_status: CpoReviewStatus; revision_note: string; document_no: string | null;
};

/** Public, token-scoped order review page opened from the LINE message. */
export default function CustomerPoReview() {
  const { token = "" } = useParams();
  const [po, setPo] = useState<Po | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviseMode, setReviseMode] = useState(false);
  const [note, setNote] = useState("");
  const guard = useSubmitGuard();

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).rpc("cpo_get_by_token", { p_token: token });
    if (error) toast.error(error.message);
    setPo((data as Po) ?? null);
    setLoading(false);
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  async function respond(decision: "confirm" | "revise") {
    if (decision === "revise" && !note.trim()) { toast.error("กรุณาระบุรายละเอียดที่ต้องการแก้ไข"); return; }
    const { data, error } = await supabase.functions.invoke("po-review", {
      body: { action: "respond", token, decision, note: note.trim() },
    });
    if (error) { toast.error("ส่งคำตอบไม่สำเร็จ"); return; }
    if ((data as any)?.error) { toast.error(String((data as any).error)); return; }
    toast.success(decision === "confirm" ? "ยืนยันออเดอร์เรียบร้อย" : "ส่งคำขอแก้ไขให้ร้านแล้ว");
    setReviseMode(false);
    setNote("");
    await load();
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-sky-50"><Loader2 className="h-6 w-6 animate-spin text-blue-700" /></div>;
  }
  if (!po) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sky-50 p-6 text-center text-slate-600">
        ไม่พบออเดอร์นี้ หรือลิงก์หมดอายุแล้ว
      </div>
    );
  }

  const closed = po.review_status === "documented";
  const items = Array.isArray(po.items) ? po.items : [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white pb-28">
      <header className="bg-blue-900 px-4 py-5 text-white">
        <div className="mx-auto max-w-2xl">
          <div className="text-sm opacity-80">ตรวจสอบออเดอร์</div>
          <h1 className="text-xl font-bold">{po.po_number || "-"}</h1>
          <div className="mt-1 text-sm opacity-90">{po.customer_name} {po.school_or_org ? `· ${po.school_or_org}` : ""}</div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-3 p-4">
        <Badge variant="outline" className={CPO_REVIEW_TONE[po.review_status]} data-testid="po-review-status">
          {CPO_REVIEW_LABEL[po.review_status]}
        </Badge>

        <Card className="overflow-x-auto rounded-2xl border-sky-200">
          <table className="w-full min-w-[420px] text-sm">
            <thead className="bg-sky-50 text-xs text-blue-900">
              <tr>
                <th className="px-3 py-2 text-left">รายการ</th>
                <th className="px-3 py-2 text-right">จำนวน</th>
                <th className="px-3 py-2 text-right">ราคา</th>
                <th className="px-3 py-2 text-right">รวม</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it: any, i: number) => {
                const total = Math.max((Number(it.quantity) || 0) * (Number(it.price) || 0) - (Number(it.discount) || 0), 0);
                return (
                  <tr key={it.key ?? i} className="border-t">
                    <td className="px-3 py-2">{it.name}</td>
                    <td className="px-3 py-2 text-right">{it.quantity} {it.unit}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(it.price)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>

        <Card className="space-y-1 rounded-2xl border-sky-200 p-4 text-sm">
          <Line label="ยอดสินค้า" value={fmtMoney(po.subtotal)} />
          {Number(po.discount) > 0 && <Line label="ส่วนลด" value={`-${fmtMoney(po.discount)}`} />}
          {po.vat_enabled && <Line label={`VAT ${po.vat_rate}%`} value={fmtMoney(po.vat_amount)} />}
          {po.wht_enabled && <Line label={`หัก ณ ที่จ่าย ${po.wht_rate}%`} value={`-${fmtMoney(po.wht_amount)}`} />}
          <div className="flex justify-between border-t pt-2 text-base font-bold text-blue-900">
            <span>ยอดสุทธิ</span>
            <span className="tabular-nums">{fmtMoney(po.net_total)} บาท</span>
          </div>
        </Card>

        {po.note && <Card className="rounded-2xl border-sky-200 p-3 text-xs text-slate-600">หมายเหตุ: {po.note}</Card>}

        {po.review_status === "revision_requested" && po.revision_note && (
          <Card className="rounded-2xl border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            คำขอแก้ไขของคุณ: {po.revision_note}
          </Card>
        )}

        {po.review_status === "confirmed" && (
          <Card className="rounded-2xl border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            คุณยืนยันออเดอร์นี้แล้ว ทางร้านกำลังออกเอกสารให้
          </Card>
        )}
        {closed && (
          <Card className="rounded-2xl border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
            ออกเอกสารเรียบร้อยแล้ว {po.document_no ? `(เลขที่ ${po.document_no})` : ""}
          </Card>
        )}

        {reviseMode && !closed && (
          <Card className="rounded-2xl border-amber-200 p-3">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="ระบุรายละเอียดที่ต้องการแก้ไข" data-testid="po-revise-note" />
          </Card>
        )}
      </main>

      {!closed && (
        <div className="fixed inset-x-0 bottom-0 border-t bg-white/95 p-3 backdrop-blur">
          <div className="mx-auto flex max-w-2xl gap-2">
            <Button
              variant="outline"
              className="flex-1 border-amber-300 text-amber-700"
              disabled={guard.busy}
              onClick={() => (reviseMode ? guard.run(() => respond("revise")) : setReviseMode(true))}
              data-testid="po-revise"
            >
              <PencilLine className="mr-1 h-4 w-4" /> {reviseMode ? "ส่งคำขอแก้ไข" : "ขอแก้ไข"}
            </Button>
            <Button
              className="flex-1 bg-blue-600 hover:bg-blue-700"
              disabled={guard.busy}
              onClick={() => guard.run(() => respond("confirm"))}
              data-testid="po-confirm"
            >
              {guard.busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />} ยืนยันออเดอร์
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
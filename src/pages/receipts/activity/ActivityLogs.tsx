import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentStore } from "../useStore";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FileSpreadsheet } from "lucide-react";
import { downloadCsv } from "@/lib/csv";
import { toast } from "@/hooks/use-toast";
import { tbl } from "../lib/tbl";

export default function ActivityLogs() {
  const { store } = useCurrentStore();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [actionQ, setActionQ] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["rds_activity", store?.id, from, to, actionQ],
    enabled: !!store?.id,
    queryFn: async () => {
      let q = supabase
        .from(tbl("activity_logs") as any)
        .select("*")
        .eq("store_id", store!.id)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (from) q = q.gte("created_at", from);
      if (to) q = q.lte("created_at", to + "T23:59:59");
      if (actionQ.trim()) q = q.ilike("action", `%${actionQ.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const rows = useMemo(() => data ?? [], [data]);

  function exportCsv() {
    if (!rows.length) {
      toast({ title: "ไม่มีข้อมูลให้ส่งออก" });
      return;
    }
    const out = rows.map((r) => ({
      เวลา: new Date(r.created_at).toLocaleString("th-TH"),
      การกระทำ: r.action,
      อ้างอิง_ประเภท: r.target_type ?? "",
      อ้างอิง_id: r.target_id ?? "",
      ผู้ใช้: r.user_id ?? "",
      รายละเอียด: r.detail ? JSON.stringify(r.detail) : "",
    }));
    downloadCsv(
      `activity_${store?.slug}_${new Date().toISOString().slice(0, 10)}.csv`,
      out,
    );
    toast({ title: `ส่งออก ${out.length} แถวเป็น CSV แล้ว` });
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">บันทึกการใช้งาน</h1>
          <p className="text-sm text-muted-foreground">{store?.name}</p>
        </div>
        <Button onClick={exportCsv} variant="outline">
          <FileSpreadsheet className="h-4 w-4 mr-1.5" /> ส่งออก CSV
        </Button>
      </div>

      <Card className="p-4 grid md:grid-cols-4 gap-3 items-end">
        <div>
          <Label className="text-xs">จากวันที่</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">ถึงวันที่</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <Label className="text-xs">ค้นหา action</Label>
          <Input placeholder="เช่น document_create" value={actionQ} onChange={(e) => setActionQ(e.target.value)} />
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-2">เวลา</th>
              <th className="text-left p-2">การกระทำ</th>
              <th className="text-left p-2">อ้างอิง</th>
              <th className="text-left p-2">รายละเอียด</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={4} className="text-center p-6 text-muted-foreground">กำลังโหลด…</td></tr>}
            {!isLoading && !rows.length && <tr><td colSpan={4} className="text-center p-6 text-muted-foreground">ยังไม่มีบันทึก</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-2 text-xs whitespace-nowrap">{new Date(r.created_at).toLocaleString("th-TH")}</td>
                <td className="p-2"><Badge variant="outline">{r.action}</Badge></td>
                <td className="p-2 text-xs">{r.target_type}: {r.target_id?.slice(0, 8) ?? "-"}</td>
                <td className="p-2 text-xs text-muted-foreground"><code>{JSON.stringify(r.detail)?.slice(0, 120)}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
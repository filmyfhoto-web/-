import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Trash2, RefreshCw, ScanLine, Search } from "lucide-react";
import {
  loadScanHistory,
  clearScanHistory,
  subscribeScanHistory,
  type ScanHistoryEntry,
} from "./scanHistoryStore";

const STATUS_LABEL: Record<ScanHistoryEntry["status"], string> = {
  matched: "สำเร็จ",
  not_found: "ไม่พบสินค้า",
  invalid: "ไม่ผ่านกฎ",
};
const STATUS_COLOR: Record<ScanHistoryEntry["status"], string> = {
  matched: "bg-green-600",
  not_found: "bg-red-600",
  invalid: "bg-amber-600",
};
const SOURCE_LABEL: Record<ScanHistoryEntry["source"], string> = {
  usb: "USB",
  camera: "กล้อง",
  mobile: "มือถือ",
  manual: "พิมพ์",
  photo: "ถ่ายรูป",
};

function fmtTime(t: number): string {
  try {
    return new Date(t).toLocaleString("th-TH", {
      dateStyle: "short",
      timeStyle: "medium",
    });
  } catch {
    return String(t);
  }
}

export default function PosScanHistory() {
  const [list, setList] = useState<ScanHistoryEntry[]>(() => loadScanHistory());
  const [q, setQ] = useState("");

  useEffect(() => {
    document.title = "ประวัติการสแกน · POS";
    const off = subscribeScanHistory(setList);
    setList(loadScanHistory());
    return off;
  }, []);

  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? list.filter((e) =>
        [e.raw, e.normalized ?? "", e.productName ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(needle),
      )
    : list;

  const counts = list.reduce(
    (acc, e) => {
      acc[e.status] = (acc[e.status] ?? 0) + 1;
      return acc;
    },
    { matched: 0, not_found: 0, invalid: 0 } as Record<ScanHistoryEntry["status"], number>,
  );

  return (
    <div className="p-3 md:p-5 max-w-[1100px] mx-auto space-y-3" data-testid="pos-scan-history">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <ScanLine className="h-5 w-5 text-primary" /> ประวัติการสแกนบาร์โค้ด
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setList(loadScanHistory())}>
            <RefreshCw className="h-4 w-4 mr-1" /> รีเฟรช
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (!confirm("ล้างประวัติการสแกนทั้งหมด?")) return;
              clearScanHistory();
            }}
            data-testid="pos-scan-history-clear"
          >
            <Trash2 className="h-4 w-4 mr-1" /> ล้าง
          </Button>
        </div>
      </div>

      <Card className="p-3 flex flex-wrap gap-2 text-sm">
        <Badge className="bg-green-600">สำเร็จ {counts.matched}</Badge>
        <Badge className="bg-red-600">ไม่พบ {counts.not_found}</Badge>
        <Badge className="bg-amber-600">ไม่ผ่านกฎ {counts.invalid}</Badge>
        <span className="ml-auto text-muted-foreground">รวม {list.length} รายการ (สูงสุด 200)</span>
      </Card>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="ค้นหา บาร์โค้ด / ชื่อสินค้า"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            ยังไม่มีประวัติการสแกน
          </div>
        ) : (
          <div className="divide-y">
            {filtered.map((e) => (
              <div
                key={e.id}
                className="flex items-center gap-3 p-3 hover:bg-muted/40"
                data-testid="pos-scan-history-row"
              >
                <Badge className={`${STATUS_COLOR[e.status]} text-white shrink-0`}>
                  {STATUS_LABEL[e.status]}
                </Badge>
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-sm truncate">
                    {e.normalized && e.normalized !== e.raw ? (
                      <>
                        <span>{e.normalized}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          (raw: {e.raw})
                        </span>
                      </>
                    ) : (
                      e.raw
                    )}
                  </div>
                  {e.productName && (
                    <div className="text-xs text-muted-foreground truncate">{e.productName}</div>
                  )}
                </div>
                <div className="text-xs text-muted-foreground shrink-0 text-right">
                  <div>{fmtTime(e.time)}</div>
                  <div>{SOURCE_LABEL[e.source]}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
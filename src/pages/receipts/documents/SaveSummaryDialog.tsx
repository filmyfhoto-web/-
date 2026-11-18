import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Printer, Copy, FilePlus2, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import { DOC_TYPE_LABEL, DEFAULT_DOC_THEME, getDocLabelForStore } from "../lib/docTheme";
import { toast } from "@/hooks/use-toast";
import { storeBasePath, useStoreSlug } from "../useStore";

export interface SavedDocSummary {
  id: string;
  document_no: string;
  document_type: string;
  is_main?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  storeSlug: string | undefined;
  main: SavedDocSummary | null;
  companions: SavedDocSummary[];
  relatedDocumentNo?: string | null;
  onPrintAll?: () => void;
  onNewDocument?: () => void;
}

export default function SaveSummaryDialog({
  open, onClose, storeSlug, main, companions, relatedDocumentNo, onPrintAll, onNewDocument,
}: Props) {
  if (!main) return null;
  const all: SavedDocSummary[] = [{ ...main, is_main: true }, ...companions];

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `คัดลอก ${text} แล้ว` });
    } catch {
      toast({ title: "คัดลอกไม่สำเร็จ", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            บันทึกเอกสารสำเร็จ
          </DialogTitle>
          <DialogDescription>
            สรุปเอกสารที่สร้างในการบันทึกครั้งนี้ — เปิด พิมพ์ หรือคัดลอกเลขเอกสารได้ทันที
          </DialogDescription>
        </DialogHeader>

        {relatedDocumentNo && (
          <div className="text-sm text-muted-foreground">
            อ้างอิงจาก <span className="font-medium text-foreground">{relatedDocumentNo}</span>
          </div>
        )}

        <div className="space-y-2 max-h-[55vh] overflow-y-auto">
          {all.map((d) => {
            const color = DEFAULT_DOC_THEME[d.document_type]?.header ?? "#475569";
            const label = storeSlug
              ? getDocLabelForStore(storeSlug as any, d.document_type as any)
              : (DOC_TYPE_LABEL[d.document_type] ?? d.document_type);
            const editHref = storeSlug ? `${storeBasePath(storeSlug)}/documents/${d.id}/edit` : "#";
            return (
              <div
                key={d.id}
                className="rounded-md border bg-card p-3 flex items-center gap-3"
                style={{ borderLeft: `4px solid ${color}` }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium" style={{ color }}>{label}</span>
                    <span className="font-mono text-sm">{d.document_no}</span>
                    {d.is_main && <Badge variant="secondary" className="text-[10px]">หลัก</Badge>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button asChild size="sm" variant="outline" title="เปิดเอกสาร">
                    <Link to={editHref} onClick={onClose}>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                  <Button size="sm" variant="ghost" title="คัดลอกเลข" onClick={() => copy(d.document_no)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2 justify-end pt-2">
          {onPrintAll && (
            <Button variant="outline" onClick={() => { onPrintAll(); }}>
              <Printer className="h-4 w-4 mr-1" /> พิมพ์ทั้งหมด
            </Button>
          )}
          {onNewDocument && (
            <Button variant="outline" onClick={() => { onNewDocument(); onClose(); }}>
              <FilePlus2 className="h-4 w-4 mr-1" /> สร้างเอกสารใหม่
            </Button>
          )}
          <Button onClick={onClose}>ปิด</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
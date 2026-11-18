/** หน้าต่างดูตัวอย่างไฟล์ — อยู่ในหน้าคำสั่งซื้อเดิม (ไม่เปลี่ยนหน้า) */
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, RotateCw, X, ZoomIn, ZoomOut, FileText, FileSpreadsheet, Image as ImageIcon } from "lucide-react";
import { fmtSize, type DeskFile } from "@/lib/orderDesk";

export function FilePreviewDialog({
  files, index, onIndex, onClose,
}: { files: DeskFile[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const [zoom, setZoom] = useState(1);
  const [rot, setRot] = useState(0);
  const file = files[index];

  useEffect(() => { setZoom(1); setRot(0); }, [index]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
      if (e.key === "ArrowRight" && index < files.length - 1) onIndex(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, files.length, onClose, onIndex]);

  if (!file) return null;
  const Icon = file.kind === "excel" ? FileSpreadsheet : file.kind === "image" ? ImageIcon : FileText;

  const btn = "inline-flex items-center gap-1.5 rounded-[6px] border border-[#DDE2EA] bg-white px-3 py-1.5 text-[15px] text-[#17263D] hover:bg-[#F6F0FA] disabled:opacity-40";

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-[#17263D]/70 p-6" role="dialog" aria-modal="true" aria-label="ดูตัวอย่างไฟล์">
      <div className="mx-auto flex h-full w-full max-w-[1100px] flex-col rounded-[8px] border border-[#DDE2EA] bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-[#DDE2EA] px-5 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Icon className="h-5 w-5 shrink-0 text-[#5B258B]" />
            <span className="truncate text-[16px] font-semibold text-[#17263D]">{file.name}</span>
            <span className="shrink-0 text-[15px] text-[#5C6B82]">
              {fmtSize(file.sizeBytes)}{file.pages ? ` / ${file.pages} หน้า` : ""} · {index + 1}/{files.length}
            </span>
          </div>
          <button type="button" className={btn} onClick={onClose} aria-label="ปิด"><X className="h-4 w-4" /> ปิด</button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-[#DDE2EA] px-5 py-2">
          <button type="button" className={btn} disabled={index === 0} onClick={() => onIndex(index - 1)}><ChevronLeft className="h-4 w-4" /> ไฟล์ก่อนหน้า</button>
          <button type="button" className={btn} disabled={index >= files.length - 1} onClick={() => onIndex(index + 1)}>ไฟล์ถัดไป <ChevronRight className="h-4 w-4" /></button>
          <span className="mx-1 h-5 w-px bg-[#DDE2EA]" />
          <button type="button" className={btn} onClick={() => setZoom((z) => Math.min(z + 0.25, 4))}><ZoomIn className="h-4 w-4" /> ซูมเข้า</button>
          <button type="button" className={btn} onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))}><ZoomOut className="h-4 w-4" /> ซูมออก</button>
          <button type="button" className={btn} onClick={() => setRot((r) => (r + 90) % 360)}><RotateCw className="h-4 w-4" /> หมุน</button>
          <a
            className={btn} href={file.url || "#"} download={file.name}
            onClick={(e) => { if (!file.url) e.preventDefault(); }}
            aria-disabled={!file.url}
          >
            <Download className="h-4 w-4" /> ดาวน์โหลด
          </a>
        </div>

        <div className="flex-1 overflow-auto bg-[#F7F8FA] p-6">
          <div className="mx-auto w-fit" style={{ transform: `scale(${zoom}) rotate(${rot}deg)`, transformOrigin: "top center" }}>
            {file.url && file.kind === "image" ? (
              <img src={file.url} alt={file.name} className="max-w-full rounded-[6px] border border-[#DDE2EA] bg-white" />
            ) : file.url && file.kind === "pdf" ? (
              <iframe title={file.name} src={file.url} className="h-[70vh] w-[820px] rounded-[6px] border border-[#DDE2EA] bg-white" />
            ) : (
              <div className="flex h-[60vh] w-[720px] flex-col items-center justify-center gap-3 rounded-[6px] border border-dashed border-[#DDE2EA] bg-white text-[#5C6B82]">
                <Icon className="h-12 w-12 text-[#5B258B]" />
                <p className="text-[16px]">ยังไม่มีไฟล์ตัวอย่างสำหรับรายการนี้</p>
                <p className="text-[15px]">{file.name} · {fmtSize(file.sizeBytes)}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

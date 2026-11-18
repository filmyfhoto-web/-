import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCurrentStore } from "../useStore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { elementToPdfBlob } from "../lib/pdfUtils";
import { toast } from "sonner";

type Verdict = "unknown" | "ok" | "fail";

export default function LogoPdfCheck() {
  const { store } = useCurrentStore();
  const nav = useNavigate();
  const sampleRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [verdict, setVerdict] = useState<Verdict>("unknown");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [imgOk, setImgOk] = useState<boolean | null>(null);

  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  if (!store) return <p className="p-4 text-sm text-muted-foreground">กำลังโหลดข้อมูลร้าน...</p>;

  async function runCheck() {
    if (!sampleRef.current) return;
    setBusy(true);
    setVerdict("unknown");
    try {
      // Verify the logo <img> tag was actually loaded
      const img = sampleRef.current.querySelector<HTMLImageElement>("img[data-logo-check]");
      const loaded = !!img && img.complete && img.naturalWidth > 0;
      setImgOk(loaded);

      const blob = await elementToPdfBlob(sampleRef.current, "A4", "portrait", true);
      const url = URL.createObjectURL(blob);
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPdfUrl(url);
      setVerdict(loaded ? "ok" : "fail");
      if (loaded) toast.success("โลโก้ถูก embed ในไฟล์ PDF");
      else toast.error("โลโก้ไม่ถูกโหลด — ตรวจ URL/สิทธิ์การเข้าถึงไฟล์");
    } catch (e: any) {
      toast.error(e.message ?? "สร้าง PDF ทดสอบไม่สำเร็จ");
      setVerdict("fail");
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => nav(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> กลับ
        </Button>
        <h1 className="text-lg font-semibold">ตรวจสอบการฝังโลโก้ใน PDF — {store.name}</h1>
      </div>

      <Card className="p-5 space-y-3">
        <div>
          <p className="font-medium">โลโก้ปัจจุบัน</p>
          <p className="text-xs text-muted-foreground break-all">{store.logo_url || "— ยังไม่ได้ตั้งโลโก้ —"}</p>
        </div>
        {store.logo_url ? (
          <img src={store.logo_url} alt="store logo" className="max-h-24 border border-border rounded" crossOrigin="anonymous" />
        ) : (
          <p className="text-sm text-destructive">ร้านนี้ยังไม่ได้ตั้งค่าโลโก้ — โปรดตั้งค่าโลโก้ก่อนทดสอบ</p>
        )}

        <div className="flex items-center gap-2">
          <Button onClick={runCheck} disabled={busy || !store.logo_url}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${busy ? "animate-spin" : ""}`} />
            {busy ? "กำลังสร้าง PDF ทดสอบ..." : "สร้าง PDF ทดสอบ"}
          </Button>
          {verdict === "ok" && (
            <span className="inline-flex items-center gap-1 text-sm text-emerald-600">
              <CheckCircle2 className="h-4 w-4" /> โลโก้แสดงในไฟล์ PDF
            </span>
          )}
          {verdict === "fail" && (
            <span className="inline-flex items-center gap-1 text-sm text-destructive">
              <XCircle className="h-4 w-4" /> โลโก้ไม่ถูก embed
            </span>
          )}
        </div>
        {imgOk === false && (
          <p className="text-xs text-destructive">
            รูปไม่ถูกโหลด (naturalWidth = 0) — อาจเกิดจาก URL หมดอายุ, CORS หรือไฟล์ไม่มีอยู่จริง
          </p>
        )}
      </Card>

      {/* Hidden-ish sample used for rasterization. Kept visible so the user can preview. */}
      <Card className="p-5">
        <p className="text-xs text-muted-foreground mb-2">ตัวอย่างเอกสารทดสอบ (จะถูกแปลงเป็น PDF)</p>
        <div
          ref={sampleRef}
          className="bg-white text-black p-8 border border-border rounded max-w-[210mm] mx-auto"
          style={{ width: "210mm", minHeight: "297mm" }}
        >
          <div className="flex items-center gap-4 border-b border-gray-300 pb-4">
            {store.logo_url && (
              <img
                src={store.logo_url}
                alt="logo"
                data-logo-check
                crossOrigin="anonymous"
                style={{ maxHeight: "80px", maxWidth: "160px" }}
              />
            )}
            <div>
              <div className="text-xl font-bold">{store.name}</div>
              <div className="text-xs text-gray-600">{store.address || ""}</div>
              <div className="text-xs text-gray-600">โทร {store.phone || "—"}</div>
            </div>
          </div>
          <div className="mt-6 text-center text-lg font-semibold">ตัวอย่างเอกสารสำหรับตรวจโลโก้</div>
          <p className="mt-6 text-sm text-gray-700">
            เอกสารนี้สร้างขึ้นเพื่อทดสอบว่าโลโก้ของร้านสามารถ embed ลงในไฟล์ PDF ที่ถูกอัปโหลดไป Google Drive ได้จริงหรือไม่
          </p>
        </div>
      </Card>

      {pdfUrl && (
        <Card className="p-3">
          <p className="text-xs text-muted-foreground mb-2">ผลลัพธ์ PDF</p>
          <iframe src={pdfUrl} title="pdf-preview" className="w-full h-[600px] border border-border rounded" />
          <div className="mt-2 text-right">
            <a href={pdfUrl} download={`logo-check-${store.slug || store.id}.pdf`} className="text-sm text-primary hover:underline">
              ดาวน์โหลด PDF
            </a>
          </div>
        </Card>
      )}
    </div>
  );
}
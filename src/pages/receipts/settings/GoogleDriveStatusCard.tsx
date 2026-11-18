import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertTriangle, RefreshCw, ExternalLink, Cloud, Loader2, Circle, PlugZap, FolderCog, ShieldCheck } from "lucide-react";
import { tbl } from "../lib/tbl";

type DriveInfo = {
  ok: boolean;
  code?: string;
  folder_id?: string;
  name?: string;
  url?: string;
  trashed?: boolean;
  is_folder?: boolean;
  can_edit?: boolean;
  can_add_children?: boolean;
  owner_email?: string | null;
  error?: string;
};

type Remedy = { title: string; hint: string };
function codeRemedy(code?: string): Remedy | null {
  switch (code) {
    case "connector_missing":
      return {
        title: "Google Drive connector ยังไม่ได้เชื่อมกับโปรเจกต์",
        hint: "เปิด Cloud → Connectors แล้วเลือก Google Drive → กด Connect (ระบบจะ inject GOOGLE_DRIVE_API_KEY ให้อัตโนมัติ)",
      };
    case "folder_id_missing":
      return {
        title: "ยังไม่ได้ตั้งค่า Google Drive Folder ID ของร้านนี้",
        hint: "กรอกช่อง 'Google Drive Folder ID' ด้านล่าง แล้วกดบันทึก (คัดลอกจาก URL โฟลเดอร์ Drive: /drive/folders/XXXXX)",
      };
    case "folder_not_found":
      return {
        title: "ไม่พบโฟลเดอร์ปลายทางบน Drive",
        hint: "ตรวจว่า Folder ID ถูกต้อง และแชร์โฟลเดอร์ให้บัญชี connector เป็น Editor แล้ว",
      };
    case "folder_no_access":
      return {
        title: "บัญชี connector ไม่มีสิทธิ์เข้าถึงโฟลเดอร์นี้",
        hint: "เปิดโฟลเดอร์บน Drive → Share → เพิ่มอีเมล connector เป็น Editor",
      };
    case "folder_trashed":
      return {
        title: "โฟลเดอร์ปลายทางอยู่ในถังขยะ",
        hint: "กู้คืนโฟลเดอร์จากถังขยะ Drive หรือเปลี่ยนไปใช้โฟลเดอร์อื่น",
      };
    case "not_a_folder":
      return {
        title: "ID ที่กรอกไม่ใช่โฟลเดอร์ (เป็นไฟล์)",
        hint: "ใส่ ID ของ 'โฟลเดอร์' ปลายทาง ไม่ใช่ไฟล์ Sheet/Doc",
      };
    case "folder_read_only":
      return {
        title: "บัญชี connector มีสิทธิ์แค่ดูอย่างเดียว",
        hint: "เปลี่ยนสิทธิ์บัญชี connector ในโฟลเดอร์เป็น Editor เพื่อให้อัปโหลด PDF ได้",
      };
    case "folder_error":
      return {
        title: "เกิดข้อผิดพลาดในการเรียก Google Drive API",
        hint: "ลองกดทดสอบใหม่อีกครั้ง ถ้ายังไม่หายให้ตรวจสถานะ Google Drive หรือลอง reconnect connector",
      };
    default:
      return null;
  }
}

type StepStatus = "pending" | "ok" | "fail" | "skip";
function stepStatusFromDrive(step: number, drive: DriveInfo | null): StepStatus {
  if (!drive) return "pending";
  const code = drive.code;
  // Step 1: connector linked
  if (step === 1) return code === "connector_missing" ? "fail" : "ok";
  // Step 2: folder id set
  if (step === 2) {
    if (code === "connector_missing") return "skip";
    return code === "folder_id_missing" ? "fail" : "ok";
  }
  // Step 3: folder accessible + editor
  if (step === 3) {
    if (code === "connector_missing" || code === "folder_id_missing") return "skip";
    return drive.ok ? "ok" : "fail";
  }
  return "pending";
}

export default function GoogleDriveStatusCard({ storeId }: { storeId: string }) {
  const [drive, setDrive] = useState<DriveInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const lastSyncQ = useQuery({
    queryKey: ["rds_last_drive_sync", storeId],
    queryFn: async () => {
      const { data } = await supabase
        .from(tbl("documents") as any)
        .select("google_drive_synced_at,document_no")
        .eq("store_id", storeId)
        .not("google_drive_synced_at", "is", null)
        .order("google_drive_synced_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as any) ?? null;
    },
  });

  async function check() {
    setChecking(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke("rds-google-sync", {
        body: { mode: "test_access", store_id: storeId },
      });
      if (error) throw error;
      const d = data as any;
      setDrive((d?.drive as DriveInfo) ?? null);
      setCheckedAt(new Date().toISOString());
    } catch (e: any) {
      setErrorMsg(e?.message ?? "ตรวจสอบไม่สำเร็จ");
      setDrive(null);
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => { check(); /* eslint-disable-next-line */ }, [storeId]);

  const connected = !!drive?.ok;
  const statusLabel = checking && !drive
    ? { text: "กำลังตรวจสอบ...", cls: "bg-muted text-muted-foreground", Icon: Loader2, spin: true }
    : connected
      ? { text: "เชื่อมแล้ว", cls: "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300", Icon: CheckCircle2, spin: false }
      : { text: "ยังไม่ได้เชื่อม", cls: "bg-destructive/10 text-destructive", Icon: AlertTriangle, spin: false };
  const StatusIcon = statusLabel.Icon;
  const remedy = drive && !drive.ok ? codeRemedy(drive.code) : null;

  const lastSynced = lastSyncQ.data?.google_drive_synced_at as string | undefined;

  const steps: Array<{ n: number; label: string; Icon: any }> = [
    { n: 1, label: "เชื่อม Google Drive connector", Icon: PlugZap },
    { n: 2, label: "ตั้งค่า Folder ID ของร้านนี้", Icon: FolderCog },
    { n: 3, label: "โฟลเดอร์เข้าถึงได้และเป็น Editor", Icon: ShieldCheck },
  ];

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Cloud className="h-5 w-5 text-primary shrink-0" />
          <div className="min-w-0">
            <p className="font-medium">สถานะการเชื่อม Google Drive</p>
            <p className="text-xs text-muted-foreground">ตรวจสอบว่าโฟลเดอร์ปลายทางพร้อมอัปโหลด PDF หรือยัง</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${statusLabel.cls}`}>
            <StatusIcon className={`h-3.5 w-3.5 ${statusLabel.spin ? "animate-spin" : ""}`} />
            {statusLabel.text}
          </span>
          <Button size="sm" onClick={check} disabled={checking}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${checking ? "animate-spin" : ""}`} /> ทดสอบการเชื่อม Google Drive
          </Button>
        </div>
      </div>

      {/* Step-by-step wizard */}
      <ol className="space-y-2">
        {steps.map((s) => {
          const st = stepStatusFromDrive(s.n, drive);
          const StepIcon = s.Icon;
          const dotCls =
            st === "ok"
              ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300 border-green-300"
              : st === "fail"
              ? "bg-destructive/10 text-destructive border-destructive/40"
              : st === "skip"
              ? "bg-muted text-muted-foreground border-border"
              : "bg-muted text-muted-foreground border-border";
          const DotIcon = st === "ok" ? CheckCircle2 : st === "fail" ? AlertTriangle : Circle;
          return (
            <li key={s.n} className="flex items-start gap-3">
              <div className={`mt-0.5 h-6 w-6 rounded-full border flex items-center justify-center shrink-0 ${dotCls}`}>
                <DotIcon className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm">
                  <StepIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className={st === "fail" ? "font-medium text-destructive" : "font-medium"}>
                    ขั้นที่ {s.n}: {s.label}
                  </span>
                </div>
                {st === "fail" && remedy && (
                  <p className="text-xs text-muted-foreground mt-1">{remedy.hint}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div>
          <dt className="text-muted-foreground">โฟลเดอร์ปลายทาง</dt>
          <dd className="font-medium break-all">
            {drive?.name ? (
              drive.url ? (
                <a href={drive.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                  {drive.name} <ExternalLink className="h-3 w-3" />
                </a>
              ) : drive.name
            ) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">บัญชี connector</dt>
          <dd className="font-medium break-all">{drive?.owner_email ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">ตรวจสอบล่าสุด</dt>
          <dd className="font-medium">{checkedAt ? new Date(checkedAt).toLocaleString("th-TH") : "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">ซิงก์เอกสารล่าสุด</dt>
          <dd className="font-medium">
            {lastSynced ? (
              <>
                {new Date(lastSynced).toLocaleString("th-TH")}
                {lastSyncQ.data?.document_no && (
                  <span className="text-muted-foreground"> · {lastSyncQ.data.document_no}</span>
                )}
              </>
            ) : "ยังไม่มีการซิงก์"}
          </dd>
        </div>
      </dl>

      {errorMsg && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
          {errorMsg}
        </div>
      )}
      {!connected && !errorMsg && remedy && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs space-y-1">
          <p className="font-medium text-destructive">{remedy.title}</p>
          <p className="text-muted-foreground">วิธีแก้: {remedy.hint}</p>
          {drive?.error && <p className="text-muted-foreground font-mono break-all">รายละเอียด: {drive.error}</p>}
        </div>
      )}
    </Card>
  );
}
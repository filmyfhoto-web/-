import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, ExternalLink, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import LiffDomainSyncCard from "@/components/admin/LiffDomainSyncCard";

const EXPECTED_LOGIN_CHANNEL_ID = "2010762305";
const EXPECTED_LIFF_ID = "2010762305-5Yqzh5tB";
const CANONICAL_ENDPOINT = "https://filmyynatta.com/l/shop";
const LIFF_URL = `https://liff.line.me/${EXPECTED_LIFF_ID}`;
const MESSAGING_CHANNEL_ID = "2010450986";

type ConfigCheck = {
  login_channel_id_value?: string;
  env?: Record<string, string>;
};

function CopyRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`คัดลอก ${label} แล้ว`);
    } catch {
      toast.error("คัดลอกไม่สำเร็จ");
    }
  };
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`truncate text-sm ${mono ? "font-mono" : ""}`}>{value}</div>
      </div>
      <Button size="sm" variant="ghost" onClick={copy} aria-label={`คัดลอก ${label}`}>
        <Copy className="h-4 w-4" />
      </Button>
    </div>
  );
}

export default function LineSummary() {
  const [check, setCheck] = useState<ConfigCheck | null>(null);
  const [loading, setLoading] = useState(false);
  const [liffIdFromDb, setLiffIdFromDb] = useState<string | null>(null);
  const [endpointFromDb, setEndpointFromDb] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [cfg, oa] = await Promise.all([
        supabase.functions.invoke("line-config-check"),
        supabase
          .from("line_oa_settings")
          .select("liff_id, liff_endpoint_url")
          .limit(1)
          .maybeSingle(),
      ]);
      if (cfg.data) setCheck(cfg.data as ConfigCheck);
      if (oa.data) {
        setLiffIdFromDb((oa.data as { liff_id?: string | null }).liff_id ?? null);
        setEndpointFromDb((oa.data as { liff_endpoint_url?: string | null }).liff_endpoint_url ?? null);
      }
    } catch (e) {
      toast.error("โหลดสถานะไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const currentChannelId = check?.login_channel_id_value ?? "";
  const channelIdMatches = currentChannelId === EXPECTED_LOGIN_CHANNEL_ID;
  const currentLiffId = liffIdFromDb || EXPECTED_LIFF_ID;
  const liffIdMatches = currentLiffId === EXPECTED_LIFF_ID;
  const currentEndpoint = endpointFromDb || CANONICAL_ENDPOINT;
  const endpointMatches = currentEndpoint === CANONICAL_ENDPOINT;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">สรุปค่า LIFF / LINE Login</h1>
          <p className="text-sm text-muted-foreground">ใช้ตรวจสอบหลังอัปเดตค่า พร้อมปุ่มคัดลอก</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          รีเฟรช
        </Button>
      </div>

      <LiffDomainSyncCard onSynced={load} />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>LINE Login Channel</CardTitle>
              <CardDescription>ช่องทางล็อกอินสำหรับลูกค้าผ่าน LIFF</CardDescription>
            </div>
            {check ? (
              channelIdMatches ? (
                <Badge className="bg-emerald-600 hover:bg-emerald-600">
                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> ตรง
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <AlertTriangle className="mr-1 h-3.5 w-3.5" /> ไม่ตรง
                </Badge>
              )
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <CopyRow label="Channel ID ที่คาดหวัง" value={EXPECTED_LOGIN_CHANNEL_ID} />
          <CopyRow
            label="Channel ID ปัจจุบันใน Secret Vault"
            value={currentChannelId || "(ยังไม่ได้ตั้งค่า)"}
          />
          {!channelIdMatches && check ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="mr-1 inline h-4 w-4" />
              ค่า `LINE_LOGIN_CHANNEL_ID` ใน Secret Vault ต้องเป็น {EXPECTED_LOGIN_CHANNEL_ID}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>LIFF App</CardTitle>
              <CardDescription>ID และ Endpoint ที่ใช้เปิดหน้าร้านใน LINE</CardDescription>
            </div>
            {liffIdMatches && endpointMatches ? (
              <Badge className="bg-emerald-600 hover:bg-emerald-600">
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> ตรง
              </Badge>
            ) : (
              <Badge variant="destructive">
                <AlertTriangle className="mr-1 h-3.5 w-3.5" /> ไม่ตรง
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <CopyRow label="LIFF ID (คาดหวัง)" value={EXPECTED_LIFF_ID} />
          <CopyRow label="LIFF ID (ใช้จริงในระบบ)" value={currentLiffId} />
          <CopyRow label="LIFF URL สำหรับแชร์" value={LIFF_URL} />
          <CopyRow label="Endpoint URL (คาดหวัง)" value={CANONICAL_ENDPOINT} />
          <CopyRow label="Endpoint URL (ใช้จริง)" value={currentEndpoint} />
          <div className="pt-2">
            <Button asChild variant="outline" size="sm">
              <a href={LIFF_URL} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" /> ทดสอบเปิด LIFF URL
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Messaging API (OA) Channel</CardTitle>
          <CardDescription>
            แยกกับ LINE Login — ใช้สำหรับ webhook และส่งข้อความ ไม่ใช่สำหรับล็อกอิน
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CopyRow label="Messaging API Channel ID" value={MESSAGING_CHANNEL_ID} />
          <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <AlertTriangle className="mr-1 inline h-4 w-4 text-amber-600" />
            อย่านำ {MESSAGING_CHANNEL_ID} ไปใส่ใน `LINE_LOGIN_CHANNEL_ID` — คนละ channel กัน
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ทางลัด</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/settings">แก้ไข LIFF Settings</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/liff-check">ตรวจสถานะ LIFF</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/line-callbacks">Callback / URL</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/line-secret-vault">Secret Vault</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
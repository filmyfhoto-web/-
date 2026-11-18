import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { RefreshCw, CheckCircle2, AlertTriangle, Globe, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { buildSyncPlan, type LiffSyncPlan } from "@/lib/liffDomainSync";

const AUTO_KEY = "liff_domain_autosync";

function serverCallbackUrl(): string {
  const url = (import.meta.env.VITE_SUPABASE_URL as string) || "";
  const ref = (import.meta.env.VITE_SUPABASE_PROJECT_ID as string) || "";
  if (url) return `${url.replace(/\/+$/, "")}/functions/v1/line-oauth-callback`;
  if (ref) return `https://${ref}.functions.supabase.co/line-oauth-callback`;
  return "";
}

export default function LiffDomainSyncCard({ onSynced }: { onSynced?: () => void }) {
  const [plan, setPlan] = useState<LiffSyncPlan | null>(null);
  const [rowId, setRowId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [auto, setAuto] = useState(() => localStorage.getItem(AUTO_KEY) !== "off");
  const autoDone = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("line_oa_settings")
        .select("id, liff_endpoint_url, liff_callback_urls")
        .limit(1)
        .maybeSingle();
      const row = data as
        | { id: string; liff_endpoint_url: string | null; liff_callback_urls: string[] | null }
        | null;
      setRowId(row?.id ?? null);
      setPlan(
        buildSyncPlan({
          origin: window.location.origin,
          currentEndpoint: row?.liff_endpoint_url ?? null,
          currentCallbacks: row?.liff_callback_urls ?? [],
          serverCallbackUrl: serverCallbackUrl(),
        }),
      );
    } catch {
      toast.error("โหลดค่า LIFF ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  const sync = useCallback(
    async (silent = false) => {
      if (!plan || !plan.needsSync) return;
      setSaving(true);
      try {
        const payload: Record<string, unknown> = {
          liff_endpoint_url: plan.endpoint,
          liff_callback_urls: plan.nextCallbacks,
        };
        if (rowId) payload.id = rowId;
        const { error } = await supabase.from("line_oa_settings" as any).upsert(payload as any);
        if (error) throw error;
        try {
          await supabase.from("activity_logs" as any).insert({
            action: "line.liff_settings_update",
            target_type: "line_login",
            detail: { source: "domain-autosync", origin: plan.origin, endpoint: plan.endpoint, added: plan.missing },
          });
        } catch {
          /* logging is best-effort */
        }
        if (!silent) toast.success("อัปเดตค่า LIFF ให้ตรงกับโดเมนนี้แล้ว");
        else toast.info("ปรับค่า LIFF ให้ตรงกับโดเมนนี้อัตโนมัติแล้ว");
        await load();
        onSynced?.();
      } catch (e: any) {
        if (!silent) toast.error(`อัปเดตไม่สำเร็จ: ${e?.message ?? "unknown"}`);
      } finally {
        setSaving(false);
      }
    },
    [plan, rowId, load, onSynced],
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!auto || autoDone.current || !plan?.needsSync) return;
    autoDone.current = true;
    void sync(true);
  }, [auto, plan, sync]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" /> ซิงก์ค่า LIFF กับโดเมนปัจจุบัน
          </CardTitle>
          <CardDescription>
            ปรับ Endpoint และรายการ Callback URL ให้ตรงกับโดเมนที่เปิดอยู่โดยอัตโนมัติ เพื่อกัน callback พังหลังเปลี่ยนโดเมน
          </CardDescription>
        </div>
        {plan &&
          (plan.needsSync ? (
            <Badge variant="destructive">
              <AlertTriangle className="mr-1 h-3.5 w-3.5" /> ไม่ตรง
            </Badge>
          ) : (
            <Badge className="bg-emerald-600 hover:bg-emerald-600">
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> ตรงแล้ว
            </Badge>
          ))}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <div className="text-xs text-muted-foreground">โดเมนที่ใช้งานอยู่</div>
          <div className="font-mono break-all">{plan?.origin || "—"}</div>
        </div>
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <div className="text-xs text-muted-foreground">Endpoint URL ที่ควรใช้</div>
          <div className="font-mono break-all">{plan?.endpoint || "—"}</div>
        </div>

        {plan && !plan.syncable && (
          <p className="text-xs text-muted-foreground">
            โดเมนนี้เป็น localhost/ไม่ใช่ https — ระบบจะไม่เขียนค่าลงฐานข้อมูล
          </p>
        )}

        {plan && plan.missing.length > 0 && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
            <div className="mb-1 font-medium">Callback URL ที่ยังขาดในระบบ ({plan.missing.length})</div>
            <ul className="space-y-0.5 font-mono">
              {plan.missing.map((u) => (
                <li key={u} className="break-all">• {u}</li>
              ))}
            </ul>
            <p className="mt-2 font-sans text-muted-foreground">
              อย่าลืมเพิ่ม URL เหล่านี้ใน LINE Developers Console → LINE Login → Callback URL ด้วย
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button size="sm" onClick={() => sync(false)} disabled={!plan?.needsSync || saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            ซิงก์เดี๋ยวนี้
          </Button>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> ตรวจใหม่
          </Button>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch
              checked={auto}
              onCheckedChange={(v) => {
                setAuto(v);
                localStorage.setItem(AUTO_KEY, v ? "on" : "off");
              }}
            />
            ซิงก์อัตโนมัติเมื่อเปิดหน้า
          </label>
        </div>
      </CardContent>
    </Card>
  );
}

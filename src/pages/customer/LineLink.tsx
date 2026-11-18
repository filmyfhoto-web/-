import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  CheckCircle2,
  Link2,
  Loader2,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  Unlink,
  AlertTriangle,
  ChevronLeft,
} from "lucide-react";
import CustomerLayout from "@/components/layout/CustomerLayout";
import SeoHead from "@/components/SeoHead";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { lineErrorMessage, startLineLink } from "@/lib/lineOauth";
import { friendStatusLabel, maskLineUserId, type FriendStatus } from "@/lib/lineFriend";
import { fmtDateTime } from "@/lib/format";
import { friendlyError } from "@/lib/errors";

type LineProfileRow = {
  line_user_id: string | null;
  line_display_name: string | null;
  line_picture_url: string | null;
  line_verified_at: string | null;
};

const EMPTY: LineProfileRow = {
  line_user_id: null,
  line_display_name: null,
  line_picture_url: null,
  line_verified_at: null,
};

/**
 * "เชื่อมบัญชี LINE" — attaches a verified LINE identity to the profile of the
 * signed-in user and shows whether it is linked.
 *
 * The binding itself is written server-side only (line-oauth-start in `link`
 * mode → line-oauth-callback with service role). This page never writes any
 * `line_*` column from the browser; it only reads its own profile row.
 */
export default function LineLink() {
  const { user, refresh } = useAuth();
  const [params, setParams] = useSearchParams();
  const [row, setRow] = useState<LineProfileRow>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [friendStatus, setFriendStatus] = useState<FriendStatus | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data, error: err } = await supabase
        .from("profiles")
        .select("line_user_id, line_display_name, line_picture_url, line_verified_at")
        .eq("id", user.id)
        .maybeSingle();
      if (err) throw err;
      setRow((data as LineProfileRow) || EMPTY);
    } catch (e) {
      setError(friendlyError(e, "โหลดสถานะไม่สำเร็จ กรุณาลองใหม่"));
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { void load(); }, [load]);

  // Friend (OA) status is advisory only — never blocks this page.
  useEffect(() => {
    if (!row.line_user_id) { setFriendStatus(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data, error: err } = await supabase.functions.invoke("line-link-lookup", { body: {} });
        if (cancelled || err) return;
        const s = (data as any)?.friend_status;
        if (typeof s === "string") setFriendStatus(s as FriendStatus);
      } catch { /* advisory only */ }
    })();
    return () => { cancelled = true; };
  }, [row.line_user_id]);

  // Read the one-shot result flags left by the OAuth return trip.
  useEffect(() => {
    const err = params.get("error");
    const linked = params.get("linked");
    if (!err && !linked) return;
    if (err) {
      setError(lineErrorMessage(err));
      toast.error(lineErrorMessage(err));
    } else {
      toast.success("เชื่อมบัญชี LINE สำเร็จแล้ว");
      void refresh();
    }
    const next = new URLSearchParams(params);
    next.delete("error");
    next.delete("linked");
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connect() {
    setStarting(true);
    setError("");
    try {
      const url = await startLineLink("/account/line?linked=1");
      window.location.assign(url);
    } catch (e: any) {
      const msg = lineErrorMessage(String(e?.message || e)) || "เริ่มการเชื่อมบัญชีไม่สำเร็จ";
      setError(msg);
      toast.error(msg);
      setStarting(false);
    }
  }

  async function unlink() {
    if (!window.confirm("ต้องการยกเลิกการเชื่อมบัญชี LINE? คุณจะไม่ได้รับแจ้งเตือนสถานะงานทาง LINE อีก")) return;
    setUnlinking(true);
    try {
      const { error: err } = await supabase.rpc("unlink_my_line");
      if (err) throw err;
      setRow(EMPTY);
      setFriendStatus(null);
      toast.success("ยกเลิกการเชื่อมแล้ว");
      await refresh();
    } catch (e) {
      toast.error(friendlyError(e, "ยกเลิกการเชื่อมไม่สำเร็จ"));
    } finally {
      setUnlinking(false);
    }
  }

  const linked = !!row.line_user_id;

  return (
    <CustomerLayout>
      <SeoHead
        title="เชื่อมบัญชี LINE — ร้านนัฐภรณ์ เชียงกลาง"
        description="ผูกบัญชี LINE เข้ากับบัญชีผู้ใช้ของคุณ เพื่อรับแจ้งเตือนสถานะคำสั่งซื้อ"
        path="/account/line"
      />

      <Link to="/account" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3">
        <ChevronLeft className="w-4 h-4" /> กลับไปหน้าบัญชีของฉัน
      </Link>

      <h1 className="text-2xl font-bold mb-4 flex items-center gap-2">
        <MessageCircle className="w-6 h-6 text-[#06C755]" /> เชื่อมบัญชี LINE
      </h1>

      <div className="max-w-xl space-y-4">
        <div className="bg-card rounded-2xl border border-border p-5 shadow-card space-y-4" data-testid="line-link-card">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="line-link-loading">
              <Loader2 className="w-4 h-4 animate-spin" /> กำลังตรวจสอบสถานะ...
            </div>
          ) : (
            <>
              <div className="flex items-start gap-3">
                {linked && row.line_picture_url ? (
                  <img
                    src={row.line_picture_url}
                    alt={`รูปโปรไฟล์ LINE ของ ${row.line_display_name || "ผู้ใช้"}`}
                    className="w-12 h-12 rounded-full object-cover border border-border"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-muted grid place-items-center shrink-0">
                    <MessageCircle className="w-6 h-6 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">สถานะการเชื่อม</span>
                    {linked ? (
                      <Badge data-testid="line-status-linked" className="bg-success text-success-foreground border-0 gap-1">
                        <ShieldCheck className="w-3 h-3" /> ผูกแล้ว
                      </Badge>
                    ) : (
                      <Badge data-testid="line-status-unlinked" variant="outline" className="gap-1 border-amber-300 text-amber-700">
                        <AlertTriangle className="w-3 h-3" /> ยังไม่ผูก
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {linked
                      ? `บัญชีนี้ผูกกับ LINE ของ ${row.line_display_name || "ผู้ใช้ LINE"} แล้ว`
                      : "ผูกบัญชี LINE เพื่อรับแจ้งเตือนสถานะคำสั่งซื้อและใบเสนอราคา"}
                  </p>
                </div>
              </div>

              {linked && (
                <dl className="text-sm rounded-xl bg-muted/40 border border-border divide-y divide-border">
                  <div className="flex justify-between gap-3 px-3 py-2">
                    <dt className="text-muted-foreground">ชื่อ LINE</dt>
                    <dd className="font-medium truncate">{row.line_display_name || "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-3 px-3 py-2">
                    <dt className="text-muted-foreground">LINE ID</dt>
                    <dd className="font-mono text-xs">{maskLineUserId(row.line_user_id)}</dd>
                  </div>
                  <div className="flex justify-between gap-3 px-3 py-2">
                    <dt className="text-muted-foreground">ยืนยันเมื่อ</dt>
                    <dd>{row.line_verified_at ? fmtDateTime(row.line_verified_at) : "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-3 px-3 py-2">
                    <dt className="text-muted-foreground">สถานะเพื่อน OA</dt>
                    <dd>{friendStatus ? friendStatusLabel(friendStatus) : "กำลังตรวจ..."}</dd>
                  </div>
                </dl>
              )}

              {error && (
                <p role="alert" className="text-sm text-destructive" data-testid="line-link-error">{error}</p>
              )}

              <div className="flex flex-wrap gap-2">
                {!linked ? (
                  <Button
                    onClick={connect}
                    disabled={starting}
                    data-testid="line-link-connect"
                    className="rounded-xl bg-[#06C755] hover:bg-[#05b34c] text-white gap-2"
                  >
                    {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                    {starting ? "กำลังเปิด LINE..." : "เชื่อมบัญชี LINE"}
                  </Button>
                ) : (
                  <Button
                    onClick={unlink}
                    disabled={unlinking}
                    variant="outline"
                    data-testid="line-link-unlink"
                    className="rounded-xl gap-2 text-destructive border-destructive/40 hover:bg-destructive/10"
                  >
                    {unlinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlink className="w-4 h-4" />}
                    ยกเลิกการเชื่อม
                  </Button>
                )}
                <Button onClick={() => load()} variant="ghost" className="rounded-xl gap-2" data-testid="line-link-refresh">
                  <RefreshCw className="w-4 h-4" /> รีเฟรชสถานะ
                </Button>
              </div>
            </>
          )}
        </div>

        <div className="text-xs text-muted-foreground space-y-1 px-1">
          <p className="flex items-start gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-success" />
            ระบบจะพาไปยืนยันตัวตนที่ LINE แล้วกลับมาที่หน้านี้โดยยังเป็นบัญชีเดิมของคุณ
          </p>
          <p className="flex items-start gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-success" />
            หนึ่งบัญชี LINE ผูกได้กับผู้ใช้เพียงคนเดียว
          </p>
        </div>
      </div>
    </CustomerLayout>
  );
}

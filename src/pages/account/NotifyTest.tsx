import { useCallback, useEffect, useState } from "react";
import { BellRing, CheckCircle2, Volume2, Smartphone, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";
import AccountPage, { AccountCard } from "@/components/account/AccountPage";
import { Button } from "@/components/ui/button";
import {
  ensureNotificationsEnabled,
  notifyEnvironment,
  sendTestNotification,
} from "@/film-shop/lib/desktopNotify";
import { primeNotificationSound, playNotificationSound, playGroupAlert } from "@/film-shop/lib/notifySound";

type Env = ReturnType<typeof notifyEnvironment>;

const PERMISSION_LABEL: Record<string, string> = {
  granted: "อนุญาตแล้ว",
  denied: "ถูกปิดไว้",
  default: "ยังไม่ได้ตอบ",
  unsupported: "ไม่รองรับ",
};

function Row({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-border/60 last:border-0">
      <span className="text-[14px]">{label}</span>
      <span className={`inline-flex items-center gap-1 text-[13px] font-medium ${ok ? "text-emerald-600" : "text-destructive"}`}>
        {ok ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <XCircle className="h-4 w-4" aria-hidden />}
        {value}
      </span>
    </div>
  );
}

/**
 * หน้าทดสอบสถานะการแจ้งเตือนบนมือถือ
 * ตรวจสิทธิ์ / service worker / โหมดติดตั้งเป็นแอป และยิงทดสอบทั้งเด้งและเสียงจริง
 */
export default function NotifyTest() {
  const [env, setEnv] = useState<Env | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [countdown, setCountdown] = useState(0);

  const refresh = useCallback(() => setEnv(notifyEnvironment()), []);
  useEffect(() => { refresh(); }, [refresh]);

  const addLog = (line: string) =>
    setLog((prev) => [`${new Date().toLocaleTimeString("th-TH")} — ${line}`, ...prev].slice(0, 20));

  const enable = async () => {
    primeNotificationSound();
    const res = await ensureNotificationsEnabled();
    refresh();
    addLog(`ขอสิทธิ์แจ้งเตือน: ${PERMISSION_LABEL[res] ?? res}`);
    if (res === "granted") toast.success("เปิดแจ้งเตือนแล้ว");
    else if (res === "denied") toast.error("เบราว์เซอร์ปิดแจ้งเตือนไว้ — เปิดใหม่ได้ที่ตั้งค่าเว็บไซต์");
  };

  const testNow = async () => {
    const res = await sendTestNotification("ทดสอบแจ้งเตือน FILM SHOP", "ถ้าเห็นข้อความนี้ แปลว่าการแจ้งเตือนใช้งานได้จริง");
    addLog(res.ok ? `ส่งแจ้งเตือนสำเร็จ (ช่องทาง: ${res.via})` : `ส่งแจ้งเตือนไม่สำเร็จ — ${res.reason}`);
    if (res.ok) toast.success("ส่งแจ้งเตือนทดสอบแล้ว");
    else toast.error(res.reason ?? "ส่งแจ้งเตือนไม่สำเร็จ");
  };

  const testDelayed = () => {
    let left = 8;
    setCountdown(left);
    addLog("ตั้งเวลาแจ้งเตือน 8 วินาที — ปิดหน้าจอหรือสลับแอปเพื่อทดสอบ");
    const timer = setInterval(() => {
      left -= 1;
      setCountdown(left);
      if (left <= 0) {
        clearInterval(timer);
        void testNow();
      }
    }, 1000);
  };

  const testSound = (which: "default" | 1 | 2) => {
    primeNotificationSound();
    if (which === "default") { playNotificationSound(); addLog("เล่นเสียงแจ้งเตือนมาตรฐาน"); }
    else { playGroupAlert(which); addLog(`เล่นเสียงกลุ่ม ${which}`); }
  };

  const testVibrate = () => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.([200, 100, 200]);
      addLog("สั่งให้เครื่องสั่น");
    } else {
      addLog("อุปกรณ์นี้ไม่รองรับการสั่น");
    }
  };

  const granted = env?.permission === "granted";

  return (
    <AccountPage
      title="ทดสอบการแจ้งเตือน"
      description="ตรวจสอบว่าการแจ้งเตือนเด้งและเสียงทำงานจริงบนอุปกรณ์ของคุณ"
      path="/account/notify-test"
      action={
        <button type="button" onClick={refresh} aria-label="รีเฟรชสถานะ" className="min-h-11 min-w-11 grid place-items-center rounded-xl hover:bg-primary-foreground/15">
          <RefreshCw className="h-5 w-5" aria-hidden />
        </button>
      }
    >
      <AccountCard>
        <h2 className="text-[15px] font-semibold mb-1">สถานะอุปกรณ์</h2>
        {env && (
          <div data-testid="notify-test-status">
            <Row label="รองรับการแจ้งเตือน" ok={env.supported} value={env.supported ? "รองรับ" : "ไม่รองรับ"} />
            <Row label="สิทธิ์แจ้งเตือน" ok={granted} value={PERMISSION_LABEL[env.permission] ?? env.permission} />
            <Row label="การเชื่อมต่อปลอดภัย (HTTPS)" ok={env.secureContext} value={env.secureContext ? "ปลอดภัย" : "ไม่ปลอดภัย"} />
            <Row label="Service Worker" ok={env.serviceWorker} value={env.serviceWorker ? "พร้อม" : "ไม่มี"} />
            <Row label="เปิดแบบติดตั้งเป็นแอป" ok={env.standalone} value={env.standalone ? "ใช่" : "เปิดในเบราว์เซอร์"} />
            <Row label="รองรับการสั่น" ok={env.vibrate} value={env.vibrate ? "รองรับ" : "ไม่รองรับ"} />
          </div>
        )}
        {env?.iOS && !env.standalone && (
          <p className="mt-3 rounded-xl bg-amber-50 p-3 text-[13px] text-amber-900">
            บน iPhone/iPad ต้องกด “แชร์ → เพิ่มไปยังหน้าจอโฮม” แล้วเปิดจากไอคอนแอป การแจ้งเตือนจึงจะทำงาน
          </p>
        )}
      </AccountCard>

      <AccountCard>
        <h2 className="text-[15px] font-semibold mb-3">ทดสอบการแจ้งเตือน</h2>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void enable()} data-testid="notify-test-enable" className="min-h-11">
            <BellRing className="mr-1 h-4 w-4" aria-hidden /> {granted ? "สิทธิ์พร้อมแล้ว" : "เปิดแจ้งเตือน"}
          </Button>
          <Button type="button" variant="outline" onClick={() => void testNow()} data-testid="notify-test-now" className="min-h-11">
            ทดสอบเด้งทันที
          </Button>
          <Button type="button" variant="outline" onClick={testDelayed} data-testid="notify-test-delayed" className="min-h-11">
            {countdown > 0 ? `เด้งใน ${countdown} วิ` : "ทดสอบเด้งใน 8 วินาที"}
          </Button>
          <Button type="button" variant="outline" onClick={testVibrate} className="min-h-11">
            <Smartphone className="mr-1 h-4 w-4" aria-hidden /> ทดสอบสั่น
          </Button>
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">
          เคล็ดลับ: กด “ทดสอบเด้งใน 8 วินาที” แล้วสลับออกจากแอปหรือปิดหน้าจอ เพื่อดูว่าการแจ้งเตือนเด้งจริงตอนไม่ได้เปิดแอป
        </p>
      </AccountCard>

      <AccountCard>
        <h2 className="text-[15px] font-semibold mb-3">ทดสอบเสียง</h2>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => testSound("default")} data-testid="notify-test-sound" className="min-h-11">
            <Volume2 className="mr-1 h-4 w-4" aria-hidden /> เสียงมาตรฐาน
          </Button>
          <Button type="button" variant="outline" onClick={() => testSound(1)} className="min-h-11">เสียงกลุ่ม 1 (เว็บแอป)</Button>
          <Button type="button" variant="outline" onClick={() => testSound(2)} className="min-h-11">เสียงกลุ่ม 2 (NATTA.Q)</Button>
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">ถ้าไม่ได้ยินเสียง ให้ปิดโหมดเงียบ/สั่น และเพิ่มระดับเสียงสื่อของเครื่อง</p>
      </AccountCard>

      <AccountCard>
        <h2 className="text-[15px] font-semibold mb-2">ผลการทดสอบล่าสุด</h2>
        {log.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">ยังไม่มีการทดสอบ</p>
        ) : (
          <ul className="space-y-1 text-[13px]" data-testid="notify-test-log">
            {log.map((l, i) => <li key={i} className="text-muted-foreground">{l}</li>)}
          </ul>
        )}
      </AccountCard>
    </AccountPage>
  );
}
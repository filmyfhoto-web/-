import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Banknote, QrCode, Wallet, CreditCard, NotebookPen, Delete } from "lucide-react";
import { cn } from "@/lib/utils";

export type PosPayType = "cash" | "qr" | "transfer" | "card" | "credit";

const fmt = (n: number) =>
  new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

const METHODS: { key: PosPayType; label: string; icon: typeof Banknote }[] = [
  { key: "cash", label: "เงินสด", icon: Banknote },
  { key: "qr", label: "QR", icon: QrCode },
  { key: "transfer", label: "โอน", icon: Wallet },
  { key: "card", label: "บัตร", icon: CreditCard },
  { key: "credit", label: "ลงบัญชี", icon: NotebookPen },
];

export type PosPayItem = { name: string; qty: number; lineTotal: number };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  netTotal: number;
  submitting?: boolean;
  items?: PosPayItem[];
  /** Channel the cashier picked before opening the pad (เงินสด/โอน/QR/บัตร). */
  initialMethod?: PosPayType;
  /** คุณครู/ลูกค้าที่ผูกกับบิล — ต้องเห็นชัดก่อนยืนยันบิลลงบัญชี */
  customerName?: string | null;
  customerOrg?: string | null;
  /** หมายเหตุ/เหตุผล (สำคัญกับบิลลงบัญชี) */
  note?: string;
  onNoteChange?: (v: string) => void;
  onConfirm: (payload: { paymentType: PosPayType; cashReceived: number | null; change: number; note: string }) => void;
}

export default function PaymentCalculatorDialog({
  open, onOpenChange, netTotal, submitting, items, initialMethod,
  customerName, customerOrg, note, onNoteChange, onConfirm,
}: Props) {
  const [method, setMethod] = useState<PosPayType>(initialMethod ?? "cash");
  const [entry, setEntry] = useState<string>("");
  const [localNote, setLocalNote] = useState<string>(note ?? "");
  const noteValue = note ?? localNote;
  const setNote = (v: string) => { setLocalNote(v); onNoteChange?.(v); };

  // Opening the pad must honour the channel the cashier already chose —
  // never silently reset the sale back to cash.
  useEffect(() => {
    if (open) {
      setMethod(initialMethod ?? "cash");
      setEntry("");
    }
  }, [open, initialMethod]);

  const received = useMemo(() => {
    const n = parseFloat(entry || "0");
    return Number.isFinite(n) ? n : 0;
  }, [entry]);
  const isCash = method === "cash";
  const isCredit = method === "credit";
  const change = Math.max(0, received - netTotal);
  const canConfirm = isCash ? received >= netTotal : true;

  function press(k: string) {
    setEntry((prev) => {
      if (k === "C") return "";
      if (k === "back") return prev.slice(0, -1);
      if (k === ".") return prev.includes(".") ? prev : (prev || "0") + ".";
      const next = (prev + k).replace(/^0+(\d)/, "$1");
      return next.length > 12 ? prev : next;
    });
  }
  function quick(n: number) {
    setEntry(String(n));
  }
  function exact() {
    setEntry(String(netTotal));
  }

  function confirm() {
    if (!canConfirm) return;
    const cash = isCash ? received : null;
    const chg = isCash ? change : 0;
    onConfirm({ paymentType: method, cashReceived: cash, change: chg, note: noteValue.trim() });
  }

  const hasItems = !!items && items.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          // 100dvh + scrollable body keeps the confirm button reachable on a 390×844 phone.
          "p-0 gap-0 overflow-hidden flex flex-col max-h-[100dvh]",
          hasItems ? "max-w-3xl" : "max-w-lg",
        )}
        data-testid="pos-payment-calc"
      >
        <DialogHeader className="px-4 pt-4 pb-2 border-b bg-muted/30 shrink-0">
          <DialogTitle className="text-base">ชำระเงิน</DialogTitle>
          <div className="mt-2 grid grid-cols-5 gap-1.5">
            {METHODS.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMethod(m.key)}
                data-testid={`pos-pay-method-${m.key}`}
                data-selected={method === m.key ? "true" : "false"}
                aria-pressed={method === m.key}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-md border py-2 text-xs font-medium transition",
                  method === m.key
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-background text-muted-foreground hover:bg-muted",
                )}
              >
                <m.icon className="h-4 w-4" aria-hidden />
                {m.label}
              </button>
            ))}
          </div>
        </DialogHeader>

        <div className={cn("grid gap-0 flex-1 min-h-0 overflow-y-auto", hasItems ? "md:grid-cols-[1fr_260px]" : "grid-cols-1")}>
          {/* LEFT — display + numpad */}
          <div className="p-4 space-y-3">
            <div className="rounded-lg border bg-muted/40 p-3 text-right">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">ยอดสุทธิ</span>
                <span className="font-semibold tabular-nums">฿{fmt(netTotal)}</span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">รับเงิน</div>
              <div className="text-3xl font-extrabold tabular-nums" data-testid="pos-pay-received">
                {entry ? fmt(received) : "0.00"}
              </div>
              <div className="mt-1 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">เงินทอน</span>
                <span
                  className={cn(
                    "font-bold tabular-nums",
                    change > 0 ? "text-emerald-600" : "text-muted-foreground",
                  )}
                  data-testid="pos-pay-change"
                >
                  ฿{fmt(change)}
                </span>
              </div>
            </div>

            {isCash ? (
              <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                <div className="col-span-3 grid grid-cols-3 gap-2">
                  {["7", "8", "9", "4", "5", "6", "1", "2", "3", ".", "0", "back"].map((k) => (
                    <Button
                      key={k}
                      variant="secondary"
                      onClick={() => press(k)}
                      className="h-11 text-lg font-semibold"
                      aria-label={k === "back" ? "ลบตัวเลข" : k}
                    >
                      {k === "back" ? <Delete className="h-5 w-5" /> : k}
                    </Button>
                  ))}
                </div>
                <div className="grid grid-rows-4 gap-2 w-20">
                  {[1000, 500, 100].map((n) => (
                    <Button key={n} variant="outline" onClick={() => quick(n)} className="h-11 px-0 text-sm">
                      {n.toLocaleString()}
                    </Button>
                  ))}
                  <Button
                    variant="outline"
                    onClick={exact}
                    className="h-11 px-0 text-sm border-primary text-primary font-semibold"
                  >
                    เต็ม
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                รับชำระด้วย{METHODS.find((m) => m.key === method)?.label} — ยืนยันเมื่อได้รับเงินครบ
                <div className="mt-2 text-2xl font-bold text-foreground tabular-nums">฿{fmt(netTotal)}</div>
              </div>
            )}

            {/* คุณครู/ลูกค้า + เหตุผล — บังคับให้เห็นชัดสำหรับบิลลงบัญชี */}
            {isCredit && (
              <div className="rounded-lg border border-orange-300 bg-orange-50 p-3 space-y-2" data-testid="pos-pay-credit-panel">
                <div className="text-sm font-semibold text-orange-800">บิลลงบัญชี (ยังไม่ชำระเงิน)</div>
                <div className="text-sm" data-testid="pos-pay-credit-customer">
                  {customerName ? (
                    <>
                      <span className="font-semibold">{customerName}</span>
                      {customerOrg ? <span className="block text-xs text-muted-foreground">{customerOrg}</span> : null}
                    </>
                  ) : (
                    <span className="text-destructive font-medium">ยังไม่ได้เลือกคุณครู/ลูกค้า — ควรเลือกก่อนลงบัญชี</span>
                  )}
                </div>
                <label className="block text-xs font-medium text-orange-900" htmlFor="pos-pay-note">
                  เหตุผล / หมายเหตุ
                </label>
                <Textarea
                  id="pos-pay-note"
                  rows={2}
                  value={noteValue}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="เช่น เบิกงบโรงเรียน รอวางบิลสิ้นเดือน"
                  data-testid="pos-pay-note"
                  className="bg-white"
                />
              </div>
            )}

          </div>

          {/* RIGHT — items */}
          {hasItems && (
            <aside className="border-t md:border-t-0 md:border-l bg-muted/20 flex flex-col max-h-[70vh]">
              <div className="px-3 py-2 border-b text-xs font-semibold text-muted-foreground">
                รายการ ({items!.reduce((s, i) => s + i.qty, 0)} ชิ้น)
              </div>
              <ul className="flex-1 overflow-auto divide-y" data-testid="pos-pay-items">
                {items!.map((it, idx) => (
                  <li key={idx} className="px-3 py-2 text-sm flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{it.name}</div>
                      <div className="text-xs text-muted-foreground">× {it.qty}</div>
                    </div>
                    <div className="tabular-nums font-semibold shrink-0">฿{fmt(it.lineTotal)}</div>
                  </li>
                ))}
              </ul>
              <div className="px-3 py-2 border-t bg-background/70 text-sm flex items-center justify-between">
                <span className="text-muted-foreground">รวม</span>
                <span className="font-bold tabular-nums">฿{fmt(netTotal)}</span>
              </div>
            </aside>
          )}
        </div>

        {/* sticky action footer — always visible, never scrolls away */}
        <div className="shrink-0 border-t bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex gap-2">
          <Button variant="outline" className="flex-1 h-11" onClick={() => setEntry("")}>
            ล้าง
          </Button>
          <Button
            className="flex-[2] h-11 bg-gradient-to-r from-sky-600 to-blue-700 text-white hover:from-sky-500 hover:to-blue-600"
            disabled={!canConfirm || submitting}
            onClick={confirm}
            data-testid="pos-pay-confirm"
          >
            {submitting ? "กำลังบันทึก…" : "ตกลง"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
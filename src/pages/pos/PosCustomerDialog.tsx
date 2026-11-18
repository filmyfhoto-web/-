import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, RefreshCw, School, Search, UserPlus } from "lucide-react";
import { useCustomerDirectory, type DirectoryRow } from "@/lib/posCustomerDirectory";
import { cn } from "@/lib/utils";
import type { PosCustomerRef } from "./posTypes";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  value: PosCustomerRef | null;
  onSave: (v: PosCustomerRef | null) => void;
};

/**
 * Customer attach dialog.
 *
 * Default view is the existing customer directory (`v_unified_customers`) so the
 * cashier just taps the teacher who walked in — name plus the school/องค์กร they
 * belong to. Adding a brand-new teacher is still one tap away.
 */
export default function PosCustomerDialog({ open, onOpenChange, value, onSave }: Props) {
  const [tab, setTab] = useState<"list" | "new">("list");
  const { rows, loading, refresh } = useCustomerDirectory(open);
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [line, setLine] = useState("");
  const [org, setOrg] = useState("");

  useEffect(() => {
    if (open) {
      setTab("list");
      setQ("");
      setName(value?.name ?? "");
      setPhone(value?.phone ?? "");
      setLine(value?.line_display_name ?? "");
      setOrg(value?.org ?? "");
    }
  }, [open, value]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? rows.filter(
          (r) =>
            (r.name || "").toLowerCase().includes(needle) ||
            (r.address || "").toLowerCase().includes(needle) ||
            (r.phone || "").includes(needle),
        )
      : rows;
    return list.slice(0, 200);
  }, [rows, q]);

  function pick(r: DirectoryRow) {
    onSave({
      name: (r.name || "").trim(),
      phone: r.phone?.trim() || null,
      line_display_name: r.line_display_name?.trim() || null,
      line_user_id: r.line_user_id ?? null,
      org: r.address?.trim() || null,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md flex flex-col max-h-[100dvh] gap-0" data-testid="pos-customer-dialog">
        <DialogHeader className="shrink-0">
          <DialogTitle>เลือกลูกค้า (คุณครู/หน่วยงาน)</DialogTitle>
        </DialogHeader>
        <div className="shrink-0 grid grid-cols-2 gap-1.5 pb-2">
          <button
            type="button"
            onClick={() => setTab("list")}
            aria-pressed={tab === "list"}
            data-testid="pos-customer-tab-list"
            className={cn("h-10 rounded-md border text-sm font-semibold", tab === "list" ? "bg-primary text-primary-foreground border-primary" : "bg-background")}
          >
            รายชื่อที่มีอยู่
          </button>
          <button
            type="button"
            onClick={() => setTab("new")}
            aria-pressed={tab === "new"}
            data-testid="pos-customer-tab-new"
            className={cn("h-10 rounded-md border text-sm font-semibold flex items-center justify-center gap-1", tab === "new" ? "bg-primary text-primary-foreground border-primary" : "bg-background")}
          >
            <UserPlus className="w-4 h-4" aria-hidden /> เพิ่มคุณครูใหม่
          </button>
        </div>
        {/* body scrolls so the footer actions stay on screen on a 390px phone */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-3 py-2" data-testid="pos-customer-body">
          {tab === "list" ? (
            <>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
                  <Input
                    className="pl-9 h-11"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="ค้นหาชื่อคุณครู / โรงเรียน / เบอร์…"
                    data-testid="pos-customer-search"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 shrink-0"
                  onClick={() => void refresh(true)}
                  disabled={loading}
                  aria-label="รีเฟรชรายชื่อ"
                  title="รีเฟรชรายชื่อจากฐานข้อมูล"
                  data-testid="pos-customer-refresh"
                >
                  <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden />
                </Button>
              </div>
              {loading && rows.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> กำลังโหลดรายชื่อ…
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-6" data-testid="pos-customer-empty">
                  ไม่พบรายชื่อ — กด “เพิ่มคุณครูใหม่”
                </div>
              ) : (
                <ul className="space-y-1.5" data-testid="pos-customer-list">
                  {filtered.map((r) => (
                    <li key={r.source_id}>
                      <button
                        type="button"
                        onClick={() => pick(r)}
                        data-testid="pos-customer-item"
                        className="w-full text-left rounded-md border px-3 py-2 hover:bg-muted/60"
                      >
                        <div className="font-semibold truncate">{r.name}</div>
                        <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
                          {r.address ? (
                            <>
                              <School className="w-3 h-3 shrink-0" aria-hidden />
                              <span className="truncate">{r.address}</span>
                            </>
                          ) : (
                            <span>ไม่ระบุโรงเรียน/หน่วยงาน</span>
                          )}
                          {r.phone ? <span className="ml-1">· {r.phone}</span> : null}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>
          <div>
            <Label htmlFor="pcd-name">ชื่อลูกค้า</Label>
            <Input id="pcd-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น คุณครูสมชาย" />
          </div>
          <div>
            <Label htmlFor="pcd-org">โรงเรียน / หน่วยงาน</Label>
            <Input id="pcd-org" value={org} onChange={(e) => setOrg(e.target.value)} placeholder="เช่น โรงเรียนบ้านเชียงกลาง" data-testid="pos-customer-org" />
          </div>
          <div>
            <Label htmlFor="pcd-phone">เบอร์โทร</Label>
            <Input id="pcd-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="08x-xxx-xxxx" />
          </div>
          <div>
            <Label htmlFor="pcd-line">ชื่อ LINE (ถ้ามี)</Label>
            <Input id="pcd-line" value={line} onChange={(e) => setLine(e.target.value)} placeholder="LINE Display Name" />
          </div>
            </>
          )}
        </div>
        <DialogFooter className="gap-2 sm:justify-between shrink-0 border-t pt-3 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
          <Button
            variant="ghost"
            className="text-destructive"
            onClick={() => {
              onSave(null);
              onOpenChange(false);
            }}
            data-testid="pos-customer-clear"
          >
            ล้างลูกค้า
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
            <Button
              onClick={() => {
                const trimmed = name.trim();
                if (!trimmed) {
                  onSave(null);
                } else {
                  onSave({
                    name: trimmed,
                    phone: phone.trim() || null,
                    line_display_name: line.trim() || null,
                    line_user_id: null,
                    org: org.trim() || null,
                  });
                }
                onOpenChange(false);
              }}
              data-testid="pos-customer-save"
            >
              บันทึก
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
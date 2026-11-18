import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowDown, ArrowUp, Check, Loader2, Plus, Star, Trash2 } from 'lucide-react';
import { QUICK_CATEGORIES, sortQuickItems, type QuickItem } from '@/film-shop/hooks/useQuickItems';

const CATS = QUICK_CATEGORIES.filter((c) => c.id !== 'all');

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: QuickItem[];
  loading: boolean;
  create: (p: Partial<QuickItem>) => Promise<void>;
  update: (id: string, p: Partial<QuickItem>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  move: (id: string, dir: -1 | 1) => Promise<void>;
}

/** จัดการรายการด่วน — เพิ่ม/แก้/ลบ/เปิด-ปิด/ปักหมุด/เรียงลำดับ (บันทึกลงฐานข้อมูลจริง) */
export function QuickItemsManager({ open, onOpenChange, items, loading, create, update, remove, move }: Props) {
  const [draft, setDraft] = useState({ name: '', price: '', unit: 'แผ่น', category: 'print' });
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<QuickItem | null>(null);
  const list = sortQuickItems(items);

  const guard = async (fn: () => Promise<void>, ok?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      if (ok) toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'ทำรายการไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const add = () =>
    guard(async () => {
      if (!draft.name.trim()) throw new Error('กรุณากรอกชื่อรายการ');
      await create({
        name: draft.name,
        price: Number(draft.price) || 0,
        unit: draft.unit,
        category: draft.category as QuickItem['category'],
        sort_order: (list.at(-1)?.sort_order ?? 0) + 1,
      });
      setDraft({ name: '', price: '', unit: draft.unit, category: draft.category });
    }, 'เพิ่มรายการด่วนแล้ว');

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl" data-testid="quick-items-manager">
          <DialogHeader>
            <DialogTitle className="text-[#0B1E32]">จัดการรายการด่วน</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-muted/40 p-3 md:grid-cols-[1fr_110px_110px_140px_auto]">
            <Input placeholder="ชื่อรายการ" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <Input placeholder="ราคา" inputMode="decimal" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} />
            <Input placeholder="หน่วย" value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} />
            <Select value={draft.category} onValueChange={(v) => setDraft({ ...draft, category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATS.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={add} disabled={busy} className="bg-[#7A1746] hover:bg-[#63113a]">
              <Plus className="mr-1 h-4 w-4" /> เพิ่ม
            </Button>
          </div>

          <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
            {loading && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />กำลังโหลดรายการด่วน…
              </p>
            )}
            {!loading && list.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">ยังไม่มีรายการด่วน — เพิ่มรายการแรกด้านบนได้เลย</p>
            )}
            {list.map((it, idx) => (
              <QuickItemRow
                key={it.id}
                item={it}
                isFirst={idx === 0}
                isLast={idx === list.length - 1}
                update={update}
                move={move}
                onDelete={() => setPendingDelete(it)}
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingDelete} onOpenChange={(v) => !v && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ลบรายการด่วน?</AlertDialogTitle>
            <AlertDialogDescription>
              ลบ “{pendingDelete?.name}” ออกจากรายการด่วน — เอกสารที่ออกไปแล้วไม่ได้รับผลกระทบ
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const target = pendingDelete;
                setPendingDelete(null);
                if (target) void guard(() => remove(target.id), 'ลบรายการด่วนแล้ว');
              }}
            >
              ลบ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

type RowDraft = { name: string; price: string; unit: string; category: QuickItem['category'] };

const toDraft = (it: QuickItem): RowDraft => ({
  name: it.name,
  price: String(it.price),
  unit: it.unit,
  category: it.category,
});

/**
 * แถวรายการด่วน — แก้ไขในสถานะ draft ของแถว (ไม่ยิง update ทุกตัวอักษร)
 * บันทึกเมื่อกดปุ่ม “บันทึก” หรือเมื่อออกจากช่อง (onBlur) แบบกันคิวซ้อน
 */
export function QuickItemRow({
  item, isFirst, isLast, update, move, onDelete,
}: {
  item: QuickItem;
  isFirst: boolean;
  isLast: boolean;
  update: (id: string, p: Partial<QuickItem>) => Promise<void>;
  move: (id: string, dir: -1 | 1) => Promise<void>;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState<RowDraft>(() => toDraft(item));
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const inFlight = useRef(false);
  const queued = useRef(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // ซิงก์ค่าจากเซิร์ฟเวอร์เฉพาะตอนไม่มีการแก้ค้างอยู่
  useEffect(() => {
    if (state === 'idle') setDraft(toDraft(item));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, item.name, item.price, item.unit, item.category]);

  const dirty =
    draft.name !== item.name ||
    (Number(draft.price) || 0) !== item.price ||
    draft.unit !== item.unit ||
    draft.category !== item.category;

  const save = async () => {
    if (!dirty && state !== 'saving') return;
    if (inFlight.current) { queued.current = true; return; }
    inFlight.current = true;
    setState('saving');
    try {
      do {
        queued.current = false;
        const d = draftRef.current;
        await update(item.id, {
          name: d.name.trim() || item.name,
          price: Number(d.price) || 0,
          unit: d.unit.trim() || item.unit,
          category: d.category,
        });
      } while (queued.current);
      setState('saved');
      setTimeout(() => setState('idle'), 1500);
    } catch (e) {
      setState('idle');
      toast.error(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    } finally {
      inFlight.current = false;
    }
  };

  return (
    <div
      data-testid="quick-item-row"
      className="grid grid-cols-1 items-center gap-2 rounded-lg border border-border bg-card p-2 md:grid-cols-[1fr_100px_100px_130px_auto]"
    >
      <Input aria-label="ชื่อรายการ" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} onBlur={() => void save()} />
      <Input aria-label="ราคา" inputMode="decimal" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} onBlur={() => void save()} />
      <Input aria-label="หน่วย" value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} onBlur={() => void save()} />
      <Select
        value={draft.category}
        onValueChange={(v) => { setDraft({ ...draft, category: v as QuickItem['category'] }); setTimeout(() => void save(), 0); }}
      >
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {CATS.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
          <SelectItem value="other">อื่นๆ</SelectItem>
        </SelectContent>
      </Select>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="sm"
          variant={dirty ? 'default' : 'ghost'}
          aria-label="บันทึก"
          disabled={!dirty || state === 'saving'}
          onClick={() => void save()}
          className={dirty ? 'bg-[#7A1746] hover:bg-[#63113a]' : ''}
        >
          {state === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" /> : state === 'saved' ? <Check className="h-4 w-4 text-emerald-600" /> : 'บันทึก'}
        </Button>
        <span className="sr-only" data-testid="quick-item-save-state">{state}</span>
        <Button type="button" size="icon" variant="ghost" aria-label="ปักหมุด" onClick={() => void update(item.id, { pinned: !item.pinned })}>
          <Star className={item.pinned ? 'h-4 w-4 fill-[#7A1746] text-[#7A1746]' : 'h-4 w-4 text-muted-foreground'} />
        </Button>
        <Button type="button" size="icon" variant="ghost" aria-label="เลื่อนขึ้น" disabled={isFirst} onClick={() => void move(item.id, -1)}>
          <ArrowUp className="h-4 w-4" />
        </Button>
        <Button type="button" size="icon" variant="ghost" aria-label="เลื่อนลง" disabled={isLast} onClick={() => void move(item.id, 1)}>
          <ArrowDown className="h-4 w-4" />
        </Button>
        <Switch aria-label="เปิดใช้งาน" checked={item.active} onCheckedChange={(v) => void update(item.id, { active: v })} />
        <Button type="button" size="icon" variant="ghost" aria-label="ลบ" onClick={onDelete}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

export default QuickItemsManager;

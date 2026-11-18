import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, Package } from 'lucide-react';
import { toast } from 'sonner';
import { useAppData } from '@/film-shop/hooks/useAppData';
import { ProductLabels, ProductPricing } from '@/film-shop/types';

interface Row {
  key: string;
  label: string;
  price: string;
  isNew?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const slugify = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9ก-๙]+/gi, '_').replace(/^_+|_+$/g, '') || `type_${Date.now()}`;

export function ManageProductTypesDialog({ open, onOpenChange }: Props) {
  const { settings, setSettings } = useAppData();
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; idx: number; label: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    const labels = settings.productLabels || {};
    const pricing = settings.productPricing || {};
    const keys = Array.from(new Set([...Object.keys(labels), ...Object.keys(pricing)]));
    setRows(
      keys.map(k => ({
        key: k,
        label: labels[k] || k,
        price: (pricing[k] ?? 0).toString(),
      }))
    );
  }, [open, settings]);

  const updateRow = (idx: number, patch: Partial<Row>) => {
    setRows(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const addRow = () => {
    setRows(prev => [...prev, { key: '', label: '', price: '0', isNew: true }]);
  };

  const requestDeleteRow = (idx: number) => {
    const row = rows[idx];
    if (!row) return;
    if (row.isNew) {
      setRows(prev => prev.filter((_, i) => i !== idx));
      return;
    }
    setConfirmDelete({ open: true, idx, label: row.label || row.key });
  };

  const confirmDeleteRow = () => {
    if (confirmDelete === null) return;
    setRows(prev => prev.filter((_, i) => i !== confirmDelete.idx));
    setConfirmDelete(null);
  };

  const handleSave = async () => {
    // Validate
    const cleaned: Row[] = [];
    const seenKeys = new Set<string>();
    for (const r of rows) {
      const label = r.label.trim();
      if (!label) {
        toast.error('กรุณากรอกชื่อประเภทสินค้าให้ครบทุกแถว');
        return;
      }
      const key = r.key.trim() || slugify(label);
      if (seenKeys.has(key)) {
        toast.error(`ชื่อ/รหัสประเภทซ้ำ: ${label}`);
        return;
      }
      seenKeys.add(key);
      const price = parseFloat(r.price) || 0;
      if (price < 0) {
        toast.error('ราคาต้องไม่ติดลบ');
        return;
      }
      cleaned.push({ key, label, price: price.toString() });
    }

    if (cleaned.length === 0) {
      toast.error('ต้องมีอย่างน้อย 1 ประเภทสินค้า');
      return;
    }

    const productLabels: ProductLabels = {};
    const productPricing: ProductPricing = {};
    cleaned.forEach(r => {
      productLabels[r.key] = r.label;
      productPricing[r.key] = parseFloat(r.price) || 0;
    });

    setSaving(true);
    try {
      await setSettings({ ...settings, productLabels, productPricing });
      toast.success('บันทึกประเภทสินค้าเรียบร้อย');
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            จัดการประเภทสินค้า
          </DialogTitle>
          <DialogDescription>
            เพิ่ม / แก้ไข / ลบ ประเภทสินค้า พร้อมตั้งราคา/ตร.ม. เริ่มต้น
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-[1fr_140px_40px] gap-2 px-1 text-xs font-medium text-muted-foreground">
            <Label>ชื่อประเภท</Label>
            <Label>ราคา/ตร.ม. (บาท)</Label>
            <span />
          </div>
          {rows.map((r, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_140px_40px] gap-2 items-center">
              <Input
                value={r.label}
                onChange={e => updateRow(idx, { label: e.target.value })}
                placeholder="เช่น ไวนิล"
              />
              <Input
                type="number"
                min="0"
                step="any"
                value={r.price}
                onChange={e => updateRow(idx, { price: e.target.value })}
                placeholder="0"
              />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => requestDeleteRow(idx)}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                aria-label="ลบ"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <Button variant="outline" size="sm" onClick={addRow} className="w-full">
            <Plus className="h-4 w-4" />
            เพิ่มประเภทใหม่
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            ยกเลิก
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog open={confirmDelete?.open ?? false} onOpenChange={(v) => { if (!v) setConfirmDelete(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>ยืนยันการลบประเภทสินค้า</AlertDialogTitle>
          <AlertDialogDescription>
            ต้องการลบประเภท "{confirmDelete?.label ?? ''}" ใช่หรือไม่? การลบจะมีผลหลังจากกด "บันทึก"
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setConfirmDelete(null)}>ยกเลิก</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); confirmDeleteRow(); }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            ลบ
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

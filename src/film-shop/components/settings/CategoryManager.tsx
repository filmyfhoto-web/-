import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Palette, Save } from 'lucide-react';
import { useProductCategories } from '@/film-shop/hooks/useProductCategories';
import { toast } from 'sonner';

const PASTEL_PRESETS = [
  'hsl(340 70% 92%)', 'hsl(45 80% 90%)', 'hsl(200 70% 90%)',
  'hsl(150 50% 90%)', 'hsl(270 60% 92%)', 'hsl(20 70% 90%)',
  'hsl(180 60% 90%)', 'hsl(0 60% 92%)', 'hsl(90 50% 90%)',
];

function hexToHslPastel(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2 / 255;
  if (max !== min) {
    const d = (max - min) / 255;
    s = l > 0.5 ? d / (2 - 2 * l) : d / (2 * l);
    switch (max) {
      case r: h = ((g - b) / 255) / d + (g < b ? 6 : 0); break;
      case g: h = ((b - r) / 255) / d + 2; break;
      case b: h = ((r - g) / 255) / d + 4; break;
    }
    h *= 60;
  }
  return `hsl(${Math.round(h)} ${Math.round(s * 100)}% 90%)`;
}

export function CategoryManager() {
  const { categories, addCategory, updateCategory, deleteCategory, toggleCategoryEnabled } = useProductCategories();
  const [name, setName] = useState('');
  const [color, setColor] = useState(PASTEL_PRESETS[0]);
  const [editing, setEditing] = useState<Record<string, { name: string; color: string }>>({});

  const handleAdd = async () => {
    if (!name.trim()) { toast.error('กรุณากรอกชื่อหมวด'); return; }
    await addCategory(name, color);
    setName('');
    toast.success('เพิ่มหมวดสินค้าแล้ว');
  };

  const handleSaveEdit = async (key: string) => {
    const patch = editing[key];
    if (!patch) return;
    await updateCategory(key, patch);
    setEditing(prev => { const n = { ...prev }; delete n[key]; return n; });
    toast.success('บันทึกแล้ว');
  };

  const handleDelete = async (key: string, label: string) => {
    if (!confirm(`ลบหมวด "${label}"?\nรายการเก่าที่อ้างอิงหมวดนี้ยังคงอยู่`)) return;
    await deleteCategory(key);
    toast.success('ลบหมวดแล้ว');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="h-5 w-5 text-primary" />
          จัดการหมวดสินค้า
        </CardTitle>
        <CardDescription>
          เพิ่ม/แก้ไข/ลบหมวดหมู่สินค้าสีพาสเทลที่ใช้ใน Dashboard, ใบเสร็จ และคำนวณราคา
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add new */}
        <div className="rounded-lg border border-dashed p-4 space-y-3">
          <p className="text-sm font-medium">เพิ่มหมวดใหม่</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
            <div>
              <Label className="text-xs">ชื่อหมวด</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น โปสเตอร์" />
            </div>
            <div>
              <Label className="text-xs">เลือกสี</Label>
              <input
                type="color"
                className="h-10 w-14 rounded border border-input cursor-pointer block"
                onChange={(e) => setColor(hexToHslPastel(e.target.value))}
              />
            </div>
            <div>
              <Label className="text-xs">ตัวอย่าง</Label>
              <div className="h-10 w-20 rounded border" style={{ background: color }} />
            </div>
            <div className="flex items-end">
              <Button onClick={handleAdd}><Plus className="h-4 w-4" />เพิ่ม</Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {PASTEL_PRESETS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`h-8 w-8 rounded-full border-2 ${color === c ? 'border-primary' : 'border-transparent'}`}
                style={{ background: c }}
                aria-label="preset"
              />
            ))}
          </div>
        </div>

        {/* List */}
        <div className="space-y-2">
          {categories.length === 0 && (
            <p className="text-sm text-muted-foreground">ยังไม่มีหมวดสินค้า</p>
          )}
          {categories.map(cat => {
            const edit = editing[cat.key];
            const isEnabled = cat.enabled !== false;
            return (
              <div
                key={cat.key}
                className={`rounded-lg p-3 border flex items-center gap-3 flex-wrap ${isEnabled ? '' : 'opacity-60'}`}
                style={{ background: edit?.color ?? cat.color }}
              >
                <Input
                  className="bg-background/70 max-w-[220px]"
                  value={edit?.name ?? cat.name}
                  onChange={(e) => setEditing(prev => ({ ...prev, [cat.key]: { name: e.target.value, color: prev[cat.key]?.color ?? cat.color } }))}
                />
                <input
                  type="color"
                  className="h-9 w-12 rounded border border-input cursor-pointer"
                  onChange={(e) => setEditing(prev => ({ ...prev, [cat.key]: { name: prev[cat.key]?.name ?? cat.name, color: hexToHslPastel(e.target.value) } }))}
                />
                <span className="text-xs text-foreground/70">key: {cat.key}</span>
                {!isEnabled && <Badge variant="secondary">ปิดใช้งาน</Badge>}
                <div className="ml-auto flex items-center gap-3">
                  <div className="flex items-center gap-2 px-2 py-1 rounded bg-background/70">
                    <Switch
                      checked={isEnabled}
                      onCheckedChange={(v) => toggleCategoryEnabled(cat.key, v)}
                      aria-label="เปิด/ปิด"
                    />
                    <span className="text-xs">{isEnabled ? 'เปิด' : 'ปิด'}</span>
                  </div>
                  {edit && (
                    <Button size="sm" onClick={() => handleSaveEdit(cat.key)}>
                      <Save className="h-4 w-4" />บันทึก
                    </Button>
                  )}
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(cat.key, cat.name)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

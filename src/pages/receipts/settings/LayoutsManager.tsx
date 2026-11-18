import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Save, Star, StarOff } from "lucide-react";
import { toast } from "sonner";
import {
  useDocLayouts,
  useSaveLayout,
  useDeleteLayout,
  useSetDefaultLayout,
  DEFAULT_MARGINS,
  DEFAULT_LOGO_SCALE,
  DEFAULT_LOGO_ALIGN,
  DEFAULT_PAGE_GAP_MM,
  LOGO_SCALE_MIN,
  LOGO_SCALE_MAX,
  PAGE_GAP_MIN,
  PAGE_GAP_MAX,
  checkLogoCollision,
  type DocLayout,
  type LayoutMargins,
} from "../lib/layouts";
import { AlignLeft, AlignCenter, AlignRight, AlertTriangle } from "lucide-react";

const DOC_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "__all__", label: "ทุกประเภท" },
  { value: "receipt", label: "ใบเสร็จรับเงิน" },
  { value: "delivery", label: "ใบส่งของ" },
  { value: "quotation", label: "ใบเสนอราคา" },
  { value: "tax_invoice", label: "ใบกำกับภาษี" },
  { value: "invoice", label: "ใบแจ้งหนี้" },
];

const BASE_TEMPLATE_OPTIONS = [
  { value: "modern", label: "โมเดิร์น" },
  { value: "classic", label: "คลาสสิก" },
  { value: "compact", label: "กระชับ" },
  { value: "formal", label: "ทางการ" },
];

function blankLayout(storeId: string): Omit<DocLayout, "id" | "created_at" | "updated_at"> {
  return {
    store_id: storeId,
    name: "เลย์เอาต์ใหม่",
    doc_type: null,
    base_template: "modern",
    header_text: "",
    footer_text: "",
    margins: { ...DEFAULT_MARGINS },
    show_logo: true,
    show_tax_id: true,
    show_store_address: true,
    show_document_no: true,
    show_document_date: true,
    accent_color: null,
    is_default: false,
    logo_scale: DEFAULT_LOGO_SCALE,
    logo_align: DEFAULT_LOGO_ALIGN,
    page_gap_mm: DEFAULT_PAGE_GAP_MM,
  };
}

export default function LayoutsManager({ storeId }: { storeId: string }) {
  const layoutsQ = useDocLayouts(storeId);
  const save = useSaveLayout(storeId);
  const del = useDeleteLayout(storeId);
  const setDefault = useSetDefaultLayout(storeId);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const layouts = layoutsQ.data ?? [];
  const selected = useMemo(
    () => layouts.find((l) => l.id === selectedId) ?? layouts[0] ?? null,
    [layouts, selectedId],
  );

  const [draft, setDraft] = useState<Partial<DocLayout> | null>(null);
  useEffect(() => {
    setDraft(selected ? { ...selected } : null);
  }, [selected?.id]);

  function updateDraft(p: Partial<DocLayout>) {
    setDraft((d) => (d ? { ...d, ...p } : d));
  }
  function updateMargin(k: keyof LayoutMargins, v: number) {
    setDraft((d) =>
      d ? { ...d, margins: { ...(d.margins as LayoutMargins), [k]: v } } : d,
    );
  }

  async function createNew() {
    try {
      const id = await save.mutateAsync(blankLayout(storeId) as any);
      setSelectedId(id);
      toast.success("สร้างเลย์เอาต์แล้ว");
    } catch (e: any) {
      toast.error("สร้างไม่สำเร็จ: " + (e?.message ?? ""));
    }
  }

  async function persist() {
    if (!draft?.id) return;
    try {
      await save.mutateAsync(draft as any);
      toast.success("บันทึกเลย์เอาต์แล้ว");
    } catch (e: any) {
      toast.error("บันทึกไม่สำเร็จ: " + (e?.message ?? ""));
    }
  }

  async function remove(id: string) {
    if (!confirm("ลบเลย์เอาต์นี้?")) return;
    try {
      await del.mutateAsync(id);
      if (selectedId === id) setSelectedId(null);
      toast.success("ลบแล้ว");
    } catch (e: any) {
      toast.error("ลบไม่สำเร็จ: " + (e?.message ?? ""));
    }
  }

  async function makeDefault(l: DocLayout) {
    try {
      await setDefault.mutateAsync({ id: l.id, docType: l.doc_type });
      toast.success("ตั้งเป็นค่าเริ่มต้นแล้ว");
    } catch (e: any) {
      toast.error("ตั้งค่าไม่สำเร็จ: " + (e?.message ?? ""));
    }
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">เทมเพลตเอกสาร (เลย์เอาต์ที่แก้ไขได้)</h2>
          <p className="text-xs text-muted-foreground">
            สร้างและปรับเทมเพลตหลายชุดต่อร้าน — หัว/ท้ายกระดาษ, ระยะขอบ, ซ่อน/แสดงองค์ประกอบ, สีเน้น
          </p>
        </div>
        <Button size="sm" onClick={createNew} disabled={save.isPending}>
          <Plus className="h-4 w-4 mr-1.5" /> เพิ่มเลย์เอาต์
        </Button>
      </div>

      {layoutsQ.isLoading ? (
        <p className="text-sm text-muted-foreground">กำลังโหลด…</p>
      ) : layouts.length === 0 ? (
        <p className="text-sm text-muted-foreground">ยังไม่มีเลย์เอาต์ — กด “เพิ่มเลย์เอาต์” เพื่อสร้างชุดแรก</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-[220px,1fr]">
          <ul className="space-y-1">
            {layouts.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(l.id)}
                  className={`w-full text-left rounded-md border px-3 py-2 text-sm hover:bg-muted/60 ${
                    (selected?.id ?? "") === l.id ? "bg-muted border-primary/40" : "border-border"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">{l.name}</span>
                    {l.is_default && (
                      <Badge variant="secondary" className="text-[10px]">default</Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {l.doc_type ? DOC_TYPE_OPTIONS.find((o) => o.value === l.doc_type)?.label ?? l.doc_type : "ทุกประเภท"}
                  </div>
                </button>
              </li>
            ))}
          </ul>

          {draft && selected && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>ชื่อเลย์เอาต์</Label>
                  <Input value={draft.name ?? ""} onChange={(e) => updateDraft({ name: e.target.value })} />
                </div>
                <div>
                  <Label>ใช้กับประเภทเอกสาร</Label>
                  <Select
                    value={draft.doc_type ?? "__all__"}
                    onValueChange={(v) => updateDraft({ doc_type: v === "__all__" ? null : v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DOC_TYPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>เทมเพลตฐาน</Label>
                  <Select
                    value={draft.base_template ?? "modern"}
                    onValueChange={(v) => updateDraft({ base_template: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BASE_TEMPLATE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>สีเน้น (ไม่บังคับ)</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={draft.accent_color ?? "#0f766e"}
                      onChange={(e) => updateDraft({ accent_color: e.target.value })}
                      className="h-9 w-12 rounded border"
                      aria-label="สีเน้น"
                    />
                    <Input
                      value={draft.accent_color ?? ""}
                      placeholder="เช่น #0f766e — ว่างไว้ = ใช้ธีมเดิม"
                      onChange={(e) => updateDraft({ accent_color: e.target.value || null })}
                    />
                  </div>
                </div>
              </div>

              <div>
                <Label>ข้อความหัวกระดาษ</Label>
                <Textarea
                  rows={3}
                  value={draft.header_text ?? ""}
                  onChange={(e) => updateDraft({ header_text: e.target.value })}
                  placeholder="เช่น สโลแกน หรือคำอธิบายสั้น ๆ ใต้ชื่อร้าน"
                />
              </div>
              <div>
                <Label>ข้อความท้ายกระดาษ</Label>
                <Textarea
                  rows={4}
                  value={draft.footer_text ?? ""}
                  onChange={(e) => updateDraft({ footer_text: e.target.value })}
                  placeholder="เช่น เงื่อนไข: ชำระภายใน 30 วัน / ที่อยู่จัดส่ง"
                />
              </div>

              <div>
                <Label>ระยะขอบกระดาษ (มม.)</Label>
                <div className="grid grid-cols-4 gap-2 mt-1">
                  {(["top", "right", "bottom", "left"] as (keyof LayoutMargins)[]).map((k) => (
                    <div key={k}>
                      <span className="text-[11px] text-muted-foreground">{k}</span>
                      <Input
                        type="number"
                        min={0}
                        max={50}
                        step={1}
                        value={(draft.margins as LayoutMargins)?.[k] ?? DEFAULT_MARGINS[k]}
                        onChange={(e) => updateMargin(k, Number(e.target.value) || 0)}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {[
                  ["show_logo", "แสดงโลโก้"],
                  ["show_tax_id", "แสดงเลขผู้เสียภาษี"],
                  ["show_store_address", "แสดงที่อยู่ร้าน"],
                  ["show_document_no", "แสดงเลขที่เอกสาร"],
                  ["show_document_date", "แสดงวันที่เอกสาร"],
                ].map(([k, label]) => (
                  <label key={k} className="flex items-center justify-between gap-2 rounded-md border p-2 text-xs">
                    <span>{label}</span>
                    <Switch
                      checked={(draft as any)[k] !== false}
                      onCheckedChange={(v) => updateDraft({ [k]: v } as any)}
                    />
                  </label>
                ))}
              </div>

              {(() => {
                const scale = Number(draft.logo_scale ?? DEFAULT_LOGO_SCALE);
                const align = (draft.logo_align ?? DEFAULT_LOGO_ALIGN) as "left" | "center" | "right";
                const gap = Number(draft.page_gap_mm ?? DEFAULT_PAGE_GAP_MM);
                const paperW = 210; // A4 preview reference; Letter (216) is close enough
                const collision = checkLogoCollision({
                  paperWidthMm: paperW,
                  margins: draft.margins as LayoutMargins,
                  logoScale: scale,
                });
                return (
                  <div className="rounded-md border p-3 space-y-3">
                    <div className="text-xs font-semibold text-muted-foreground">โลโก้ & ระยะหน้ากระดาษ</div>
                    <div>
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">ขนาดโลโก้</Label>
                        <span className="text-[11px] text-muted-foreground">{Math.round(scale * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={LOGO_SCALE_MIN}
                        max={LOGO_SCALE_MAX}
                        step={0.05}
                        value={scale}
                        onChange={(e) => updateDraft({ logo_scale: Number(e.target.value) })}
                        className="w-full"
                        aria-label="ขนาดโลโก้"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">ตำแหน่งโลโก้</Label>
                      <div className="mt-1 grid grid-cols-3 gap-2">
                        {([
                          { v: "left", label: "ซ้าย", icon: AlignLeft },
                          { v: "center", label: "กลาง", icon: AlignCenter },
                          { v: "right", label: "ขวา", icon: AlignRight },
                        ] as const).map((o) => {
                          const Icon = o.icon;
                          const active = align === o.v;
                          return (
                            <button
                              key={o.v}
                              type="button"
                              onClick={() => updateDraft({ logo_align: o.v })}
                              className={`flex items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-xs ${
                                active ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted/60"
                              }`}
                              aria-pressed={active}
                            >
                              <Icon className="h-3.5 w-3.5" /> {o.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">ระยะระหว่างหน้าเอกสาร (มม.)</Label>
                      <Input
                        type="number"
                        min={PAGE_GAP_MIN}
                        max={PAGE_GAP_MAX}
                        step={1}
                        value={gap}
                        onChange={(e) => updateDraft({ page_gap_mm: Math.min(PAGE_GAP_MAX, Math.max(PAGE_GAP_MIN, Number(e.target.value) || DEFAULT_PAGE_GAP_MM)) })}
                      />
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        ใช้เฉพาะบนหน้าจอ ตอนพิมพ์แต่ละหน้าจะขึ้นหน้ากระดาษใหม่เสมอ (ล็อกคงที่)
                      </p>
                    </div>
                    {collision.risk && (
                      <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900">
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <div>
                          โลโก้อาจชนกับหัวเอกสาร (เหลือพื้นที่ชื่อ ~{collision.availableMm}mm) — ลองลดขนาดโลโก้หรือย่อชื่อร้าน
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="flex flex-wrap gap-2 pt-2">
                <Button onClick={persist} disabled={save.isPending}>
                  <Save className="h-4 w-4 mr-1.5" /> บันทึก
                </Button>
                {selected.is_default ? (
                  <Button variant="outline" disabled>
                    <Star className="h-4 w-4 mr-1.5" /> เป็นค่าเริ่มต้นแล้ว
                  </Button>
                ) : (
                  <Button variant="outline" onClick={() => makeDefault(selected)} disabled={setDefault.isPending}>
                    <StarOff className="h-4 w-4 mr-1.5" /> ตั้งเป็นค่าเริ่มต้น
                  </Button>
                )}
                <Button variant="destructive" onClick={() => remove(selected.id)} disabled={del.isPending}>
                  <Trash2 className="h-4 w-4 mr-1.5" /> ลบ
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
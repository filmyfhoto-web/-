import { ArrowDown, ArrowUp, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  isBundleItemSelected,
  moveBundleItem,
  toggleBundleItem,
  type PrintBundleSelection,
} from "../lib/printPrefs";

export type BundlePickerItem = {
  id: string;
  label: string;
  detail?: string;
  kind: "doc" | "preset" | "upload";
  required?: boolean;
};

export default function BundlePicker({
  items,
  selection,
  onChange,
  onUploadFiles,
  disabled,
}: {
  items: BundlePickerItem[];
  selection: PrintBundleSelection;
  onChange: (next: PrintBundleSelection) => void;
  onUploadFiles?: (files: FileList) => void;
  disabled?: boolean;
}) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const ordered = selection.order.map((id) => byId.get(id)).filter((item): item is BundlePickerItem => !!item);

  return (
    <div className="rounded-md border bg-background p-3 space-y-2" data-testid="bundle-picker">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">ออกเอกสารพร้อมกัน</div>
          <div className="text-[11px] text-muted-foreground">เลือก เปิด/ปิด และจัดลำดับก่อนพรีวิว/พิมพ์/ส่งออก</div>
        </div>
        {onUploadFiles && (
          <Label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-xs hover:bg-muted">
            <FileUp className="h-3.5 w-3.5" /> เพิ่มไฟล์
            <input
              type="file"
              multiple
              accept="image/*,application/pdf"
              className="sr-only"
              disabled={disabled}
              onChange={(e) => {
                if (e.currentTarget.files?.length) onUploadFiles(e.currentTarget.files);
                e.currentTarget.value = "";
              }}
            />
          </Label>
        )}
      </div>

      <div className="space-y-1.5">
        {ordered.map((item, index) => {
          const selected = item.required || isBundleItemSelected(selection, item.id);
          return (
            <div key={item.id} className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1.5">
              <Checkbox
                checked={selected}
                disabled={disabled || item.required}
                onCheckedChange={(checked) => onChange(toggleBundleItem(selection, item.id, !!checked))}
                aria-label={`เลือก ${item.label}`}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{index + 1}. {item.label}</div>
                {item.detail && <div className="truncate text-[11px] text-muted-foreground">{item.detail}</div>}
              </div>
              <span className="rounded border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {item.kind === "doc" ? "เอกสาร" : item.kind === "preset" ? "แนบ" : "ไฟล์"}
              </span>
              <div className="flex gap-0.5">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  disabled={disabled || index === 0}
                  onClick={() => onChange(moveBundleItem(selection, item.id, -1))}
                  aria-label={`เลื่อน ${item.label} ขึ้น`}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  disabled={disabled || index === ordered.length - 1}
                  onClick={() => onChange(moveBundleItem(selection, item.id, 1))}
                  aria-label={`เลื่อน ${item.label} ลง`}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
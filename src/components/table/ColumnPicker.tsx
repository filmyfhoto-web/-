import * as React from "react";
import { Columns3, ArrowUp, ArrowDown, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ColumnDef } from "@/hooks/useColumnPrefs";
import { cn } from "@/lib/utils";

interface Props {
  columns: ColumnDef[];
  isVisible: (id: string) => boolean;
  onToggle: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onReset: () => void;
  hiddenCount?: number;
  className?: string;
}

/**
 * Show / hide and reorder table columns. Sized for touch: full-width rows,
 * 40px targets, and it stays inside the viewport on a 390px phone.
 */
export function ColumnPicker({
  columns,
  isVisible,
  onToggle,
  onMove,
  onReset,
  hiddenCount = 0,
  className,
}: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={cn("h-10 gap-1", className)} aria-label="เลือกคอลัมน์">
          <Columns3 className="h-4 w-4" />
          <span className="hidden sm:inline">คอลัมน์</span>
          {hiddenCount > 0 && <span className="text-xs text-muted-foreground">({hiddenCount})</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="z-50 max-h-[60vh] w-[16rem] overflow-y-auto bg-popover p-1"
      >
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-xs font-semibold text-muted-foreground">แสดง / จัดลำดับคอลัมน์</span>
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={onReset} aria-label="รีเซ็ตคอลัมน์">
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        </div>
        {columns.map((c, i) => (
          <div key={c.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent">
            <Checkbox
              checked={isVisible(c.id)}
              disabled={c.locked}
              onCheckedChange={() => onToggle(c.id)}
              aria-label={c.label}
            />
            <span className="flex-1 truncate text-sm">{c.label}</span>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              disabled={i === 0}
              onClick={() => onMove(c.id, -1)}
              aria-label={`เลื่อน ${c.label} ขึ้น`}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              disabled={i === columns.length - 1}
              onClick={() => onMove(c.id, 1)}
              aria-label={`เลื่อน ${c.label} ลง`}
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default ColumnPicker;
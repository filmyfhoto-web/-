import * as React from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export interface BulkAction {
  label: string;
  onRun: (ids: string[]) => void | Promise<void>;
  icon?: React.ComponentType<{ className?: string }>;
  destructive?: boolean;
  disabled?: boolean;
}

interface Props {
  count: number;
  total: number;
  allSelected: boolean;
  onToggleAll: () => void;
  onClear: () => void;
  actions: BulkAction[];
  selectedIds: string[];
  className?: string;
}

/**
 * Sticky bulk-action bar for tables. Shows how many rows are selected,
 * a select-all checkbox and the available bulk operations (delete, change
 * status, export…). Buttons wrap instead of overflowing on phones.
 */
export function BulkActionBar({
  count,
  total,
  allSelected,
  onToggleAll,
  onClear,
  actions,
  selectedIds,
  className,
}: Props) {
  if (count === 0) return null;
  return (
    <div
      data-bulk-bar=""
      className={cn(
        "sticky top-0 z-20 mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2 shadow-sm",
        className,
      )}
    >
      <label className="flex items-center gap-2 text-sm font-medium">
        <Checkbox
          checked={allSelected}
          onCheckedChange={onToggleAll}
          aria-label={allSelected ? "ยกเลิกเลือกทั้งหมด" : "เลือกทั้งหมด"}
        />
        <span className="tabular-nums">
          เลือก {count.toLocaleString()}/{total.toLocaleString()}
        </span>
      </label>

      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        {actions.map((a) => {
          const Icon = a.icon ?? Check;
          return (
            <Button
              key={a.label}
              size="sm"
              variant={a.destructive ? "destructive" : "outline"}
              disabled={a.disabled}
              onClick={() => a.onRun(selectedIds)}
              className="h-9"
            >
              <Icon className="mr-1 h-4 w-4" />
              {a.label}
            </Button>
          );
        })}
        <Button size="sm" variant="ghost" className="h-9" onClick={onClear} aria-label="ล้างการเลือก">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default BulkActionBar;
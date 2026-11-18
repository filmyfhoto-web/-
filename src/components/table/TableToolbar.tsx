import * as React from "react";
import { Search, ArrowDownUp, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface ToolbarFilter {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}

export interface ToolbarSort {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}

interface Props {
  search: string;
  onSearchChange: (v: string) => void;
  placeholder?: string;
  filters?: ToolbarFilter[];
  sort?: ToolbarSort;
  /** Rendered at the end (e.g. "เพิ่มรายการ" button). */
  actions?: React.ReactNode;
  resultCount?: number;
  className?: string;
}

/**
 * Search + filter + sort bar sized for phones first: full-width search on its
 * own row, filters/sort as a scrollable row of selects, then optional actions.
 */
export function TableToolbar({
  search,
  onSearchChange,
  placeholder = "ค้นหา…",
  filters = [],
  sort,
  actions,
  resultCount,
  className,
}: Props) {
  return (
    <div data-table-toolbar="" className={cn("space-y-2", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="pl-9 pr-9 h-11"
        />
        {search && (
          <Button
            size="icon"
            variant="ghost"
            aria-label="ล้างคำค้นหา"
            onClick={() => onSearchChange("")}
            className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {(filters.length > 0 || sort || actions) && (
        <div className="flex flex-wrap items-center gap-2">
          {filters.map((f) => (
            <Select key={f.id} value={f.value} onValueChange={f.onChange}>
              <SelectTrigger className="h-10 w-full min-w-[9rem] flex-1 sm:w-auto sm:flex-none" aria-label={f.label}>
                <SelectValue placeholder={f.label} />
              </SelectTrigger>
              <SelectContent className="bg-popover z-50">
                {f.options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}

          {sort && (
            <Select value={sort.value} onValueChange={sort.onChange}>
              <SelectTrigger className="h-10 w-full min-w-[9rem] flex-1 sm:w-auto sm:flex-none" aria-label="เรียงลำดับ">
                <ArrowDownUp className="h-4 w-4 mr-1 shrink-0 text-muted-foreground" />
                <SelectValue placeholder="เรียงลำดับ" />
              </SelectTrigger>
              <SelectContent className="bg-popover z-50">
                {sort.options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {actions}
        </div>
      )}

      {typeof resultCount === "number" && (
        <p className="text-xs text-muted-foreground">พบ {resultCount.toLocaleString()} รายการ</p>
      )}
    </div>
  );
}

export default TableToolbar;
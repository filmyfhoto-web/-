import * as React from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface RowAction {
  label: string;
  onSelect: () => void;
  icon?: React.ComponentType<{ className?: string }>;
  destructive?: boolean;
  disabled?: boolean;
  hidden?: boolean;
}

interface Props {
  actions: RowAction[];
  /** Show inline buttons from this breakpoint up. Below it, everything is
   *  collapsed into a single three-dot menu so rows never overflow. */
  inlineFrom?: "md" | "lg" | "never";
  className?: string;
  label?: string;
}

/**
 * Compact per-row actions.
 *
 * Phones get one three-dot menu button (no horizontal overflow, big tap
 * target); tablets/desktops keep the familiar inline icon buttons.
 */
export function RowActions({ actions, inlineFrom = "md", className, label = "การทำงาน" }: Props) {
  const items = actions.filter((a) => !a.hidden);
  if (items.length === 0) return null;

  const inlineClass =
    inlineFrom === "never" ? "hidden" : inlineFrom === "lg" ? "hidden lg:flex" : "hidden md:flex";
  const menuClass = inlineFrom === "never" ? "flex" : inlineFrom === "lg" ? "flex lg:hidden" : "flex md:hidden";

  return (
    <div data-row-actions="" className={cn("items-center justify-end gap-1", className)}>
      <div className={cn(inlineClass, "items-center justify-end gap-1")}>
        {items.map((a) => {
          const Icon = a.icon;
          return (
            <Button
              key={a.label}
              size={Icon ? "icon" : "sm"}
              variant="ghost"
              disabled={a.disabled}
              title={a.label}
              aria-label={a.label}
              onClick={a.onSelect}
              className={cn(Icon && "h-8 w-8", a.destructive && "text-destructive")}
            >
              {Icon ? <Icon className="h-4 w-4" /> : a.label}
            </Button>
          );
        })}
      </div>

      <div className={cn(menuClass, "items-center justify-end")}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-9 w-9" aria-label={label}>
              <MoreHorizontal className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[10rem] bg-popover">
            {items.map((a) => {
              const Icon = a.icon;
              return (
                <DropdownMenuItem
                  key={a.label}
                  disabled={a.disabled}
                  onSelect={(e) => {
                    e.preventDefault();
                    a.onSelect();
                  }}
                  className={cn(a.destructive && "text-destructive focus:text-destructive")}
                >
                  {Icon && <Icon className="mr-2 h-4 w-4" />}
                  {a.label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export default RowActions;
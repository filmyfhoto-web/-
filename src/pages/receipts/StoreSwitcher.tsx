import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowLeftRight, Check, Film, Printer, Receipt, Store } from "lucide-react";
import type { StoreSlug } from "./types";
import { setLastStore, storeEntryPath, STORE_LABEL } from "./lib/lastStore";
import { cn } from "@/lib/utils";

const STORES: Array<{ slug: StoreSlug; icon: React.ComponentType<{ className?: string }> }> = [
  { slug: "colorlab", icon: Receipt },
  { slug: "printing", icon: Printer },
  { slug: "film", icon: Film },
];

interface StoreSwitcherProps {
  current?: StoreSlug | null;
  compact?: boolean;
  className?: string;
}

export function StoreSwitcher({ current, compact, className }: StoreSwitcherProps) {
  const navigate = useNavigate();

  const go = (slug: StoreSlug) => {
    if (slug === current) return;
    setLastStore(slug);
    navigate(storeEntryPath(slug));
  };

  const currentLabel = current ? STORE_LABEL[current] : "เลือกร้าน";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size={compact ? "sm" : "sm"}
          className={cn("rounded-full gap-1.5", className)}
          data-testid="store-switcher-trigger"
        >
          <ArrowLeftRight className="h-3.5 w-3.5" />
          {compact ? currentLabel : `ร้าน: ${currentLabel}`}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          สลับร้าน
        </DropdownMenuLabel>
        {STORES.map(({ slug, icon: Icon }) => (
          <DropdownMenuItem
            key={slug}
            onClick={() => go(slug)}
            className="cursor-pointer"
            data-testid={`store-switcher-${slug}`}
          >
            <Icon className="mr-2 h-4 w-4" />
            <span className="flex-1">{STORE_LABEL[slug]}</span>
            {current === slug && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => navigate("/receipts")}
          className="cursor-pointer"
          data-testid="store-switcher-picker"
        >
          <Store className="mr-2 h-4 w-4" />
          เลือกร้านทั้งหมด…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
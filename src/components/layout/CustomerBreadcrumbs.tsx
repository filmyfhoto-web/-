import { Link } from "react-router-dom";
import { ChevronRight, ShoppingBag, ShoppingCart, ClipboardList, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

type CustomerCrumbKey = "shop" | "cart" | "orders" | "order-detail";

const crumbMeta: Record<CustomerCrumbKey, { label: string; href: string; icon: typeof ShoppingBag }> = {
  shop: { label: "หน้าแรก", href: "/shop", icon: ShoppingBag },
  cart: { label: "ตะกร้า", href: "/cart", icon: ShoppingCart },
  orders: { label: "ประวัติคำสั่งซื้อ", href: "/my-orders", icon: ClipboardList },
  "order-detail": { label: "รายละเอียดคำสั่งซื้อ", href: "#", icon: FileText },
};

const flows: Record<CustomerCrumbKey, CustomerCrumbKey[]> = {
  shop: ["shop"],
  cart: ["shop", "cart"],
  orders: ["shop", "orders"],
  "order-detail": ["shop", "cart", "order-detail"],
};

export function CustomerBreadcrumbs({ current, orderId, className }: { current: CustomerCrumbKey; orderId?: string; className?: string }) {
  const keys = flows[current] ?? flows.shop;

  return (
    <nav aria-label="ตำแหน่งหน้าลูกค้า" className={cn("mb-4", className)}>
      <ol className="flex flex-wrap items-center gap-1.5 text-sm">
        {keys.map((key, index) => {
          const meta = crumbMeta[key] ?? crumbMeta.shop;
          const Icon = meta.icon;
          const isCurrent = key === current;
          const href = key === "order-detail" && orderId ? `/my-orders/${orderId}` : meta.href;

          return (
            <li key={key} className="inline-flex items-center gap-1.5">
              {index > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
              {isCurrent ? (
                <span className="customer-breadcrumb-current" aria-current="page">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {meta.label}
                </span>
              ) : (
                <Link to={href} className="customer-breadcrumb-link">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {meta.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export const customerNavyButtonClass = "customer-navy-action";
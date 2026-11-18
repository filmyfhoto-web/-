import { ReactNode, useEffect, useRef, useState } from "react";
import { liveChannel } from "@/lib/realtimeChannel";
import { NavLink, Navigate, Outlet, useParams, useLocation } from "react-router-dom";
import { useCurrentStore, storeBasePath, useStoreSlug } from "./useStore";
import { STORE_THEME, type StoreSlug } from "./types";
import { LayoutDashboard, ShoppingCart, FileText, FilePlus2, Package, Users, Tag, Settings, ArrowLeftRight, BarChart3, History, Menu, X, ArrowLeft, Calculator, Inbox, FileStack, CloudUpload } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { RealtimePresenceBar } from "@/components/realtime/RealtimePresenceBar";
import { useRealtimeTables } from "@/hooks/useRealtimeTable";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_DOC_THEME, DOC_TYPE_LABEL, allowedDocTypesForStore, getDocLabelForStore, docTypesForTab, visibleTabsForStore } from "./lib/docTheme";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useIncompleteReceiptIds } from "@/lib/incompleteReceipts";
import { tbl, TablePrefixProvider } from "./lib/tbl";
import { StoreSwitcher } from "./StoreSwitcher";
import { setLastStore } from "./lib/lastStore";

const LAST_TAB_KEY = (slug?: string) => `rds_docs_last_tab_${slug ?? "default"}`;

const NAV: Array<{ to: string; label: string; icon: any; filmOnly?: boolean }> = [
  { to: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "documents/new", label: "ออกเอกสาร", icon: FilePlus2 },
  { to: "documents", label: "จัดการเอกสาร", icon: FileText },
  { to: "sync-history", label: "ประวัติสำรอง", icon: CloudUpload },
  { to: "calculator", label: "คำนวณราคา", icon: Calculator, filmOnly: true },
  
  { to: "paper-withdrawals", label: "เบิกกระดาษ", icon: FileStack, filmOnly: true },
  { to: "products", label: "สินค้า", icon: Package },
  { to: "customers", label: "ลูกค้า", icon: Users },
  { to: "categories", label: "หมวดหมู่", icon: Tag },
  { to: "reports", label: "รายงาน", icon: BarChart3 },
  { to: "activity", label: "บันทึกการใช้งาน", icon: History },
  { to: "settings", label: "ตั้งค่าร้าน", icon: Settings },
];

const QUICK_NEW_ALL = [
  { type: "quotation", label: "ใบเสนอราคา" },
  { type: "receipt", label: "ใบเสร็จรับเงิน" },
  { type: "tax_invoice", label: "ใบกำกับภาษี" },
];

// Colorlab merges receipt + tax_invoice into a single combined action.
const QUICK_NEW_COLORLAB = [
  { type: "quotation", label: "ใบเสนอราคา" },
  { type: "receipt", label: "ใบเสร็จรับเงิน/ใบกำกับภาษี" },
];

// Sidebar shortcuts under "จัดการเอกสาร" — filter by document_type.
const DOC_SHORTCUTS_ALL: { type: "all" | "quotation" | "delivery" | "tax_invoice" | "receipt"; label: string }[] = [
  { type: "all", label: "ทั้งหมด" },
  { type: "quotation", label: DOC_TYPE_LABEL.quotation },
  { type: "delivery", label: DOC_TYPE_LABEL.delivery },
  { type: "tax_invoice", label: DOC_TYPE_LABEL.tax_invoice },
  { type: "receipt", label: DOC_TYPE_LABEL.receipt },
];

export default function ReceiptsLayout() {
  const slug = useStoreSlug();
  const prefix = slug === "film" ? "film" : "rds";
  return (
    <TablePrefixProvider value={prefix}>
      <ReceiptsLayoutInner />
    </TablePrefixProvider>
  );
}

function ReceiptsLayoutInner() {
  const storeSlug = useStoreSlug();
  const { store, isLoading } = useCurrentStore();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => { setOpen(false); }, [loc.pathname]);
  useEffect(() => {
    if (store?.name) document.title = `${store.name} · ระบบออกเอกสาร`;
  }, [store?.name]);

  useEffect(() => {
    if (storeSlug === "colorlab" || storeSlug === "printing" || storeSlug === "film") {
      setLastStore(storeSlug);
    }
  }, [storeSlug]);

  // Realtime: invalidate cached queries when any relevant table changes.
  const qc = useQueryClient();
  const debounceRef = useRef<number | null>(null);
  useRealtimeTables(
    [tbl("documents"), tbl("document_items"), tbl("payments"), tbl("products"), tbl("customers"), tbl("activity_logs"), "notifications"],
    () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        qc.invalidateQueries();
      }, 250);
    }
  );

  // Toast on new staff notifications — with deep link to the target.
  useEffect(() => {
    const ch = liveChannel(`rt-notif-${Math.random().toString(36).slice(2, 7)}`)
      .on(
        // @ts-ignore
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload: any) => {
          const n = payload?.new;
          if (!n) return;
          let body = n.body;
          let link: string | null = null;
          let docNo: string | null = null;
          try {
            const parsed = typeof body === "string" && body.startsWith("{") ? JSON.parse(body) : null;
            if (parsed) {
              docNo = parsed.document_no || parsed.doc_no || null;
              const statusLine =
                parsed.new_status
                  ? `สถานะใหม่: ${parsed.new_status}${parsed.old_status ? ` (เดิม: ${parsed.old_status})` : ""}`
                  : "";
              body = parsed.summary || parsed.text ||
                [docNo ? `เอกสาร ${docNo}` : null, parsed.customer_name, statusLine]
                  .filter(Boolean).join(" · ");
              const docId = parsed.document_id || parsed.doc_id;
              const slug = parsed.store_slug || storeSlug;
              if (docId && slug) {
                link = `${storeBasePath(slug)}/documents/${docId}/edit`;
              } else if (parsed.order_id) {
                link = `/admin/home`;
              }
            }
          } catch { /* ignore */ }
          if (!link && n.ref_id && storeSlug && (n.type === "doc_status_change" || n.type === "document_create")) {
            link = `${storeBasePath(storeSlug)}/documents/${n.ref_id}/edit`;
          }
          toast(n.title || "การแจ้งเตือนใหม่", {
            description: body || "",
            duration: 8000,
            action: link
              ? { label: "ไปยังรายการนี้", onClick: () => { window.location.href = link as string; } }
              : undefined,
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [storeSlug]);

  if (!isLoading && !store) return <Navigate to="/receipts" replace />;

  const theme = storeSlug ? STORE_THEME[storeSlug] : null;

  // Per-store document-type policy.
  const allowedTypes = allowedDocTypesForStore(storeSlug);
  // Sidebar shortcuts follow the store's visible-tab set so colorlab shows
  // one combined "ใบเสร็จรับเงิน/ใบกำกับภาษี" shortcut instead of two separate
  // ones. Other stores fall back to the standard order.
  const visible = visibleTabsForStore(storeSlug);
  const DOC_SHORTCUTS: { type: string; label: string }[] = [
    { type: "all", label: "ทั้งหมด" },
    ...visible.map((t) => ({ type: t, label: DOC_TYPE_LABEL[t] ?? t })),
  ];
  const quickNewSource = storeSlug === "colorlab" ? QUICK_NEW_COLORLAB : QUICK_NEW_ALL;
  const QUICK_NEW = quickNewSource
    .filter((q) => (allowedTypes as readonly string[]).includes(q.type as any))
    .map((q) => ({ ...q, label: storeSlug === "colorlab" && q.type === "receipt" ? q.label : getDocLabelForStore(storeSlug, q.type) }));

  // Sidebar document-type counts (realtime via useRealtimeTables invalidation above)
  const countsQ = useQuery({
    queryKey: ["rds_sidebar_doc_counts", store?.id],
    enabled: !!store?.id,
    queryFn: async () => {
      const out: Record<string, number> = {};
      await Promise.all(
        DOC_SHORTCUTS.map(async (s) => {
          let q = supabase
            .from(tbl("documents") as any)
            .select("id", { count: "exact", head: true })
            .eq("store_id", store!.id)
            .is("deleted_at", null);
          if (s.type !== "all") {
            const types = docTypesForTab(storeSlug, s.type);
            if (types.length === 1) q = q.eq("document_type", types[0]);
            else q = q.in("document_type", types);
          }
          const { count } = await q;
          out[s.type] = count ?? 0;
        }),
      );
      return out;
    },
  });

  // Subtract incomplete tax_invoice/receipt so the sidebar badges match the
  // filtered list in DocumentsList.
  const incompleteInfo = useIncompleteReceiptIds(store?.id);
  const adjustedCounts: Record<string, number> = { ...(countsQ.data ?? {}) };
  {
    const incTax = incompleteInfo.countByType["tax_invoice"] ?? 0;
    const incRec = incompleteInfo.countByType["receipt"] ?? 0;
    if (typeof adjustedCounts["tax_invoice"] === "number") {
      adjustedCounts["tax_invoice"] = Math.max(0, adjustedCounts["tax_invoice"] - incTax);
    }
    if (typeof adjustedCounts["receipt"] === "number") adjustedCounts["receipt"] = Math.max(0, adjustedCounts["receipt"] - incRec);
    if (typeof adjustedCounts["receipt_tax"] === "number") {
      adjustedCounts["receipt_tax"] = Math.max(0, adjustedCounts["receipt_tax"] - incTax - incRec);
    }
    if (typeof adjustedCounts["all"] === "number") adjustedCounts["all"] = Math.max(0, adjustedCounts["all"] - incTax - incRec);
  }

  const SideNav = (
    <>
      <NavLink to="/receipts" className="block mb-6">
        <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground">NATTA · RDS</p>
        <p className="font-bold text-foreground mt-0.5 leading-tight">{store?.name ?? "—"}</p>
        {theme && (
          <span className="inline-block mt-2 rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">
            {theme.tag}
          </span>
        )}
      </NavLink>
      <div className="mb-3">
        <StoreSwitcher current={storeSlug ?? null} />
      </div>
      <nav className="space-y-1 flex-1 overflow-y-auto">
        {NAV.filter((n) => !n.filmOnly || storeSlug === "film").map((n) => {
          const Icon = n.icon;
          const link = (
            <NavLink
              key={n.to}
              to={`${storeBasePath(storeSlug)}/${n.to}`}
              end={n.to === "documents"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/60"
                )
              }
            >
              <Icon className="h-4 w-4" />
              {n.label}
            </NavLink>
          );
          if (n.to === "documents") {
            return (
              <div key={n.to}>
                {link}
                <div className="ml-7 mt-1 mb-1 space-y-0.5" data-testid="sidebar-doc-shortcuts">
                  {DOC_SHORTCUTS.map((s) => {
                    const color =
                      s.type === "all"
                        ? "hsl(var(--muted-foreground))"
                        : DEFAULT_DOC_THEME[s.type]?.header || "hsl(var(--muted-foreground))";
                    const count = adjustedCounts[s.type];
                    const to =
                      s.type === "all"
                        ? `${storeBasePath(storeSlug)}/documents`
                        : `${storeBasePath(storeSlug)}/documents?type=${s.type}`;
                    return (
                      <NavLink
                        key={s.type}
                        to={to}
                        className="flex items-center gap-2 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
                        data-testid={`sidebar-doc-shortcut-${s.type}`}
                        onClick={() => {
                          try { sessionStorage.setItem(LAST_TAB_KEY(storeSlug), s.type); } catch { /* noop */ }
                        }}
                      >
                        <span
                          className="inline-block w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: color }}
                          aria-hidden
                        />
                        <span className="flex-1 truncate">{s.label}</span>
                        {typeof count === "number" && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sidebar-accent/60 text-sidebar-foreground/80 tabular-nums">
                                {count}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="text-xs max-w-[220px]">
                              จำนวนเอกสารทั้งหมดในหมวด{s.type === "all" ? "" : `“${s.label}”`} (ไม่รวมที่อยู่ถังขยะ) · อัปเดตเรียลไทม์
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            );
          }
          if (n.to !== "documents/new") return link;
          return (
            <div key={n.to}>
              {link}
              <div className="ml-7 mt-1 mb-1 space-y-0.5">
                {QUICK_NEW.map((q) => (
                  <NavLink
                    key={q.type}
                    to={`${storeBasePath(storeSlug)}/documents/new?type=${q.type}`}
                    className="block rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
                    data-testid={`sidebar-new-${q.type}`}
                  >
                    + {q.label}
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>
      <NavLink
        to="/receipts"
        className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-muted-foreground hover:bg-sidebar-accent/60 mt-2"
      >
        <ArrowLeftRight className="h-3.5 w-3.5" />
        สลับร้าน
      </NavLink>
      <NavLink
        to="/admin/home"
        className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-muted-foreground hover:bg-sidebar-accent/60"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        กลับสู่ระบบหลัก
      </NavLink>
    </>
  );

  return (
    <div className="min-h-screen bg-gradient-soft flex print:block" data-store={storeSlug ?? undefined}>
      <aside className="hidden md:flex w-64 flex-col bg-sidebar border-r border-sidebar-border p-4 print:hidden">
        {SideNav}
      </aside>

      <div className="flex-1 min-w-0">
        {/* Mobile header */}
        <div className="md:hidden flex items-center justify-between bg-card border-b border-border px-4 py-3 print:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button size="icon" variant="ghost"><Menu className="h-5 w-5" /></Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-4 w-72 bg-sidebar flex flex-col">
              {SideNav}
            </SheetContent>
          </Sheet>
          <div className="text-center flex-1">
            <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground">NATTA · RDS</p>
            <p className="font-bold text-foreground text-sm">{store?.name ?? "—"}</p>
          </div>
          <div className="flex items-center gap-1">
            <NavLink to="/admin/home" className="flex items-center gap-1 text-xs text-primary px-2">
              <ArrowLeft className="h-3 w-3" />หลัก
            </NavLink>
            <StoreSwitcher current={storeSlug ?? null} compact />
          </div>
        </div>

        {/* Top action bar + realtime presence (single mount, responsive) */}
        <div className="flex items-center justify-between px-4 md:px-8 pt-3 print:hidden">
          <div className="hidden md:flex items-center gap-2">
            <Button asChild variant="outline" size="sm" className="rounded-full">
              <NavLink to="/admin/home">
                <ArrowLeft className="mr-1 h-3.5 w-3.5" /> กลับสู่หน้าหลัก
              </NavLink>
            </Button>
            <StoreSwitcher current={storeSlug ?? null} />
          </div>
          <RealtimePresenceBar roomKey={`receipts:${storeSlug ?? "all"}`} />
        </div>

        {/* Mobile bottom nav (top 5) */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border grid grid-cols-5 print:hidden safe-bottom">
          {NAV.filter((n) => !n.filmOnly || storeSlug === "film").slice(0, 5).map((n) => {
            const Icon = n.icon;
            return (
              <NavLink
                key={n.to}
                to={`${storeBasePath(storeSlug)}/${n.to}`}
                className={({ isActive }) =>
                  cn(
                    "flex flex-col items-center gap-0.5 py-2 text-[10px]",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {n.label.split(" ")[0]}
              </NavLink>
            );
          })}
        </nav>

        <main className="p-4 md:p-8 pb-24 md:pb-8 print:p-0 min-w-0 max-w-full overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function PagePlaceholder({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">{title}</h1>
      <p className="text-muted-foreground mb-8">หน้านี้จะพร้อมใช้งานในเฟสถัดไป</p>
      <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center text-muted-foreground">
        {children ?? "ระบบกำลังพัฒนา — เร็ว ๆ นี้"}
      </div>
    </div>
  );
}
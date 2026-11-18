import { useEffect, useMemo, useRef, useState } from "react";
import { liveChannel } from "@/lib/realtimeChannel";
import { Navigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentStore, useStoreSlug } from "../useStore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Plus, Minus, Trash2, Printer, ShoppingCart, Search, X } from "lucide-react";
import { defaultsForStore, computeTotals, type DocFormState, type DocItem, newKey } from "../documents/useDocumentForm";
import CustomerPicker from "../documents/CustomerPicker";
import DocumentPreview from "../documents/DocumentPreview";
import { PrePrintSettingsDialog } from "../documents/PrePrintSettingsDialog";
import { bahttext } from "../documents/bahttext";
import { saveDraft, loadDraft, clearDraft, draftHasContent } from "../lib/drafts";
import { useFormGuard } from "@/hooks/useFormGuard";
import { usePaymentMethods } from "../lib/paymentMethods";
import { tbl, rpc } from "../lib/tbl";

interface Product {
  id: string;
  name: string;
  price: number;
  unit: string | null;
  image_url: string | null;
  stock_qty: number | null;
  category_id: string | null;
}

interface CartLine extends DocItem {}

export default function POS() {
  const storeSlug = useStoreSlug();
  const { store, isLoading } = useCurrentStore();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState({ id: null as string | null, name: "", phone: "", address: "", tax_id: "", branch: "" });
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [saving, setSaving] = useState(false);
  const [resultDoc, setResultDoc] = useState<{ docNo: string; state: DocFormState; totals: any } | null>(null);
  const [prePrintOpen, setPrePrintOpen] = useState(false);
  const initializedRef = useRef(false);
  const skipDirtyRef = useRef(true);

  // Restore draft on mount (per store)
  useEffect(() => {
    if (!store?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const payload = await loadDraft(store.id, "pos");
        if (!cancelled && payload && draftHasContent("pos", payload)) {
          skipDirtyRef.current = true;
          if (Array.isArray(payload.cart)) setCart(payload.cart);
          if (payload.customer) setCustomer(payload.customer);
          if (payload.paymentMethod) setPaymentMethod(payload.paymentMethod);
          toast({ title: "กู้คืนตะกร้าที่ค้างไว้แล้ว" });
        }
      } catch { /* noop */ }
      setTimeout(() => { skipDirtyRef.current = false; initializedRef.current = true; }, 0);
    })();
    return () => { cancelled = true; };
  }, [store?.id]);

  // Autosave (debounced)
  useEffect(() => {
    if (!store?.id || !initializedRef.current || skipDirtyRef.current) return;
    const handle = window.setTimeout(async () => {
      const result = await saveDraft(store.id, "pos", { cart, customer, paymentMethod });
      if (!result.synced && result.local) {
        toast({ title: "บันทึกร่างไว้ในเครื่องแล้ว", description: "จะซิงก์ขึ้นระบบเมื่อกลับมาออนไลน์หรือเข้าสู่ระบบ" });
      }
    }, 800);
    return () => window.clearTimeout(handle);
  }, [cart, customer, paymentMethod, store?.id]);

  // beforeunload guard while cart is non-empty
  useFormGuard(cart.length > 0 && !resultDoc);

  const productsQ = useQuery({
    queryKey: ["pos_products", store?.id, search, categoryId],
    enabled: !!store?.id,
    queryFn: async () => {
      let q = supabase
        .from(tbl("products") as any)
        .select("id,name,price,unit,image_url,stock_qty,category_id")
        .eq("store_id", store!.id)
        .eq("is_active", true)
        .order("name")
        .limit(60);
      if (categoryId !== "all") q = q.eq("category_id", categoryId);
      if (search.trim()) q = q.ilike("name", `%${search.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data as any[]) as Product[];
    },
  });

  const catsQ = useQuery({
    queryKey: ["pos_cats", store?.id],
    enabled: !!store?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(tbl("categories") as any)
        .select("id,name")
        .eq("store_id", store!.id)
        .order("name");
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const paymentMethodsQ = usePaymentMethods(store?.id);

  // Realtime: invalidate products on stock change
  useEffect(() => {
    if (!store?.id) return;
    const ch = liveChannel(`pos_${store.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: tbl("products"), filter: `store_id=eq.${store.id}` }, () => {
        qc.invalidateQueries({ queryKey: ["pos_products", store.id] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [store?.id, qc]);

  // Compose form state for totals
  const defaults = defaultsForStore(store);
  const state: DocFormState = useMemo(
    () => ({
      document_type: "receipt",
      paper_size: "80mm",
      document_date: new Date().toISOString().slice(0, 10),
      show_document_date: true,
      vat_mode: (defaults.vat_mode as any) ?? "none",
      vat_rate: (defaults.vat_rate as number) ?? 0,
      price_type: (defaults.price_type as any) ?? "no_vat",
      withholding_tax_enabled: false,
      withholding_tax_rate: 0,
      discount_amount: 0,
      customer_id: customer.id,
      customer_name: customer.name,
      customer_phone: customer.phone,
      customer_address: customer.address,
      customer_tax_id: customer.tax_id,
      customer_branch: customer.branch,
      payment_method: paymentMethod,
      notes: "",
      items: cart,
    }),
    [cart, customer, paymentMethod, store, defaults.vat_mode, defaults.vat_rate, defaults.price_type]
  );
  const totals = computeTotals(state);

  if (isLoading) return <p>กำลังโหลด…</p>;
  if (!store) return <Navigate to="/receipts" replace />;

  function addToCart(p: Product) {
    setCart((c) => {
      const idx = c.findIndex((x) => x.product_id === p.id);
      if (idx >= 0) {
        const max = p.stock_qty;
        if (max !== null && c[idx].quantity >= max) {
          toast({ title: "สินค้าหมด", variant: "destructive" });
          return c;
        }
        return c.map((x, i) => (i === idx ? { ...x, quantity: x.quantity + 1 } : x));
      }
      return [
        ...c,
        {
          key: newKey(),
          product_id: p.id,
          name: p.name,
          description: "",
          price: Number(p.price),
          quantity: 1,
          unit: p.unit ?? "",
          discount_percent: 0,
          discount_amount: 0,
        },
      ];
    });
  }

  const updateLine = (key: string, patch: Partial<CartLine>) =>
    setCart((c) => c.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const removeLine = (key: string) => setCart((c) => c.filter((x) => x.key !== key));

  async function checkout() {
    if (!cart.length) {
      toast({ title: "ตะกร้าว่าง", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data: docNo, error: rpcErr } = await supabase.rpc(tbl("next_doc_no") as any, {
        p_store_id: store!.id,
        p_document_type: "receipt",
      });
      if (rpcErr) throw rpcErr;

      // upsert customer
      let customer_id = customer.id;
      if (!customer_id && customer.name) {
        const { data: c } = await supabase
          .from(tbl("customers") as any)
          .insert({ store_id: store!.id, name: customer.name, phone: customer.phone || null, address: customer.address || null })
          .select("id")
          .single();
        customer_id = (c as any)?.id ?? null;
      }

      const { data: doc, error: de } = await supabase
        .from(tbl("documents") as any)
        .insert({
          store_id: store!.id,
          document_type: "receipt",
          document_no: docNo,
          document_date: state.document_date,
          show_document_date: true,
          paper_size: state.paper_size,
          customer_id,
          customer_name: customer.name,
          customer_phone: customer.phone,
          customer_address: customer.address,
          customer_tax_id: customer.tax_id,
          customer_branch: customer.branch,
          price_type: state.price_type,
          vat_mode: state.vat_mode,
          vat_rate: state.vat_rate,
          discount_amount: 0,
          discount_percent: 0,
          subtotal: totals.subtotal,
          discount_total: 0,
          amount_before_vat: totals.amount_before_vat,
          vat_amount: totals.vat_amount,
          withholding_tax_enabled: false,
          withholding_tax_rate: 0,
          withholding_tax_amount: 0,
          grand_total: totals.grand_total,
          net_total: totals.net_total,
          payment_method: paymentMethod,
          payment_status: "paid",
          status: "issued",
        })
        .select("id")
        .single();
      if (de) throw de;
      const docId = (doc as any).id;

      const itemsPayload = cart.map((it, idx) => ({
        document_id: docId,
        product_id: it.product_id,
        item_order: idx + 1,
        name: it.name,
        description: null,
        price: it.price,
        quantity: it.quantity,
        unit: it.unit || null,
        discount_percent: 0,
        discount_amount: 0,
        line_total: Math.max(0, it.price * it.quantity),
      }));
      const { error: ie } = await supabase.from(tbl("document_items") as any).insert(itemsPayload);
      if (ie) throw ie;

      await supabase.from(tbl("activity_logs") as any).insert({
        store_id: store!.id,
        action: "pos_sale",
        target_type: "document",
        target_id: docId,
        detail: { document_no: docNo, total: totals.net_total },
      });

      setResultDoc({ docNo: docNo as string, state: { ...state }, totals });
      toast({ title: `ออกใบเสร็จ ${docNo} สำเร็จ` });
      // success → clear draft
      try { if (store) await clearDraft(store.id, "pos"); } catch { /* noop */ }
    } catch (e: any) {
      toast({ title: "บันทึกไม่สำเร็จ", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function newSale() {
    setCart([]);
    setCustomer({ id: null, name: "", phone: "", address: "", tax_id: "", branch: "" });
    setResultDoc(null);
    if (store) clearDraft(store.id, "pos").catch(() => {});
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr,420px] gap-4 print:hidden">
      {/* Products */}
      <div className="space-y-3 min-w-0">
        <Card className="p-3 flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input className="pl-10 h-12 text-base" placeholder="ค้นหาสินค้า…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="h-12 w-full sm:w-48"><SelectValue placeholder="หมวดหมู่" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกหมวด</SelectItem>
              {catsQ.data?.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
          {productsQ.data?.map((p) => {
            const stockOut = p.stock_qty !== null && p.stock_qty <= 0;
            const low = p.stock_qty !== null && p.stock_qty > 0 && p.stock_qty <= 5;
            return (
              <button
                key={p.id}
                disabled={stockOut}
                onClick={() => addToCart(p)}
                className="text-left rounded-xl border border-border bg-card hover:bg-accent transition-colors p-3 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name} className="w-full aspect-square object-cover rounded-lg mb-2" />
                ) : (
                  <div className="w-full aspect-square rounded-lg bg-muted flex items-center justify-center text-muted-foreground mb-2">
                    <ShoppingCart className="h-8 w-8" />
                  </div>
                )}
                <div className="text-sm font-medium leading-tight line-clamp-2 min-h-[2.5em]">{p.name}</div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-base font-bold text-primary">฿{Number(p.price).toLocaleString()}</span>
                  {p.stock_qty !== null && (
                    <Badge variant={stockOut ? "destructive" : low ? "secondary" : "outline"} className="text-[10px]">
                      {stockOut ? "หมด" : low ? `เหลือ ${p.stock_qty}` : `${p.stock_qty}`}
                    </Badge>
                  )}
                </div>
              </button>
            );
          })}
          {productsQ.data?.length === 0 && (
            <p className="col-span-full text-center text-muted-foreground py-8">ไม่พบสินค้า</p>
          )}
        </div>
      </div>

      {/* Cart */}
      <Card className="p-4 flex flex-col h-fit lg:sticky lg:top-4 max-h-[calc(100vh-2rem)]">
        <h2 className="font-bold text-lg flex items-center gap-2">
          <ShoppingCart className="h-5 w-5" /> ตะกร้า ({cart.length})
        </h2>

        <div className="flex-1 overflow-y-auto -mx-2 px-2 mt-2 space-y-2 min-h-[120px]">
          {cart.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">ยังไม่มีสินค้า</p>}
          {cart.map((it) => (
            <div key={it.key} className="border border-border rounded-lg p-2">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium flex-1 line-clamp-1">{it.name}</span>
                <Button size="icon" variant="ghost" className="h-6 w-6 -mt-1" onClick={() => removeLine(it.key)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="flex items-center gap-1 mt-1.5">
                <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateLine(it.key, { quantity: Math.max(1, it.quantity - 1) })}>
                  <Minus className="h-3 w-3" />
                </Button>
                <Input
                  type="number"
                  value={it.quantity}
                  onChange={(e) => updateLine(it.key, { quantity: Number(e.target.value) || 1 })}
                  className="h-7 w-14 text-center"
                />
                <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateLine(it.key, { quantity: it.quantity + 1 })}>
                  <Plus className="h-3 w-3" />
                </Button>
                <span className="text-xs text-muted-foreground mx-1">×</span>
                <Input
                  type="number"
                  value={it.price}
                  onChange={(e) => updateLine(it.key, { price: Number(e.target.value) })}
                  className="h-7 flex-1 text-right"
                />
                <span className="text-xs ml-auto tabular-nums font-medium">
                  ฿{(it.price * it.quantity).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 space-y-2 border-t border-border pt-3">
          <div>
            <Label className="text-xs">ลูกค้า (ไม่บังคับ)</Label>
            <CustomerPicker
              storeId={store.id}
              value={customer.name}
              onChange={(v) => setCustomer((c) => ({ ...c, name: v, id: null }))}
              onPick={(c) => setCustomer({ id: c.id, name: c.name, phone: c.phone ?? "", address: c.address ?? "", tax_id: c.tax_id ?? "", branch: c.branch_name ?? "" })}
            />
          </div>
          <div>
            <Label className="text-xs">ชำระเงิน</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger data-testid="pos-payment-method-trigger"><SelectValue /></SelectTrigger>
              <SelectContent>
                {paymentMethodsQ.methods.map((m) => (
                  <SelectItem key={m.code} value={m.code}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <dl className="space-y-1 text-sm pt-2">
            <div className="flex justify-between text-muted-foreground"><dt>ยอดรวม</dt><dd className="tabular-nums">{totals.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</dd></div>
            {state.vat_mode !== "none" && (
              <div className="flex justify-between text-muted-foreground"><dt>VAT {state.vat_rate}%</dt><dd className="tabular-nums">{totals.vat_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</dd></div>
            )}
            <div className="flex justify-between text-xl font-bold border-t border-border pt-2"><dt>สุทธิ</dt><dd className="tabular-nums">฿{totals.net_total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</dd></div>
          </dl>

          <Button size="lg" className="w-full h-14 text-lg" onClick={checkout} disabled={saving || !cart.length}>
            ออกใบเสร็จ
          </Button>
        </div>
      </Card>

      {/* Receipt result */}
      <Dialog open={!!resultDoc} onOpenChange={(o) => !o && newSale()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto bg-muted">
          <DialogHeader><DialogTitle>ใบเสร็จ {resultDoc?.docNo}</DialogTitle></DialogHeader>
          {resultDoc && <DocumentPreview store={store} state={resultDoc.state} totals={resultDoc.totals} docNo={resultDoc.docNo} />}
          <div className="flex gap-2 print:hidden">
            <Button size="lg" className="flex-1 h-14 text-lg" onClick={() => setPrePrintOpen(true)} data-testid="pos-print">
              <Printer className="h-5 w-5 mr-2" /> พิมพ์
            </Button>
            <Button size="lg" variant="outline" className="flex-1 h-14 text-lg" onClick={newSale}>
              ขายใหม่
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {resultDoc && (
        <PrePrintSettingsDialog
          open={prePrintOpen}
          onOpenChange={setPrePrintOpen}
          initial={{ paper: (resultDoc.state.paper_size as any) ?? "80mm" }}
          documentNode={
            <DocumentPreview store={store} state={resultDoc.state} totals={resultDoc.totals} docNo={resultDoc.docNo} />
          }
          onConfirm={async (cfg) => {
            try {
              const { isInIframe, openPrintWindow } = await import("../lib/printWindow");
              const paperSize = cfg.paper === "80mm" ? "80mm 200mm" : cfg.paper;
              const printable = document.querySelector("#doc-print") as HTMLElement | null;
              if (isInIframe()) {
                const w = openPrintWindow({
                  bodyHtml: printable?.outerHTML ?? "",
                  sourceEl: printable ?? undefined,
                  paperSize,
                  orient: cfg.orient,
                  copies: cfg.copies,
                  margins: cfg.margins,
                  headerOnce: cfg.headerOnce,
                  fontScale: cfg.fontScale,
                  fontScope: cfg.fontScope,
                });
                if (!w) {
                  toast({ title: "เบราว์เซอร์บล็อกหน้าต่างพิมพ์", description: "กรุณาอนุญาต popup สำหรับเว็บนี้แล้วลองอีกครั้ง", variant: "destructive" });
                }
              } else {
                for (let i = 0; i < Math.max(1, cfg.copies); i++) {
                  if (i > 0) await new Promise((r) => setTimeout(r, 600));
                  window.print();
                }
              }
            } catch (e: any) {
              toast({ title: "พิมพ์ไม่สำเร็จ", description: e?.message ?? "", variant: "destructive" });
            }
          }}
        />
      )}
    </div>
  );
}
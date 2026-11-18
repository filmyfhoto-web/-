import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Activity, Search, Download, Package, TrendingDown, TrendingUp, AlertTriangle } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { downloadCsv } from "@/lib/csv";
import { Link } from "react-router-dom";
import BillSalesPanel from "./stock/BillSalesPanel";
import type { BillShop } from "./stock/useBillSales";
import { resolveProductShops, useProductShopMap, type ImportShopMap } from "./stock/useProductShopMap";

type Row = {
  id: string;
  created_at: string;
  product_id: string;
  move_type: "in" | "out" | "adjust";
  qty: number;
  reason: string;
  ref_type: string | null;
  reference: string | null;
  note: string | null;
  before_qty: number | null;
  after_qty: number | null;
  products?: {
    name: string;
    unit: string | null;
    product_line: string | null;
    standard_price: number | null;
    code?: string | null;
    barcode?: string | null;
  } | null;
};

/** Shop tabs. colorlab/print also issue bill documents; pos is the walk-in store. */
type Shop = "colorlab" | "print" | "pos";
/** Sub-tab inside each shop. */
type Source = "real" | "bill" | "purchase";

const SHOP_LABEL: Record<Shop, string> = {
  colorlab: "คัลเลอร์แล็ป",
  print: "การพิมพ์",
  pos: "POS ขายหน้าร้าน",
};

const SHOPS: Shop[] = ["colorlab", "print", "pos"];
const hasBill = (s: Shop): s is Shop & BillShop => s === "colorlab" || s === "print";

const REASON_LABEL: Record<string, string> = {
  sell_out: "ขาย POS",
  sell_out_linked: "ขาย (แพ็ค)",
  receive_in: "รับเข้า / PO",
  restock_linked: "แตกแพ็คเข้าสต๊อก",
  cancel_restock: "คืนสต๊อก (ยกเลิก)",
  cancel_restock_linked: "คืนสต๊อก แพ็ค",
  issue_use: "เบิกใช้",
  damaged: "ชำรุด/สูญหาย",
  recount: "ปรับนับสต๊อก",
  other: "อื่นๆ",
};

/**
 * Wording follows the document form toggle: "ซื้อของจริง" deducts stock,
 * "ซื้อบิล" does not. Movements created from a document (ref_type
 * rds_document) are labelled ซื้อของจริง (เอกสาร) so the reference is obvious.
 */
export function reasonLabel(r: Pick<Row, "reason" | "ref_type">): string {
  if (r.ref_type === "rds_document") return "ซื้อของจริง (เอกสาร)";
  return REASON_LABEL[r.reason] || r.reason;
}

function rangeStart(k: string): string | null {
  const d = new Date();
  if (k === "today") { d.setHours(0, 0, 0, 0); return d.toISOString(); }
  if (k === "7d") { d.setDate(d.getDate() - 7); return d.toISOString(); }
  if (k === "30d") { d.setDate(d.getDate() - 30); return d.toISOString(); }
  return null;
}

/** Map a product's product_line onto a shop tab (untagged products land in POS). */
export function shopOfProductLine(line: string | null | undefined): Shop {
  if (line === "colorlab" || line === "print") return line;
  return "pos";
}

/** Shops a movement row belongs to — driven by where the product was imported. */
export function shopsOfRow(r: Row, map: ImportShopMap): Shop[] {
  return resolveProductShops(
    {
      id: r.product_id,
      name: r.products?.name ?? null,
      code: r.products?.code ?? null,
      barcode: r.products?.barcode ?? null,
      product_line: r.products?.product_line ?? null,
    },
    map,
  ).shops;
}

/** Extract the POS/PO document number embedded in reference or note. */
export function extractDocNo(r: Pick<Row, "reference" | "note">): string {
  if (r.reference) return r.reference;
  const m = (r.note || "").match(/\b(POS-[\w-]+|PO\d[\w-]*)/);
  return m ? m[1] : "";
}

function matchesSource(r: Row, src: Source): boolean {
  if (src === "real") {
    return r.move_type === "out" && (
      r.ref_type === "pos_receipt" ||
      r.ref_type === "rds_document" ||
      r.reason === "sell_out" ||
      r.reason === "sell_out_linked" ||
      r.reason === "issue_use"
    );
  }
  if (src === "purchase") {
    return r.move_type === "in" && (r.ref_type === "po_receipt" || r.reason === "receive_in" || r.reason === "restock_linked");
  }
  return false;
}

export default function PosMovements() {
  const [rows, setRows] = useState<Row[]>([]);
  const [range, setRange] = useState("7d");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [shop, setShop] = useState<Shop>("colorlab");
  const [source, setSource] = useState<Source>("real");
  const { map: shopMap } = useProductShopMap();
  // Auto-focus the first shop tab that actually has movements (once per mount)
  const autoPicked = useRef(false);
  const [stockByShop, setStockByShop] = useState<Record<Shop, number>>({ colorlab: 0, print: 0, pos: 0 });
  const [customerByDoc, setCustomerByDoc] = useState<Record<string, string>>({});
  // Warning aggregates surfaced above the tabs so staff know when data is
  // being placed under POS by default or when active SKUs are running low.
  const [untaggedCount, setUntaggedCount] = useState(0);
  const [lowStockItems, setLowStockItems] = useState<Array<{ id: string; name: string; stock: number; low: number }>>([]);

  // Bill sub-tab is only available for colorlab/print.
  useEffect(() => {
    if (source === "bill" && !hasBill(shop)) setSource("real");
  }, [shop, source]);

  // Bill sales are a full historical ledger — default that sub-tab to "all".
  useEffect(() => {
    if (source === "bill" && hasBill(shop)) setRange("all");
  }, [source, shop]);

  async function load() {
    setLoading(true);
    let query = supabase
      .from("stock_movements")
      .select("id, created_at, product_id, move_type, qty, reason, ref_type, reference, note, before_qty, after_qty, products!inner(name, unit, product_line, standard_price, code, barcode)")
      .order("created_at", { ascending: false })
      .limit(1000);
    const s = rangeStart(range);
    if (s) query = query.gte("created_at", s);
    const { data } = await query;
    const list = (data ?? []) as any as Row[];
    setRows(list);
    setLoading(false);

    // Resolve customer names for POS receipts referenced by these movements.
    const docNos = Array.from(new Set(list.map(extractDocNo).filter((n) => n.toUpperCase().startsWith("POS"))));
    if (docNos.length > 0) {
      const { data: receipts } = await supabase
        .from("pos_receipts")
        .select("receipt_number, customer_name")
        .in("receipt_number", docNos);
      const map: Record<string, string> = {};
      for (const r of (receipts ?? []) as Array<{ receipt_number: string; customer_name: string | null }>) {
        map[r.receipt_number] = r.customer_name || "";
      }
      setCustomerByDoc(map);
    } else {
      setCustomerByDoc({});
    }
  }

  async function loadStockSummary() {
    const { data } = await supabase
      .from("products")
      .select("id, name, code, barcode, product_line, stock, low_stock_threshold")
      .eq("active", true);
    const agg: Record<Shop, number> = { colorlab: 0, print: 0, pos: 0 };
    let untagged = 0;
    const low: Array<{ id: string; name: string; stock: number; low: number }> = [];
    for (const p of (data ?? []) as Array<{ id: string; name: string; code: string | null; barcode: string | null; product_line: string | null; stock: number; low_stock_threshold: number | null }>) {
      const res = resolveProductShops(p, shopMap);
      for (const s of res.shops) agg[s] += Number(p.stock) || 0;
      if (res.via === "fallback") untagged += 1;
      const threshold = Number(p.low_stock_threshold ?? 0);
      if (threshold > 0 && Number(p.stock ?? 0) <= threshold) {
        low.push({ id: p.id, name: p.name, stock: Number(p.stock ?? 0), low: threshold });
      }
    }
    setStockByShop(agg);
    setUntaggedCount(untagged);
    setLowStockItems(low.sort((a, b) => a.stock - b.stock));
  }

  useEffect(() => { load(); }, [range]);
  useEffect(() => { loadStockSummary(); }, [shopMap]);

  const docCustomer = (r: Row) => customerByDoc[extractDocNo(r)] || "";

  // Filter: current shop + current source + search
  const filtered = useMemo(
    () => rows.filter((r) => {
      if (!shopsOfRow(r, shopMap).includes(shop)) return false;
      if (!matchesSource(r, source)) return false;
      if (!q) return true;
      const s = q.toLowerCase();
      return (r.products?.name || "").toLowerCase().includes(s) ||
             extractDocNo(r).toLowerCase().includes(s) ||
             docCustomer(r).toLowerCase().includes(s) ||
             (r.note || "").toLowerCase().includes(s);
    }),
    [rows, q, shop, source, customerByDoc, shopMap],
  );

  // Totals for the summary cards (stock movements only — bill sales excluded)
  const shopRows = useMemo(
    () => rows.filter((r) => shopsOfRow(r, shopMap).includes(shop)),
    [rows, shop, shopMap],
  );
  const rowsByShop = useMemo(() => {
    const acc: Record<Shop, number> = { colorlab: 0, print: 0, pos: 0 };
    for (const r of rows) for (const s of shopsOfRow(r, shopMap)) acc[s] += 1;
    return acc;
  }, [rows, shopMap]);
  useEffect(() => {
    if (autoPicked.current || rows.length === 0) return;
    if (rowsByShop[shop] > 0) { autoPicked.current = true; return; }
    const next = SHOPS.find((s) => rowsByShop[s] > 0);
    if (next) { setShop(next); autoPicked.current = true; }
  }, [rowsByShop, rows.length, shop]);
  const totalOut = useMemo(
    () => shopRows.filter((r) => matchesSource(r, "real")).reduce((a, r) => a + Math.abs(Number(r.qty) || 0), 0),
    [shopRows],
  );
  const totalIn = useMemo(
    () => shopRows.filter((r) => matchesSource(r, "purchase")).reduce((a, r) => a + Math.abs(Number(r.qty) || 0), 0),
    [shopRows],
  );

  // Rollup: sum qty & value per product for the currently visible tab (filtered)
  const rollup = useMemo(() => {
    const m = new Map<string, { name: string; unit: string; qty: number; value: number }>();
    for (const r of filtered) {
      const name = r.products?.name || "—";
      const unit = r.products?.unit || "";
      const price = Number(r.products?.standard_price ?? 0) || 0;
      const qty = Math.abs(Number(r.qty) || 0);
      const cur = m.get(r.product_id) || { name, unit, qty: 0, value: 0 };
      cur.qty += qty;
      cur.value += qty * price;
      m.set(r.product_id, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.qty - a.qty);
  }, [filtered]);

  function exportCsv() {
    const out = filtered.map((r) => ({
      "วันที่": new Date(r.created_at).toLocaleString("th-TH"),
      "ร้าน": shopsOfRow(r, shopMap).map((s) => SHOP_LABEL[s]).join(" / "),
      "สินค้า": r.products?.name || "",
      "ประเภท": r.move_type,
      "จำนวน": r.qty,
      "หน่วย": r.products?.unit || "",
      "เหตุผล": reasonLabel(r),
      "ลูกค้า": docCustomer(r),
      "เลขที่เอกสาร": extractDocNo(r),
      "ก่อน": r.before_qty ?? "",
      "หลัง": r.after_qty ?? "",
      "หมายเหตุ": r.note || "",
    }));
    downloadCsv(`stock-movements-${shop}-${source}-${new Date().toISOString().slice(0, 10)}.csv`, out);
  }

  const showBill = source === "bill" && hasBill(shop);

  return (
    <div className="p-3 md:p-5 max-w-[1400px] mx-auto space-y-3">
      <div className="flex items-center gap-2">
        <Activity className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold">ประวัติการเคลื่อนไหวสต๊อก</h2>
      </div>

      {/* Alert banners — untagged products and low-stock items */}
      {(untaggedCount > 0 || lowStockItems.length > 0) && (
        <div className="space-y-2" data-testid="movements-alerts">
          {untaggedCount > 0 && (
            <Card className="p-3 border-amber-300 bg-amber-50 flex items-start gap-3" data-testid="alert-untagged">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1 text-sm">
                <div className="font-semibold text-amber-900">
                  มีสินค้าที่หาแหล่งนำเข้าไม่ได้ {untaggedCount.toLocaleString("th-TH")} รายการ
                </div>
                <div className="text-xs text-amber-800 mt-0.5">
                  ระบบแยกร้านให้อัตโนมัติตามร้านที่นำเข้าสินค้า — รายการที่จับคู่ไม่ได้จะอยู่ในแท็บ "POS ขายหน้าร้าน" (แก้ได้ที่หน้าจัดการสินค้า)
                </div>
              </div>
              <Link to="/admin/products">
                <Button size="sm" variant="outline" className="border-amber-400">ไปกำหนดสายงาน</Button>
              </Link>
            </Card>
          )}
          {lowStockItems.length > 0 && (
            <Card className="p-3 border-rose-300 bg-rose-50 flex items-start gap-3" data-testid="alert-low-stock">
              <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 text-sm">
                <div className="font-semibold text-rose-900">
                  สินค้าใกล้หมด/ต่ำกว่าเกณฑ์ {lowStockItems.length.toLocaleString("th-TH")} รายการ
                </div>
                <div className="text-xs text-rose-800 mt-0.5 line-clamp-2">
                  {lowStockItems.slice(0, 6).map(x => `${x.name} (${x.stock}/${x.low})`).join(" · ")}
                  {lowStockItems.length > 6 && ` …และอีก ${lowStockItems.length - 6} รายการ`}
                </div>
              </div>
              <Link to="/admin/products">
                <Button size="sm" variant="outline" className="border-rose-400">ดูสินค้า</Button>
              </Link>
            </Card>
          )}
        </div>
      )}

      {/* Shop tabs */}
      <Tabs value={shop} onValueChange={(v) => setShop(v as Shop)}>
        <TabsList className="grid grid-cols-3 w-full max-w-2xl">
          {SHOPS.map((s) => (
            <TabsTrigger key={s} value={s} data-testid={`shop-tab-${s}`} className="font-bold">
              {SHOP_LABEL[s]}
              <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5">{rowsByShop[s]}</Badge>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Source sub-tabs */}
      <Tabs value={source} onValueChange={(v) => setSource(v as Source)} className="max-w-full overflow-x-auto">
        <TabsList className="w-max">
          <TabsTrigger value="real" data-testid="src-tab-real" className="font-bold">ซื้อของจริง (หักสต๊อก)</TabsTrigger>
          {hasBill(shop) && (
            <TabsTrigger value="bill" data-testid="src-tab-bill" className="font-bold">ซื้อบิล (ไม่หักสต๊อก)</TabsTrigger>
          )}
          <TabsTrigger value="purchase" data-testid="src-tab-purchase" className="font-bold">รับเข้า (PO)</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Shared filters */}
      <Card className="p-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 flex-1 min-w-56">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input placeholder="ค้นหาสินค้า / เลขที่เอกสาร / ลูกค้า" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="today">วันนี้</SelectItem>
            <SelectItem value="7d">7 วันล่าสุด</SelectItem>
            <SelectItem value="30d">30 วันล่าสุด</SelectItem>
            <SelectItem value="all">ทั้งหมด</SelectItem>
          </SelectContent>
        </Select>
        {!showBill && (
          <Button variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
        )}
      </Card>

      {showBill ? (
        <BillSalesPanel
          shop={shop as BillShop}
          shopLabel={SHOP_LABEL[shop]}
          sinceISO={rangeStart(range)}
          search={q}
        />
      ) : (
        <>
          {/* Document-based ซื้อของจริง list — documents ticked "ซื้อของจริง" */}
          {source === "real" && hasBill(shop) && (
            <BillSalesPanel
              shop={shop as BillShop}
              shopLabel={SHOP_LABEL[shop]}
              sinceISO={rangeStart(range)}
              search={q}
              saleType="real_goods"
            />
          )}
          {/* Stock summary cards — stock movements only, bill sales excluded */}
          <div className="grid gap-2 sm:grid-cols-3" data-testid="stock-summary">
            <Card className="p-3 flex items-center gap-3">
              <Package className="h-6 w-6 text-primary" />
              <div>
                <div className="text-xs text-muted-foreground">สต๊อกจริงคงเหลือ ({SHOP_LABEL[shop]})</div>
                <div className="text-xl font-bold tabular-nums" data-testid={`summary-stock-${shop}`}>
                  {stockByShop[shop].toLocaleString("th-TH")}
                </div>
              </div>
            </Card>
            <Card className="p-3 flex items-center gap-3">
              <TrendingDown className="h-6 w-6 text-rose-500" />
              <div>
                <div className="text-xs text-muted-foreground">รวมซื้อของจริง (ในช่วง)</div>
                <div className="text-xl font-bold tabular-nums text-rose-600" data-testid={`summary-out-${shop}`}>
                  {totalOut.toLocaleString("th-TH")}
                </div>
              </div>
            </Card>
            <Card className="p-3 flex items-center gap-3">
              <TrendingUp className="h-6 w-6 text-emerald-500" />
              <div>
                <div className="text-xs text-muted-foreground">รวมรับเข้า (PO)</div>
                <div className="text-xl font-bold tabular-nums text-emerald-600" data-testid={`summary-in-${shop}`}>
                  {totalIn.toLocaleString("th-TH")}
                </div>
              </div>
            </Card>
          </div>

          {rollup.length > 0 && (
            <Card className="p-3">
              <div className="text-sm font-semibold mb-2">
                {source === "real" ? "รวมสินค้าซื้อของจริง" : "รวมสินค้ารับเข้า"} — {SHOP_LABEL[shop]}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs">
                    <tr>
                      <th className="text-left px-3 py-1.5">สินค้า</th>
                      <th className="text-right px-3 py-1.5">จำนวนรวม</th>
                      <th className="text-right px-3 py-1.5">มูลค่า (บาท)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rollup.map((it, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-1.5">{it.name}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-medium">{it.qty.toLocaleString("th-TH")} {it.unit}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{it.value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <div className="border rounded-md overflow-x-auto bg-card">
            <table className="w-full text-sm" data-testid="real-sales-table">
              <thead className="bg-muted/50 text-xs">
                <tr>
                  <th className="text-left px-3 py-2">วันที่</th>
                  <th className="text-left px-3 py-2">สินค้า</th>
                  <th className="text-center px-3 py-2">ประเภท</th>
                  <th className="text-right px-3 py-2">จำนวน</th>
                  <th className="text-left px-3 py-2">เหตุผล</th>
                  <th className="text-left px-3 py-2">ลูกค้า</th>
                  <th className="text-left px-3 py-2">เลขที่เอกสาร</th>
                  <th className="text-right px-3 py-2">ก่อน → หลัง</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">กำลังโหลด...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-muted-foreground">
                      <div className="space-y-2">
                        <div>ไม่พบรายการในแท็บ "{SHOP_LABEL[shop]}" ({source === "real" ? "ซื้อของจริง" : "รับเข้า (PO)"})</div>
                        {rowsByShop[shop] === 0 && (
                          <Link to="/admin/products" className="inline-block">
                            <Button size="sm" variant="outline">ไปกำหนดสายงานสินค้า</Button>
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : filtered.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-accent/30">
                    <td className="px-3 py-2 text-xs">{new Date(r.created_at).toLocaleString("th-TH")}</td>
                    <td className="px-3 py-2">{r.products?.name || <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-2 text-center">
                      <Badge className={r.move_type === "in" ? "bg-emerald-100 text-emerald-800" : r.move_type === "out" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"}>
                        {r.move_type === "in" ? "เข้า" : r.move_type === "out" ? "ออก" : "ปรับ"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold">
                      {r.move_type === "out" ? "-" : r.move_type === "in" ? "+" : ""}
                      {Number(r.qty)} {r.products?.unit || ""}
                    </td>
                    <td className="px-3 py-2 text-xs">{reasonLabel(r)}</td>
                    <td className="px-3 py-2 text-xs">{docCustomer(r) || "—"}</td>
                    <td className="px-3 py-2 text-xs font-mono">{extractDocNo(r) || "—"}</td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums">
                      {r.before_qty != null ? `${Number(r.before_qty)} → ${Number(r.after_qty ?? 0)}` : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

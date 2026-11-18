/**
 * QA รอบปิดงาน Customer 360 — LINE binding truth, Excel traceability,
 * conversion shape + idempotency, unified history dedupe
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  customerNameColumn, customerNameTable, isBoundLink,
} from "../../supabase/functions/_shared/lineBinding";
import {
  EXCEL_BUCKET, EXCEL_MAX_BYTES, checkExcelFile, excelStoragePath, sanitizeFilename,
} from "@/lib/excelIntake";
import { toPurchaseOrderItems, toRequisitionItems } from "@/lib/customer360/convertItems";
import {
  mergeHistory, normalizeExcelIntake, normalizeOrder, summarizeHistory,
} from "@/lib/customer360/unifiedHistory";
import type { RequisitionItem } from "@/lib/schoolRequisition";
import type { POItem } from "@/pages/purchase-order/lib/parse";

const MIG_DIR = path.resolve(__dirname, "../../supabase/migrations");
const allMigrations = fs.readdirSync(MIG_DIR)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => fs.readFileSync(path.join(MIG_DIR, f), "utf8"))
  .join("\n");

describe("LINE binding server truth", () => {
  it("row ที่ถูก admin unbind แล้วต้องไม่ bound", () => {
    expect(isBoundLink({ line_user_id: "U1", customer_id: null, customer_source: "admin_unbound" })).toBe(false);
  });
  it("ไม่มี row = ไม่ bound", () => {
    expect(isBoundLink(null)).toBe(false);
    expect(isBoundLink(undefined)).toBe(false);
  });
  it("auto-bind (customer_id ว่างแต่ยังไม่ถูกเพิกถอน) ยัง bound ตามโมเดลเดิม", () => {
    expect(isBoundLink({ line_user_id: "U1", customer_id: null, customer_source: null })).toBe(true);
    expect(isBoundLink({ line_user_id: "U1", customer_id: "c1", customer_source: "guest" })).toBe(true);
  });
  it("resolve ชื่อลูกค้าได้ทั้ง rds / guest / profile / admin_manual", () => {
    expect(customerNameTable("rds")).toBe("rds_customers");
    expect(customerNameTable("guest")).toBe("guest_customers");
    expect(customerNameTable("profile")).toBe("profiles");
    expect(customerNameTable("admin_manual")).toBe("profiles");
    expect(customerNameColumn("admin_manual")).toBe("full_name");
    expect(customerNameColumn("rds")).toBe("name");
    expect(customerNameTable("admin_unbound")).toBeNull();
  });
  it("line-link-lookup ใช้ isBoundLink ไม่ใช่แค่ 'มี row'", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../supabase/functions/line-link-lookup/index.ts"), "utf8");
    expect(src).toContain("isBoundLink(data)");
  });
});

describe("Manual bind / unbind migration", () => {
  it("unbind ล้าง profile เฉพาะที่ผูกกับ line_user_id เดียวกัน", () => {
    expect(allMigrations).toContain("WHERE line_user_id = p_line_user_id;");
    expect(allMigrations).toContain("'admin_unbound'");
  });
  it("bind คืน conflict แทนการทับเงียบ ๆ", () => {
    expect(allMigrations).toContain("customer_bound_to_other_line");
    expect(allMigrations).toContain("line_used_by_other_profile");
  });
});

describe("Excel intake — ไฟล์ต้นฉบับ", () => {
  it("บัคเก็ตเป็น private bucket เดิมของลูกค้า", () => {
    expect(EXCEL_BUCKET).toBe("customer-uploads");
    expect(EXCEL_MAX_BYTES).toBe(10 * 1024 * 1024);
  });
  it("sanitize ชื่อไฟล์ กัน path traversal", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("รายการ ปี 2569.xlsx")).toBe("รายการ_ปี_2569.xlsx");
    expect(sanitizeFilename("")).toBe("upload.xlsx");
  });
  it("path ขึ้นต้นด้วย user id เพื่อให้ตรงกับ storage RLS", () => {
    const p = excelStoragePath("u-1", "i-1", "a b.xlsx");
    expect(p).toBe("u-1/excel-intake/i-1/a_b.xlsx");
    expect(p.split("/")[0]).toBe("u-1");
  });
  it("ตรวจนามสกุล/ขนาด/ชนิดไฟล์", () => {
    expect(checkExcelFile({ name: "a.xlsx", size: 10, type: "" }).ok).toBe(true);
    expect(checkExcelFile({ name: "a.pdf", size: 10, type: "application/pdf" }).ok).toBe(false);
    expect(checkExcelFile({ name: "a.xlsx", size: EXCEL_MAX_BYTES + 1, type: "" }).ok).toBe(false);
    expect(checkExcelFile({ name: "a.xlsx", size: 10, type: "application/pdf" }).ok).toBe(false);
  });
  it("มี column เก็บ path ใน DB", () => {
    expect(allMigrations).toContain("ADD COLUMN IF NOT EXISTS storage_path text");
  });
});

describe("Conversion shape (ต้องตรงกับ consumer จริง)", () => {
  const items = [{ order: 1, code: "A1", name: " ปากกา ", unit: "", qty: 0, price: 12.5, total: 0, needsReview: true }];

  it("ใบเขียนเบิกได้ RequisitionItem ครบฟิลด์", () => {
    const [it] = toRequisitionItems(items);
    const typed: RequisitionItem = it;
    expect(typed).toEqual({
      id: "xls_1", code: "A1", name: "ปากกา", unit: "ชิ้น",
      price: 12.5, qty: 1, source: "import", needsReview: true,
    });
  });

  it("ใบสั่งซื้อได้ POItem (quantity/key) ไม่ใช่ qty/order", () => {
    const [it] = toPurchaseOrderItems(items);
    const typed: POItem = it;
    expect(typed).toEqual({ key: "xls_1", name: "ปากกา", quantity: 1, unit: "ชิ้น", price: 12.5 });
    expect("qty" in typed).toBe(false);
  });

  it("RPC ใช้ helper normalize ก่อน insert และ idempotent", () => {
    expect(allMigrations).toContain("public.excel_items_to_requisition(r.items)");
    expect(allMigrations).toContain("public.excel_items_to_po(r.items)");
    expect(allMigrations).toContain("'already', true");
  });
});

describe("Unified history", () => {
  it("ไม่ซ้ำเมื่อ merge แหล่งเดียวกันสองรอบ", () => {
    const o = normalizeOrder({ id: "1", order_no: "SO-1", created_at: "2026-01-02", total: 100, status: "completed" });
    const x = normalizeExcelIntake({ id: "1", filename: "a.xlsx", created_at: "2026-01-03", total: 50, status: "submitted" });
    const merged = mergeHistory([[o, x], [o]]);
    expect(merged).toHaveLength(2);
    expect(merged[0].key).toBe("excel_intake:1");
    expect(summarizeHistory(merged).totalAmount).toBe(150);
  });
  it("deep link ชี้ route ที่มีจริง", () => {
    const app = fs.readFileSync(path.resolve(__dirname, "../App.tsx"), "utf8");
    for (const route of ["/my-orders/:id", "/purchase-order", "/my-account", "/account/excel"]) {
      expect(app).toContain(`path="${route}"`);
    }
  });
});

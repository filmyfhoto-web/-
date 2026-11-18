import { test, expect, type Page } from "@playwright/test";
import { installStagingBackend, newState, seedStaffSession } from "./fixtures/stagingBackend";

/**
 * Revision History page: opening "ดูข้อมูลก่อน-หลัง" must show before/after
 * values for tracked fields (ผู้ขาย / ผู้รับของ / ผู้รับผิดชอบ — all stored
 * on customer_name + signer_receiver) and an items diff (add / remove /
 * modify) that matches the actual edits.
 *
 * We mount RevisionHistory inside a MemoryRouter + QueryClientProvider with
 * the rds_revs / rds_doc_meta query data pre-seeded, so the page renders
 * fixture revisions without touching Supabase.
 */

test.use({
  viewport: { width: 1280, height: 1800 },
  deviceScaleFactor: 1,
  locale: "th-TH",
  timezoneId: "Asia/Bangkok",
});

const DOC_ID = "doc-fixture-1";

const SNAP_BEFORE = {
  state: {
    customer_name: "ร้านขายเก่า",
    signer_receiver: "ผู้รับเก่า",
    customer_address: "addr-old",
    items: [
      { key: "a", name: "สินค้า A", price: 10, quantity: 1, unit: "ชิ้น" },
      { key: "b", name: "สินค้า B", price: 20, quantity: 1, unit: "ชิ้น" },
    ],
  },
};

const SNAP_AFTER = {
  state: {
    customer_name: "ร้านขายใหม่",
    signer_receiver: "ผู้รับใหม่",
    customer_address: "addr-old",
    items: [
      // A modified: price 10 -> 25
      { key: "a", name: "สินค้า A", price: 25, quantity: 1, unit: "ชิ้น" },
      // B removed
      // C added
      { key: "c", name: "สินค้า C", price: 50, quantity: 2, unit: "ชิ้น" },
    ],
  },
};

async function mountRevisionHistory(page: Page) {
  // The page is staff-only, so mount it with a staff session in place.
  await installStagingBackend(page, newState(), { staff: true });
  await seedStaffSession(page);
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.evaluate(async ({ DOC_ID, SNAP_BEFORE, SNAP_AFTER }) => {
    const prev = document.getElementById("rev-host");
    if (prev) prev.remove();
    // Shared module graph with the app (see src/test/testDeps.ts).
    const deps: any = await import("/src/test/testDeps.ts");
    const React = deps.React;
    const RDS = { createRoot: deps.createRoot };
    const { MemoryRouter, Routes, Route, QueryClient, QueryClientProvider } = deps;
    const mod = await import("/src/pages/receipts/documents/RevisionHistory.tsx");
    // The page reads roles from AuthContext, so it must be mounted inside one.
    const { AuthProvider } = deps;

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
    qc.setQueryData(["rds_doc_meta", DOC_ID], {
      document_no: "DO-REV-001",
      document_type: "delivery",
      customer_name: "ร้านขายใหม่",
    });
    qc.setQueryData(["rds_revs", DOC_ID], [
      { id: "r2", action: "document_edit", note: "แก้ผู้ขาย/รายการ", created_at: "2026-06-24T10:00:00Z", actor: "u1", snapshot: SNAP_AFTER },
      { id: "r1", action: "document_create", note: null, created_at: "2026-06-24T09:00:00Z", actor: "u1", snapshot: SNAP_BEFORE },
    ]);

    const host = document.createElement("div");
    host.id = "rev-host";
    host.style.cssText = "position:fixed;left:0;top:0;right:0;bottom:0;background:#fff;z-index:99999;overflow:auto;";
    document.body.appendChild(host);
    const root = (RDS as any).createRoot(host);
    root.render(
      (React as any).createElement(QueryClientProvider, { client: qc },
        (React as any).createElement(AuthProvider, null,
        (React as any).createElement(MemoryRouter, { initialEntries: [`/receipts/printing/documents/${DOC_ID}/revisions`] },
          (React as any).createElement(Routes, null,
            (React as any).createElement(Route, {
              path: "/receipts/:storeSlug/documents/:id/revisions",
              element: (React as any).createElement((mod as any).default),
            }),
          ),
        ),
        ),
      ),
    );
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && !host.textContent?.includes("ดูข้อมูลก่อน-หลัง")) {
      await new Promise((r) => setTimeout(r, 32));
    }
  }, { DOC_ID, SNAP_BEFORE, SNAP_AFTER });
}

test("revision history dialog shows before/after for ผู้ขาย/ผู้รับ + item diff", async ({ page }) => {
  await mountRevisionHistory(page);

  // Timeline rendered both revisions
  await expect(page.locator("#rev-host")).toContainText("document_edit");
  await expect(page.locator("#rev-host")).toContainText("document_create");

  // Open the diff dialog for the latest revision (first button)
  await page.locator("#rev-host button:has-text(\"ดูข้อมูลก่อน-หลัง\")").first().click();

  const dialog = page.locator("[role=dialog]");
  await expect(dialog).toBeVisible();

  // Field diffs — before & after both visible
  await expect(dialog).toContainText("ผู้ขาย/ร้านค้า");
  await expect(dialog).toContainText("ร้านขายเก่า");
  await expect(dialog).toContainText("ร้านขายใหม่");
  await expect(dialog).toContainText("ผู้รับของ/ผู้รับผิดชอบ");
  await expect(dialog).toContainText("ผู้รับเก่า");
  await expect(dialog).toContainText("ผู้รับใหม่");

  // Item diff: added C, removed B, modified A
  await expect(dialog).toContainText("เพิ่ม 1 รายการ");
  await expect(dialog).toContainText("สินค้า C");
  await expect(dialog).toContainText("ลบ 1 รายการ");
  await expect(dialog).toContainText("สินค้า B");
  await expect(dialog).toContainText("แก้ไข 1 รายการ");
  // modified row shows both old (10) and new (25) price for สินค้า A
  const modText = await dialog.textContent();
  expect(modText).toMatch(/สินค้า A.*10/s);
  expect(modText).toMatch(/สินค้า A.*25/s);
});

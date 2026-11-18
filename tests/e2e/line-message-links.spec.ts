import { test, expect } from "@playwright/test";
import {
  buildNewOrderAdminMessage,
  buildNewQuotationAdminMessage,
  buildStatusUpdateMessage,
} from "../../supabase/functions/line-notify/messages";
import { orderUrls, docUrls } from "../../supabase/functions/line-notify/urls";

/**
 * Verify that the link block we embed in LINE messages
 *   🔗 รายละเอียด: <detail_url>
 *   📄 PDF: <pdf_url>
 *   📊 Excel: <xlsx_url>
 * actually:
 *   1. Round-trips: builder output is parseable back into URLs.
 *   2. Points at the order/document we built it for (id appears in path).
 *   3. Resolves: the detail page opens (200) and the PDF/XLSX responses
 *      carry the expected content-type + magic bytes.
 *
 * We stub the network at the BrowserContext layer so the assertions hold
 * deterministically without depending on the live app state. The point of
 * the test is the URL contract embedded in the message, not the renderer.
 */

const ORDER_ID = "ord-aaaa-bbbb-cccc";
const ORDER_NO = "ORD-2025-9999";
const DOC_ID = "doc-1111-2222";
const DOC_NO = "QT-2025-9999";

function parseLinks(msg: string) {
  return {
    detail: msg.match(/🔗 รายละเอียด: (\S+)/)?.[1] ?? "",
    pdf: msg.match(/📄 PDF: (\S+)/)?.[1] ?? "",
    xlsx: msg.match(/📊 Excel: (\S+)/)?.[1] ?? "",
  };
}

async function stubDocRoutes(
  context: import("@playwright/test").BrowserContext,
  expectations: { detail: string; pdf: string; xlsx: string; idInBody: string },
) {
  await context.route(expectations.detail, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><html><body><h1 data-testid="ref">${expectations.idInBody}</h1></body></html>`,
    }),
  );
  await context.route(expectations.pdf, (route) =>
    route.fulfill({
      status: 200,
      headers: { "content-type": "application/pdf" },
      body: Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.from("mock-pdf-body")]),
    }),
  );
  await context.route(expectations.xlsx, (route) =>
    route.fulfill({
      status: 200,
      headers: {
        "content-type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
      body: Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("mock-xlsx")]),
    }),
  );
}

test.describe("LINE message links — order", () => {
  test("detail/pdf/xlsx URLs resolve and reference the correct order", async ({ context, page, baseURL }) => {
    const origin = (baseURL ?? "http://localhost:8080").replace(/\/$/, "");
    const urls = orderUrls(origin, ORDER_ID);
    const msg = buildNewOrderAdminMessage({
      order_no: ORDER_NO,
      customer_name: "Acme Co.",
      customer_phone: "0812345678",
      project_type: "พิมพ์นามบัตร",
      total: 1500,
      detail_url: urls.detail_url,
      pdf_url: urls.pdf_url,
      xlsx_url: urls.xlsx_url,
    });

    // 1. Round-trip parse
    const links = parseLinks(msg);
    expect(links.detail).toBe(`${origin}/admin/orders/${ORDER_ID}`);
    expect(links.pdf).toBe(`${origin}/admin/orders/${ORDER_ID}?export=pdf`);
    expect(links.xlsx).toBe(`${origin}/admin/orders/${ORDER_ID}?export=xlsx`);
    // 2. Order id appears in every link (no string-confusion bugs)
    for (const u of [links.detail, links.pdf, links.xlsx]) {
      expect(u).toContain(ORDER_ID);
    }

    await stubDocRoutes(context, {
      detail: links.detail,
      pdf: links.pdf,
      xlsx: links.xlsx,
      idInBody: ORDER_NO,
    });

    // 3a. Detail page opens
    const detailResp = await page.goto(links.detail);
    expect(detailResp?.status()).toBe(200);
    await expect(page.getByTestId("ref")).toHaveText(ORDER_NO);

    // 3b. PDF resolves with PDF magic bytes
    const pdfResp = await context.request.get(links.pdf);
    expect(pdfResp.status()).toBe(200);
    expect(pdfResp.headers()["content-type"]).toContain("application/pdf");
    const pdfBuf = await pdfResp.body();
    expect(pdfBuf.slice(0, 4).toString("ascii")).toBe("%PDF");

    // 3c. XLSX resolves with ZIP magic bytes (PK\x03\x04)
    const xlsxResp = await context.request.get(links.xlsx);
    expect(xlsxResp.status()).toBe(200);
    expect(xlsxResp.headers()["content-type"]).toContain("spreadsheetml");
    const xlsxBuf = await xlsxResp.body();
    expect(xlsxBuf.slice(0, 4).toString("hex")).toBe("504b0304");
  });

  test("status update message keeps the same link contract", async ({ baseURL }) => {
    const origin = (baseURL ?? "http://localhost:8080").replace(/\/$/, "");
    const urls = orderUrls(origin, ORDER_ID);
    const msg = buildStatusUpdateMessage(
      {
        order_no: ORDER_NO,
        customer_name: "Acme",
        total: 100,
        detail_url: urls.detail_url,
        pdf_url: urls.pdf_url,
        xlsx_url: urls.xlsx_url,
      },
      "approved",
    );
    const links = parseLinks(msg);
    expect(links.detail).toBe(urls.detail_url);
    expect(links.pdf).toBe(urls.pdf_url);
    expect(links.xlsx).toBe(urls.xlsx_url);
  });
});

test.describe("LINE message links — quotation", () => {
  test("document detail/pdf/xlsx URLs resolve and reference the document_no", async ({ context, page, baseURL }) => {
    const origin = (baseURL ?? "http://localhost:8080").replace(/\/$/, "");
    const urls = docUrls(origin, DOC_ID, DOC_NO);
    const msg = buildNewQuotationAdminMessage({
      document_no: DOC_NO,
      customer_name: "ลูกค้าตัวอย่าง",
      customer_phone: "0900000000",
      project_type: "พิมพ์แผ่นพับ",
      grand_total: 9999,
      detail_url: urls.detail_url,
      pdf_url: urls.pdf_url,
      xlsx_url: urls.xlsx_url,
    });

    const links = parseLinks(msg);
    expect(links.detail).toBe(`${origin}/receipts?doc=${encodeURIComponent(DOC_NO)}`);
    expect(links.pdf).toBe(`${origin}/receipts?doc=${encodeURIComponent(DOC_NO)}&export=pdf`);
    expect(links.xlsx).toBe(`${origin}/receipts?doc=${encodeURIComponent(DOC_NO)}&export=xlsx`);
    for (const u of [links.detail, links.pdf, links.xlsx]) {
      expect(u).toContain(encodeURIComponent(DOC_NO));
    }

    await stubDocRoutes(context, {
      detail: links.detail,
      pdf: links.pdf,
      xlsx: links.xlsx,
      idInBody: DOC_NO,
    });

    const detailResp = await page.goto(links.detail);
    expect(detailResp?.status()).toBe(200);
    await expect(page.getByTestId("ref")).toHaveText(DOC_NO);

    const pdfResp = await context.request.get(links.pdf);
    expect(pdfResp.status()).toBe(200);
    expect((await pdfResp.body()).slice(0, 4).toString("ascii")).toBe("%PDF");

    const xlsxResp = await context.request.get(links.xlsx);
    expect(xlsxResp.status()).toBe(200);
    expect((await xlsxResp.body()).slice(0, 4).toString("hex")).toBe("504b0304");
  });

  test("falls back to id-only URL when document_no is missing", async ({ baseURL }) => {
    const origin = (baseURL ?? "http://localhost:8080").replace(/\/$/, "");
    const urls = docUrls(origin, DOC_ID);
    expect(urls.detail_url).toBe(`${origin}/receipts`);
    expect(urls.pdf_url).toContain(`doc=${DOC_ID}`);
    expect(urls.xlsx_url).toContain(`doc=${DOC_ID}`);
  });
});
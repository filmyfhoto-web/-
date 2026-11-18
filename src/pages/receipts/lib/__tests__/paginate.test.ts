import { describe, it, expect } from "vitest";
import {
  paginateMainDocument,
  paginateMainDocumentCached,
  clearPaginationCache,
  getPaginationCacheStats,
  itemToPaginateHints,
  PAPER_MM_BASE,
} from "../paginate";

function items(n: number, descLines = 0) {
  return Array.from({ length: n }).map(() => ({ descLines, nameLen: 20 }));
}

describe("paginateMainDocument", () => {
  it("puts a short list on a single page with trailer", () => {
    const pages = paginateMainDocument({
      paperSize: "A4",
      orient: "portrait",
      marginsMm: { top: 14, right: 12, bottom: 14, left: 12 },
      fontScale: 1,
      items: items(5),
      trailerMm: 72,
    });
    expect(pages).toHaveLength(1);
    expect(pages[0].hasTrailer).toBe(true);
    expect(pages[0].isFirst).toBe(true);
    expect(pages[0].isLast).toBe(true);
    expect(pages[0].count).toBe(5);
  });

  it("splits a long list across multiple pages, trailer only on last", () => {
    const pages = paginateMainDocument({
      paperSize: "A4",
      orient: "portrait",
      marginsMm: { top: 14, right: 12, bottom: 14, left: 12 },
      fontScale: 1,
      items: items(60),
      trailerMm: 72,
    });
    expect(pages.length).toBeGreaterThan(1);
    // Trailer flag lives on exactly one page.
    expect(pages.filter((p) => p.hasTrailer)).toHaveLength(1);
    expect(pages[pages.length - 1].hasTrailer).toBe(true);
    // Sum of counts equals total items.
    expect(pages.reduce((sum, p) => sum + p.count, 0)).toBe(60);
  });

  it("never splits a row: every item is fully on one page", () => {
    const pages = paginateMainDocument({
      paperSize: "A4",
      orient: "portrait",
      marginsMm: { top: 14, right: 12, bottom: 14, left: 12 },
      fontScale: 1,
      items: items(40, 3),
      trailerMm: 72,
    });
    let seen = 0;
    for (const p of pages) {
      expect(p.startIndex).toBe(seen);
      seen += p.count;
    }
    expect(seen).toBe(40);
  });

  it("appends a trailer-only page when items fill the last page", () => {
    // Force a case where items exactly fill the last page — trailer moves to
    // its own page rather than overlapping.
    const pages = paginateMainDocument({
      paperSize: "A5",
      orient: "portrait",
      marginsMm: { top: 5, right: 5, bottom: 5, left: 5 },
      fontScale: 1,
      items: items(200), // huge — guarantees overflow
      trailerMm: 100,
    });
    const last = pages[pages.length - 1];
    expect(last.hasTrailer).toBe(true);
    // Total items still equals input count.
    expect(pages.reduce((s, p) => s + p.count, 0)).toBe(200);
  });

  it("propagates paper + orientation into page dimensions", () => {
    const pages = paginateMainDocument({
      paperSize: "A4",
      orient: "landscape",
      marginsMm: { top: 10, right: 10, bottom: 10, left: 10 },
      fontScale: 1,
      items: items(2),
      trailerMm: 60,
    });
    expect(pages[0].widthMm).toBe(PAPER_MM_BASE.A4.h);
    expect(pages[0].heightMm).toBe(PAPER_MM_BASE.A4.w);
  });

  it("supports custom paper dimensions and orientation", () => {
    const pages = paginateMainDocument({
      paperSize: "custom",
      orient: "landscape",
      customPaper: { widthMm: 210, heightMm: 297 },
      marginsMm: { top: 10, right: 10, bottom: 10, left: 10 },
      fontScale: 1,
      items: items(2),
      trailerMm: 60,
    });
    expect(pages[0].widthMm).toBe(297);
    expect(pages[0].heightMm).toBe(210);
  });

  it("reports moved trailer blocks when they move to a dedicated final page", () => {
    const pages = paginateMainDocument({
      paperSize: "A5",
      orient: "portrait",
      marginsMm: { top: 5, right: 5, bottom: 5, left: 5 },
      fontScale: 1,
      items: items(200),
      trailerMm: 100,
      trailerBlocks: ["notes", "amountWords", "signature"],
    });
    const source = pages[pages.length - 2];
    expect(source.warnings?.map((w) => w.label)).toEqual(["หมายเหตุ", "จำนวนเงินตัวอักษร", "ลายเซ็น/ผู้รับเงิน"]);
    expect(source.warnings?.[0].toPage).toBe(pages.length);
  });

  it("memo cache hits for identical layout keys and misses for layout-changing keys", () => {
    clearPaginationCache();
    const input = {
      paperSize: "A4" as const,
      orient: "portrait" as const,
      marginsMm: { top: 14, right: 12, bottom: 14, left: 12 },
      fontScale: 1,
      items: items(20),
      trailerMm: 72,
    };
    paginateMainDocumentCached(input, { docId: "D1", previewZoom: 1 });
    paginateMainDocumentCached(input, { docId: "D1", previewZoom: 1 });
    expect(getPaginationCacheStats().hits).toBe(1);
    paginateMainDocumentCached({ ...input, fontScale: 1.1 }, { docId: "D1", previewZoom: 1 });
    expect(getPaginationCacheStats().misses).toBe(2);
  });

  it("preview zoom is intentionally excluded by caller keys, so zoom alone can reuse cache", () => {
    clearPaginationCache();
    const input = {
      paperSize: "A4" as const,
      orient: "portrait" as const,
      marginsMm: { top: 14, right: 12, bottom: 14, left: 12 },
      fontScale: 1,
      items: items(20),
      trailerMm: 72,
    };
    paginateMainDocumentCached(input, { docId: "D1" });
    paginateMainDocumentCached(input, { docId: "D1" });
    expect(getPaginationCacheStats().hits).toBe(1);
  });

  it("LRU cache evicts old entries at the configured limit", () => {
    clearPaginationCache();
    for (let i = 0; i < 90; i++) {
      paginateMainDocumentCached({
        paperSize: "A4",
        orient: "portrait",
        marginsMm: { top: 14, right: 12, bottom: 14, left: 12 },
        fontScale: 1,
        items: items(2 + i),
        trailerMm: 72,
      }, { docId: `D${i}` });
    }
    const stats = getPaginationCacheStats();
    expect(stats.size).toBeLessThanOrEqual(stats.limit);
  });

  it("empty item list still yields a single trailer page", () => {
    const pages = paginateMainDocument({
      paperSize: "A4",
      orient: "portrait",
      marginsMm: { top: 14, right: 12, bottom: 14, left: 12 },
      fontScale: 1,
      items: [],
      trailerMm: 60,
    });
    expect(pages).toHaveLength(1);
    expect(pages[0].hasTrailer).toBe(true);
    expect(pages[0].count).toBe(0);
  });

  it("itemToPaginateHints counts description newlines", () => {
    expect(itemToPaginateHints({ name: "A", description: "" }).descLines).toBe(0);
    expect(itemToPaginateHints({ name: "A", description: "one" }).descLines).toBe(1);
    expect(itemToPaginateHints({ name: "A", description: "a\nb\nc" }).descLines).toBe(3);
  });
});
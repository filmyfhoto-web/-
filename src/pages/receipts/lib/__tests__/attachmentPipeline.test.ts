import { describe, it, expect } from "vitest";
import {
  flattenSelectedPages,
  countSelected,
  buildAttachmentPagesHtml,
  type RenderedAttachment,
  type AttachmentRef,
} from "../attachmentRender";

function fakeOk(id: string, pageCount = 1, kind: "image" | "pdf" = "image"): RenderedAttachment {
  return {
    status: "ok",
    ref: { id, name: `${id}.${kind === "pdf" ? "pdf" : "png"}`, path: `x/${id}` },
    kind,
    pages: Array.from({ length: pageCount }, (_, i) => ({
      dataUrl: `data:image/png;base64,${id}-${i}`,
      width: 100,
      height: 100,
    })),
  };
}

function fakeErr(id: string): RenderedAttachment {
  return {
    status: "error",
    ref: { id, name: `${id}.pdf`, path: `x/${id}` },
    error: "boom",
  };
}

describe("attachment print pipeline", () => {
  it("flattens selected attachments in the given order", () => {
    const rendered = [fakeOk("a"), fakeOk("b", 3, "pdf"), fakeOk("c")];
    const flat = flattenSelectedPages(rendered, {
      order: ["b", "a", "c"],
      selected: {},
    });
    // b has 3 pages, a and c have 1 each — 5 rendered pages total.
    expect(flat.length).toBe(5);
    expect(flat.map((p) => p.attId)).toEqual(["b", "b", "b", "a", "c"]);
    expect(flat[0].pageIndex).toBe(0);
    expect(flat[2].pageIndex).toBe(2);
  });

  it("excludes unselected attachments (selected === false)", () => {
    const rendered = [fakeOk("a"), fakeOk("b"), fakeOk("c")];
    const flat = flattenSelectedPages(rendered, {
      order: ["a", "b", "c"],
      selected: { b: false },
    });
    expect(flat.map((p) => p.attId)).toEqual(["a", "c"]);
  });

  it("skips error + unsupported entries silently in the flat list", () => {
    const rendered = [fakeOk("a"), fakeErr("bad"), fakeOk("c")];
    const flat = flattenSelectedPages(rendered, {
      order: ["a", "bad", "c"],
      selected: {},
    });
    expect(flat.map((p) => p.attId)).toEqual(["a", "c"]);
  });

  it("countSelected reflects order + selected keys", () => {
    const atts: Pick<AttachmentRef, "id">[] = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(
      countSelected(atts, { order: ["a", "b", "c"], selected: { b: false } }),
    ).toBe(2);
    expect(countSelected(atts, { order: [], selected: {} })).toBe(3);
  });

  it("buildAttachmentPagesHtml emits one .attachment-page block per rendered page in order", () => {
    const rendered = [fakeOk("a"), fakeOk("b", 2, "pdf")];
    const html = buildAttachmentPagesHtml(rendered, { order: ["b", "a"], selected: {} }, "INV-001");
    const matches = html.match(/class="doc-page attachment-page"/g) ?? [];
    expect(matches.length).toBe(3); // b=2 pages + a=1 page
    // Order: b's pages first, then a's page.
    const firstAttId = html.indexOf('data-att-id="b"');
    const secondAttId = html.indexOf('data-att-id="a"');
    expect(firstAttId).toBeGreaterThan(-1);
    expect(secondAttId).toBeGreaterThan(firstAttId);
    // Reordering must reorder the emitted HTML too — parity requirement 10.
    const html2 = buildAttachmentPagesHtml(rendered, { order: ["a", "b"], selected: {} }, "INV-001");
    expect(html2.indexOf('data-att-id="a"')).toBeLessThan(html2.indexOf('data-att-id="b"'));
  });

  it("buildAttachmentPagesHtml returns empty string when nothing selected", () => {
    const rendered = [fakeOk("a")];
    const html = buildAttachmentPagesHtml(rendered, { order: ["a"], selected: { a: false } }, "INV");
    expect(html).toBe("");
  });
});
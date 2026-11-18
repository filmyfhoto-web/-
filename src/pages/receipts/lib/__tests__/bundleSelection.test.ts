import { describe, it, expect } from "vitest";
import {
  EMPTY_BUNDLE_SELECTION,
  bundleItemKind,
  isBundleItemSelected,
  reconcileBundle,
  toggleBundleItem,
  moveBundleItem,
  flattenBundleOrder,
  type PrintBundleSelection,
} from "../printPrefs";

describe("PrintBundleSelection helpers", () => {
  it("classifies item kinds by id prefix", () => {
    expect(bundleItemKind("doc:main")).toBe("doc");
    expect(bundleItemKind("doc:receipt")).toBe("doc");
    expect(bundleItemKind("att:preset:id_copy")).toBe("att:preset");
    expect(bundleItemKind("att:upload:foo/bar.pdf")).toBe("att:upload");
    expect(bundleItemKind("bogus")).toBe("unknown");
  });

  it("only the main doc is selected by default", () => {
    expect(isBundleItemSelected(EMPTY_BUNDLE_SELECTION, "doc:main")).toBe(true);
    expect(isBundleItemSelected(EMPTY_BUNDLE_SELECTION, "doc:quotation")).toBe(false);
  });

  it("flattenBundleOrder prints only the main doc plus explicitly ticked items", () => {
    const sel: PrintBundleSelection = {
      order: ["doc:main", "doc:quotation", "att:preset:id_copy"],
      selected: { "att:preset:id_copy": true },
    };
    expect(flattenBundleOrder(sel)).toEqual(["doc:main", "att:preset:id_copy"]);
    // even with nothing stored, the main doc alone is printed
    expect(flattenBundleOrder({ order: ["doc:receipt", "doc:delivery"], selected: {} })).toEqual(["doc:main"]);
  });


  it("reconcileBundle preserves prior order and appends new ids", () => {
    const prev: PrintBundleSelection = { order: ["doc:main", "doc:receipt"], selected: {} };
    const next = reconcileBundle(prev, ["doc:receipt", "doc:main", "att:preset:id_copy"]);
    // existing ids keep prior order (main before receipt), new one appended.
    expect(next.order).toEqual(["doc:main", "doc:receipt", "att:preset:id_copy"]);
  });

  it("reconcileBundle drops ids no longer available", () => {
    const prev: PrintBundleSelection = {
      order: ["doc:main", "att:upload:gone.pdf", "doc:receipt"],
      selected: { "att:upload:gone.pdf": false },
    };
    const next = reconcileBundle(prev, ["doc:main", "doc:receipt"]);
    expect(next.order).toEqual(["doc:main", "doc:receipt"]);
    // selected map is preserved even for missing keys so a toggle sticks
    // when the file is re-attached later.
    expect(next.selected["att:upload:gone.pdf"]).toBe(false);
  });

  it("toggleBundleItem flips selection and accepts explicit value", () => {
    const sel = reconcileBundle(undefined, ["doc:main"]);
    const off = toggleBundleItem(sel, "doc:main");
    expect(off.selected["doc:main"]).toBe(false);
    const on = toggleBundleItem(off, "doc:main");
    expect(on.selected["doc:main"]).toBe(true);
    const forced = toggleBundleItem(on, "doc:main", false);
    expect(forced.selected["doc:main"]).toBe(false);
  });

  it("moveBundleItem moves within bounds and no-ops outside", () => {
    const sel: PrintBundleSelection = {
      order: ["a", "b", "c"],
      selected: {},
    };
    expect(moveBundleItem(sel, "a", -1).order).toEqual(["a", "b", "c"]); // clamp
    expect(moveBundleItem(sel, "a", 1).order).toEqual(["b", "a", "c"]);
    expect(moveBundleItem(sel, "c", 1).order).toEqual(["a", "b", "c"]); // clamp
    expect(moveBundleItem(sel, "c", -1).order).toEqual(["a", "c", "b"]);
    expect(moveBundleItem(sel, "missing", 1).order).toEqual(["a", "b", "c"]);
  });

  it("flattenBundleOrder keeps only ticked ids (main always in)", () => {
    const sel: PrintBundleSelection = {
      order: ["doc:main", "doc:receipt", "att:preset:id_copy"],
      selected: { "doc:receipt": false, "att:preset:id_copy": true },
    };
    expect(flattenBundleOrder(sel)).toEqual(["doc:main", "att:preset:id_copy"]);
  });

  it("preserves parity: reorder → flatten reflects new order", () => {
    let sel: PrintBundleSelection = reconcileBundle(undefined, [
      "doc:main",
      "doc:receipt",
      "att:preset:id_copy",
      "att:upload:x/y.pdf",
    ]);
    sel = { ...sel, selected: { "doc:receipt": true, "att:preset:id_copy": true, "att:upload:x/y.pdf": true } };
    sel = moveBundleItem(sel, "att:preset:id_copy", -1);
    sel = moveBundleItem(sel, "att:preset:id_copy", -1);
    // preset now sits before both docs
    expect(flattenBundleOrder(sel)).toEqual([
      "att:preset:id_copy",
      "doc:main",
      "doc:receipt",
      "att:upload:x/y.pdf",
    ]);
  });

});
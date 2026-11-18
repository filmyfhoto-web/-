import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMeasuredHeaderMm, clearMeasuredHeaderMm } from "../paginate";
import { useMeasuredDocHeader } from "../useMeasuredDocHeader";

const PX_PER_MM = 96 / 25.4;

function header(className: string, heightMm: number): HTMLDivElement {
  const node = document.createElement("div");
  node.className = className;
  Object.defineProperty(node, "offsetHeight", { value: heightMm * PX_PER_MM });
  return node;
}

describe("useMeasuredDocHeader", () => {
  beforeEach(() => {
    clearMeasuredHeaderMm();
    document.body.innerHTML = "";
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
    clearMeasuredHeaderMm();
  });

  it("measures the compact continuation header instead of another document's full header", () => {
    const root = document.createElement("div");
    root.id = "doc-print";
    root.append(
      header("doc-header-group", 70),
      header("doc-header-compact", 17),
      header("doc-header-group", 64),
    );
    document.body.append(root);

    const { result, unmount } = renderHook(() => useMeasuredDocHeader([]));

    expect(result.current).toEqual({ full: 70, compact: 17 });
    expect(getMeasuredHeaderMm()).toEqual({ full: 70, compact: 17 });

    act(() => unmount());
    expect(getMeasuredHeaderMm()).toEqual({ full: null, compact: null });
  });
});
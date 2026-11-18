import { describe, it, expect, vi } from "vitest";
import { waitForExportAssets } from "../waitForAssets";

describe("waitForExportAssets", () => {
  it("resolves once every image inside the root has finished loading", async () => {
    const root = document.createElement("div");
    const img = document.createElement("img");
    Object.defineProperty(img, "complete", { value: false, configurable: true });
    root.appendChild(img);
    document.body.appendChild(root);
    const p = waitForExportAssets(root, 500);
    // Fire load asynchronously so the listener path is exercised.
    setTimeout(() => img.dispatchEvent(new Event("load")), 10);
    await expect(p).resolves.toBeUndefined();
    root.remove();
  });

  it("still resolves even when an image errors out (never wedges the export)", async () => {
    const root = document.createElement("div");
    const img = document.createElement("img");
    Object.defineProperty(img, "complete", { value: false, configurable: true });
    root.appendChild(img);
    document.body.appendChild(root);
    const p = waitForExportAssets(root, 500);
    setTimeout(() => img.dispatchEvent(new Event("error")), 10);
    await expect(p).resolves.toBeUndefined();
    root.remove();
  });

  it("honors the timeout when an image never loads", async () => {
    vi.useFakeTimers();
    try {
      const root = document.createElement("div");
      const img = document.createElement("img");
      Object.defineProperty(img, "complete", { value: false, configurable: true });
      root.appendChild(img);
      document.body.appendChild(root);
      const p = waitForExportAssets(root, 50);
      vi.advanceTimersByTime(60);
      await expect(p).resolves.toBeUndefined();
      root.remove();
    } finally {
      vi.useRealTimers();
    }
  });
});
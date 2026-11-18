import { describe, it, expect } from "vitest";
import {
  sanitizeFileSegment,
  buildDocFileName,
  isValidDocFileName,
  assertValidDocFileName,
  decideResync,
} from "./_resync";

describe("sanitizeFileSegment", () => {
  it("keeps Thai school names intact", () => {
    expect(sanitizeFileSegment("โรงเรียนเจดีย์เชียงโคม")).toBe("โรงเรียนเจดีย์เชียงโคม");
  });
  it("strips Drive-forbidden / OS-fragile characters", () => {
    expect(sanitizeFileSegment('a/b\\c:d*e?f"g<h>i|j')).toBe("a b c d e f g h i j");
  });
  it("collapses whitespace and trims", () => {
    expect(sanitizeFileSegment("  โรงเรียน   ทดสอบ  ")).toBe("โรงเรียน ทดสอบ");
  });
  it("removes CR/LF/TAB", () => {
    expect(sanitizeFileSegment("line1\nline2\tend")).toBe("line1 line2 end");
  });
  it("caps length at 120 chars", () => {
    const long = "ก".repeat(500);
    expect(sanitizeFileSegment(long).length).toBe(120);
  });
  it("handles nullish input", () => {
    expect(sanitizeFileSegment(null)).toBe("");
    expect(sanitizeFileSegment(undefined)).toBe("");
  });
});

describe("buildDocFileName", () => {
  it("builds QT-<no>-<school>.pdf when school name present", () => {
    expect(buildDocFileName("QT-2026-0060", "เจดีย์เชียงโคม"))
      .toBe("QT-2026-0060-เจดีย์เชียงโคม.pdf");
  });
  it("omits school segment when empty", () => {
    expect(buildDocFileName("QT-2026-0060", "")).toBe("QT-2026-0060.pdf");
    expect(buildDocFileName("QT-2026-0060", null)).toBe("QT-2026-0060.pdf");
  });
  it("sanitizes school name inside the filename", () => {
    expect(buildDocFileName("DN-2026-0001", "a/b:c")).toBe("DN-2026-0001-a b c.pdf");
  });
});

describe("isValidDocFileName / assertValidDocFileName", () => {
  it("accepts valid formats for all doc types", () => {
    expect(isValidDocFileName("QT-2026-0060-เจดีย์เชียงโคม.pdf")).toBe(true);
    expect(isValidDocFileName("DN-2026-0001-โรงเรียน ทดสอบ.pdf")).toBe(true);
    expect(isValidDocFileName("RC-2026-0001.pdf")).toBe(true);
  });
  it("rejects names containing Drive-forbidden characters", () => {
    expect(isValidDocFileName("QT-2026/0001-school.pdf")).toBe(false);
    expect(isValidDocFileName("QT-2026-0001-a\\b.pdf")).toBe(false);
    expect(isValidDocFileName("QT-2026-0001-a:b.pdf")).toBe(false);
  });
  it("rejects wrong prefix or missing .pdf", () => {
    expect(isValidDocFileName("quotation-2026-0001.pdf")).toBe(false);
    expect(isValidDocFileName("QT-2026-0001.docx")).toBe(false);
  });
  it("assertValidDocFileName throws for invalid names", () => {
    expect(() => assertValidDocFileName("QT-2026-0001-a/b.pdf")).toThrow(/invalid drive file name/);
  });
  it("guarantees buildDocFileName output is always valid", () => {
    const name = buildDocFileName("QT-2026-0060", "โรงเรียน/ทดสอบ*?");
    expect(isValidDocFileName(name)).toBe(true);
  });
});

describe("decideResync — resync_move decision", () => {
  const targetFolderId = "folder-QT";
  const targetName = "QT-2026-0060-เจดีย์เชียงโคม.pdf";

  it("skipped: no current file and nothing at destination", () => {
    expect(decideResync({ current: null, existing: null, targetFolderId, targetName }))
      .toEqual({ action: "skipped" });
  });

  it("adopted: current file lost, destination has one — adopt it, no trash", () => {
    const d = decideResync({
      current: null,
      existing: { id: "dest-1", webViewLink: "https://drive/dest-1" },
      targetFolderId, targetName,
    });
    expect(d.action).toBe("adopted");
    if (d.action !== "adopted") throw new Error("narrow");
    expect(d.keepFileId).toBe("dest-1");
    expect(d.trashFileId).toBeUndefined();
  });

  it("unchanged: current file already in right folder with right name", () => {
    const d = decideResync({
      current: { id: "cur-1", name: targetName, parents: [targetFolderId] },
      existing: null,
      targetFolderId, targetName,
    });
    expect(d.action).toBe("unchanged");
  });

  it("renamed: current in right folder but with legacy name", () => {
    const d = decideResync({
      current: { id: "cur-1", name: "old-legacy-name.pdf", parents: [targetFolderId] },
      existing: null,
      targetFolderId, targetName,
    });
    expect(d.action).toBe("renamed");
  });

  it("moved: current in wrong folder — must be moved into destination", () => {
    const d = decideResync({
      current: { id: "cur-1", name: "QT-2026-0060.pdf", parents: ["old-nested-folder"] },
      existing: null,
      targetFolderId, targetName,
    });
    expect(d.action).toBe("moved");
  });

  it("adopted+trash: destination already has a file with the target name → adopt existing, trash stray", () => {
    const d = decideResync({
      current: { id: "stray-cur", name: "QT-2026-0060.pdf", parents: ["old-folder"] },
      existing: { id: "dest-keep", webViewLink: "https://drive/dest-keep" },
      targetFolderId, targetName,
    });
    expect(d.action).toBe("adopted");
    if (d.action !== "adopted") throw new Error("narrow");
    expect(d.keepFileId).toBe("dest-keep");
    expect(d.trashFileId).toBe("stray-cur");
    expect(d.keepUrl).toBe("https://drive/dest-keep");
  });

  it("does NOT self-trash when existing is the same file as current", () => {
    const d = decideResync({
      current: { id: "same-id", name: "legacy.pdf", parents: [targetFolderId] },
      existing: { id: "same-id" },
      targetFolderId, targetName,
    });
    // same file, wrong name → rename (never adopt/trash itself)
    expect(d.action).toBe("renamed");
  });
});
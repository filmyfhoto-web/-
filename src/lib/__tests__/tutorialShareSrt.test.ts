import { describe, expect, it } from "vitest";
import { withUtm, tutorialShareLink, TUTORIAL_SHARE_CHANNELS } from "@/lib/tutorialShare";
import { parseSrt, fmtClock } from "@/lib/srt";

describe("tutorial share links", () => {
  it("attaches utm parameters without dropping existing query/hash", () => {
    const url = withUtm("https://x.test/?tutorial=how-to-shop&t=5#tutorial", { source: "line", campaign: "tutorial" });
    expect(url).toContain("tutorial=how-to-shop");
    expect(url).toContain("utm_source=line");
    expect(url).toContain("utm_medium=share");
    expect(url).toContain("utm_campaign=tutorial");
    expect(url.endsWith("#tutorial")).toBe(true);
  });

  it("builds one link per channel", () => {
    for (const ch of TUTORIAL_SHARE_CHANNELS) {
      expect(tutorialShareLink("how-to-shop", ch)).toContain(`utm_source=${ch.source}`);
    }
    expect(TUTORIAL_SHARE_CHANNELS.map((c) => c.id)).toContain("device");
  });
});

describe("srt preview", () => {
  it("parses cues with timings", () => {
    const cues = parseSrt("1\n00:00:01,000 --> 00:00:03,500\nสวัสดีค่ะ\n\n2\n00:01:05,000 --> 00:01:07,000\nกดเพิ่มลงตะกร้า\n");
    expect(cues).toHaveLength(2);
    expect(cues[0].start).toBe(1);
    expect(cues[0].end).toBe(3.5);
    expect(cues[1].text).toBe("กดเพิ่มลงตะกร้า");
    expect(fmtClock(cues[1].start)).toBe("1:05");
  });
});

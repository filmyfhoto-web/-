// The every-minute Drive cron used to answer 401 because it presented no
// credential at all. It now uses the same worker-token mechanism as
// notify-dispatch; this locks that contract in.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(dir, "../order-drive-upload/index.ts"), "utf8");

describe("order-drive-upload cron auth", () => {
  it("accepts the internal worker token for process_pending", () => {
    expect(src).toContain("hasWorkerToken");
    expect(src).toContain('.eq("name", "order_drive_upload")');
    expect(src).toContain("const workerOk = await hasWorkerToken(admin, req);");
  });

  it("still falls back to CRON_SECRET and staff-only session auth", () => {
    expect(src).toContain("CRON_SECRET");
    expect(src).toContain('code: "forbidden", error: "staff only"');
  });

  it("compares the token without early exit and never hardcodes a key", () => {
    expect(src).toContain("diff |= expected.charCodeAt(i) ^ presented.charCodeAt(i)");
    expect(src).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
  });

  it("allows the x-worker-token header through CORS", () => {
    expect(src).toContain("x-worker-token");
  });
});

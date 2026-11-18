// The provider adapter is the ONLY place allowed to call the LINE push API,
// and it must behave correctly for the duplicate-message edge cases.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { pushLineText, toLineRetryKey } from "../_shared/linePush.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const fnRoot = path.join(here, "..");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const res = (status: number, headers: Record<string, string> = {}) =>
  new Response(status === 204 ? null : "{}", { status, headers });

describe("LINE provider adapter", () => {
  it("is the single source of the LINE message API URL", () => {
    const offenders = walk(fnRoot)
      .filter((p) => p.endsWith(".ts"))
      .filter((p) => !p.endsWith("_shared/linePush.ts") && !p.includes(`${path.sep}tests${path.sep}`))
      .filter((p) => readFileSync(p, "utf8").includes("api.line.me/v2/bot/message"));
    expect(offenders).toEqual([]);
  });

  it("sends the same X-Line-Retry-Key on every attempt of a row", async () => {
    const seen: string[] = [];
    const fake: typeof fetch = async (_u, init) => {
      seen.push((init?.headers as Record<string, string>)["X-Line-Retry-Key"]);
      return res(200);
    };
    await pushLineText("t", "U1", "hi", "row-1", fake);
    await pushLineText("t", "U1", "hi", "row-1", fake);
    expect(seen[0]).toBe(seen[1]);
  });

  it("always sends a UUID retry key — LINE rejects any other shape with 400", async () => {
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(toLineRetryKey("conv-123:msg-9")).toMatch(uuidRe);
    // A key that already is a UUID is passed through unchanged.
    const u = "b10e99ee-cbc7-434c-b58d-7d4c46661487";
    expect(toLineRetryKey(u)).toBe(u);
    expect(toLineRetryKey("")).toBeNull();
  });

  it("treats provider 409 as delivered-once, not as a failure", async () => {
    const r = await pushLineText("t", "U1", "hi", "row-1", async () => res(409));
    expect(r.ok).toBe(true);
    expect(r.deduplicated).toBe(true);
  });

  it("marks 4xx permanent and 429/5xx retryable", async () => {
    expect((await pushLineText("t", "U1", "hi", "k", async () => res(400))).permanent).toBe(true);
    expect((await pushLineText("t", "U1", "hi", "k", async () => res(429))).permanent).toBe(false);
    expect((await pushLineText("t", "U1", "hi", "k", async () => res(500))).permanent).toBe(false);
  });

  it("treats a network timeout as retryable (message may have been delivered)", async () => {
    const r = await pushLineText("t", "U1", "hi", "k", async () => { throw new Error("aborted"); });
    expect(r.ok).toBe(false);
    expect(r.permanent).toBe(false);
  });

  it("refuses to send without a token or recipient", async () => {
    expect((await pushLineText("", "U1", "hi", "k")).ok).toBe(false);
    expect((await pushLineText("t", "", "hi", "k")).ok).toBe(false);
  });
});

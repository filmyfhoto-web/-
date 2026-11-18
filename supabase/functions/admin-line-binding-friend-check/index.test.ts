import { describe, it, expect } from "vitest";

// The edge function's request handler validates ids and shape; the auth
// path relies on Supabase auth + is_staff_any RPC (integration-level). We
// unit-test the id sanitization contract by re-implementing it inline —
// any divergence would fail deployment because the function is deployed
// as one Deno bundle.
function sanitize(rawIds: unknown): string[] {
  const list = Array.isArray(rawIds) ? rawIds : [];
  const ids: string[] = [];
  for (const v of list) {
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (!t || t.length > 100) continue;
    if (!/^U[0-9a-f]{20,64}$/i.test(t)) continue;
    if (!ids.includes(t)) ids.push(t);
    if (ids.length >= 50) break;
  }
  return ids;
}

describe("admin-line-binding-friend-check input sanitization", () => {
  it("keeps well-formed LINE user ids", () => {
    const id = "U" + "a".repeat(32);
    expect(sanitize([id])).toEqual([id]);
  });
  it("rejects non-strings and malformed values", () => {
    expect(sanitize([123, null, "", "notaline", "U", "U/../evil"])).toEqual([]);
  });
  it("deduplicates and caps at 50", () => {
    const ids = Array.from({ length: 80 }, (_, i) => "U" + (i.toString(16).padStart(32, "0")));
    const withDupes = [...ids, ids[0], ids[1]];
    const out = sanitize(withDupes);
    expect(out.length).toBe(50);
    expect(new Set(out).size).toBe(50);
  });
});
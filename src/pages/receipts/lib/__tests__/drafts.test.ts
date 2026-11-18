import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    from: vi.fn(() => ({
      upsert: vi.fn().mockResolvedValue({ error: null }),
      select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null }) }) }) }) }),
      delete: () => ({ eq: () => ({ eq: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }) }) }),
    })),
  },
}));

import { saveDraft, loadDraft, clearDraft, draftHasContent } from "../drafts";

describe("drafts (localStorage fallback)", () => {
  beforeEach(() => localStorage.clear());

  it("saveDraft + loadDraft round-trip via localStorage when not signed in", async () => {
    const result = await saveDraft("store-1", "document", { state: { customer_name: "ACME", items: [] } });
    expect(result).toEqual({ local: true, synced: false, reason: "signed_out" });
    const got = await loadDraft("store-1", "document");
    expect(got?.state?.customer_name).toBe("ACME");
  });

  it("clearDraft removes localStorage entry", async () => {
    await saveDraft("store-1", "pos", { cart: [{ name: "X" }] });
    await clearDraft("store-1", "pos");
    const got = await loadDraft("store-1", "pos");
    expect(got).toBeNull();
  });

  it("draftHasContent detects meaningful POS cart", () => {
    expect(draftHasContent("pos", { cart: [] })).toBe(false);
    expect(draftHasContent("pos", { cart: [{ name: "A" }] })).toBe(true);
  });

  it("draftHasContent detects meaningful document fields", () => {
    expect(draftHasContent("document", { state: { items: [], customer_name: "" } })).toBe(false);
    expect(draftHasContent("document", { state: { items: [{ name: "Foo", price: 10 }], customer_name: "" } })).toBe(true);
    expect(draftHasContent("document", { state: { items: [], customer_name: "X" } })).toBe(true);
  });

  it("draftHasContent detects import draft (text or preview rows)", () => {
    expect(draftHasContent("import", { text: "", preview: [] })).toBe(false);
    expect(draftHasContent("import", { text: "name\tprice", preview: [] })).toBe(true);
    expect(draftHasContent("import", { text: "", preview: [{ name: "A" }] })).toBe(true);
  });

  it("draftHasContent treats any non-empty settings object as content", () => {
    expect(draftHasContent("settings", {})).toBe(false);
    expect(draftHasContent("settings", { name: "shop" })).toBe(true);
  });

  it("save/load works for settings + import kinds via localStorage fallback", async () => {
    await saveDraft("store-2", "settings", { name: "ACME", vat_enabled: true });
    await saveDraft("store-2", "import", { text: "x", preview: [{ name: "y" }] });
    expect((await loadDraft("store-2", "settings"))?.name).toBe("ACME");
    expect((await loadDraft("store-2", "import"))?.preview?.[0]?.name).toBe("y");
    await clearDraft("store-2", "settings");
    await clearDraft("store-2", "import");
    expect(await loadDraft("store-2", "settings")).toBeNull();
    expect(await loadDraft("store-2", "import")).toBeNull();
  });
});
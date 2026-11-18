import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Contract test: category CRUD is admin-only.
 *
 * The anon Data API key must NOT be able to insert / update / delete /
 * mutate category rows, because RLS scopes writes to `is_staff(auth.uid())`.
 * If a future migration accidentally opens up categories to anon writes,
 * this test fails immediately.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

test.describe("Categories authz — anon Data API cannot mutate", () => {
  test.skip(!SUPABASE_URL || !ANON_KEY, "Supabase env vars not present in this build");

  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });

  test("anon INSERT into categories is blocked by RLS", async () => {
    const { error } = await anon.from("categories").insert({ name: `e2e-should-fail-${Date.now()}` } as any);
    expect(error, "expected RLS to reject anon insert into categories").not.toBeNull();
  });

  test("anon UPDATE on categories is blocked (updates 0 rows)", async () => {
    // pick any row to try updating; even if none exist, this must not throw success on 1+ row
    const { data: any1 } = await anon.from("categories").select("id").limit(1);
    const target = (any1 as any[])?.[0]?.id;
    if (!target) test.skip(true, "no categories to attempt update on");
    const { data, error } = await anon.from("categories").update({ name: "e2e-hijack" }).eq("id", target).select("id");
    // Either RLS returns an error, or it silently updates 0 rows.
    if (error) {
      expect(error).not.toBeNull();
    } else {
      expect((data ?? []).length, "expected 0 rows updated under anon").toBe(0);
    }
  });

  test("anon DELETE on categories is blocked (deletes 0 rows)", async () => {
    const { data: any1 } = await anon.from("categories").select("id").limit(1);
    const target = (any1 as any[])?.[0]?.id;
    if (!target) test.skip(true, "no categories to attempt delete on");
    const { data, error } = await anon.from("categories").delete().eq("id", target).select("id");
    if (error) {
      expect(error).not.toBeNull();
    } else {
      expect((data ?? []).length, "expected 0 rows deleted under anon").toBe(0);
    }
  });

  test("anon can READ categories (public read policy)", async () => {
    const { error } = await anon.from("categories").select("id, name, image_urls").limit(3);
    expect(error).toBeNull();
  });
});
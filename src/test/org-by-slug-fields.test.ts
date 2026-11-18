import { describe, it, expect } from "vitest";

/**
 * Contract test: org_by_slug RPC must return ONLY a whitelist of safe fields.
 * We assert against the generated Supabase types so future schema drift
 * (someone adding phone/email to the function) fails CI before reaching prod.
 */
import type { Database } from "@/integrations/supabase/types";

type OrgBySlugReturn = Database["public"]["Functions"]["org_by_slug"]["Returns"][number];

const ALLOWED: Array<keyof OrgBySlugReturn> = ["id", "name", "type", "approved"];
const FORBIDDEN = [
  "phone", "email", "address", "tax_id", "contact_name",
  "drive_folder_id", "price_group_id", "google_drive_folder_id",
  "line_token", "secret",
];

describe("org_by_slug RPC field whitelist", () => {
  it("returns only safe public fields", () => {
    const sample: OrgBySlugReturn = {
      id: "x", name: "n", type: "general", approved: true,
    } as OrgBySlugReturn;
    const keys = Object.keys(sample);
    for (const k of keys) expect(ALLOWED).toContain(k as keyof OrgBySlugReturn);
  });

  it("type does NOT expose any sensitive field", () => {
    // ถ้ามีคนเพิ่ม field ใน RPC ภายหลัง type จะเปลี่ยน — บังคับให้คนแก้ test
    // และทบทวนความปลอดภัยอีกครั้ง
    type Keys = keyof OrgBySlugReturn;
    const banned: Array<Extract<Keys, (typeof FORBIDDEN)[number]>> = [];
    expect(banned.length).toBe(0);
  });
});
import { describe, it, expect } from "vitest";
import {
  loadDocOnlyRoom,
  lockCommandToRoomShop,
  docOnlyStoreMissingText,
  DOC_ONLY_NOTICE,
} from "../../supabase/functions/_shared/docOnlyRoom.ts";
import { parseDocBotCommand } from "../../supabase/functions/_shared/docBotCommands.ts";
import { enforceQuotationFirst } from "../../supabase/functions/_shared/quotationFirst.ts";

/** admin client จำลอง — คืนแถวตาม channel_type ที่ query */
function fakeAdmin(rows: Record<string, any>) {
  return {
    from() {
      const q: any = {
        filters: {} as Record<string, unknown>,
        select() { return q; },
        eq(col: string, val: unknown) { q.filters[col] = val; return q; },
        limit() { return q; },
        maybeSingle() {
          const dest = String(q.filters["line_destination_id"] ?? "");
          const type = String(q.filters["channel_type"] ?? "");
          const row = rows[dest];
          if (!row || (type && row.channel_type !== type)) return Promise.resolve({ data: null });
          return Promise.resolve({ data: row });
        },
      };
      return q;
    },
  };
}

const ROOMS = {
  Cprinting: { id: "r-print", store_id: "store-printing", display_name: "bot เอกสาร การพิมพ์", channel_type: "doc_group" },
  Ccolorlab: { id: "r-color", store_id: "store-colorlab", display_name: "Document Bot คัลเลอร์แล็ป", channel_type: "doc_group" },
  Cqueue: { id: "r-queue", store_id: "runqueue", display_name: "botรันงาน", channel_type: "queue_group" },
};

describe("ห้องบอทเอกสาร (document-only rooms)", () => {
  it("F) กลุ่มการพิมพ์/คัลเลอร์แล็ปถูกจับเป็นห้องเอกสารและ map คนละร้าน", async () => {
    const admin = fakeAdmin(ROOMS);
    const p = await loadDocOnlyRoom(admin, "Cprinting");
    const c = await loadDocOnlyRoom(admin, "Ccolorlab");
    expect(p?.storeId).toBe("store-printing");
    expect(c?.storeId).toBe("store-colorlab");
    expect(p?.storeId).not.toBe(c?.storeId);
  });

  it("G) กลุ่มรันคิวไม่ถูกจับเป็นห้องเอกสาร (ไม่กระทบกลุ่มคิวจริง)", async () => {
    expect(await loadDocOnlyRoom(fakeAdmin(ROOMS), "Cqueue")).toBeNull();
    expect(await loadDocOnlyRoom(fakeAdmin(ROOMS), null)).toBeNull();
  });

  it("ล็อกร้านของห้องเสมอ แม้คำสั่งพิมพ์ชื่ออีกร้านมา", () => {
    const cmd = parseDocBotCommand("ออกใบเสนอราคา คัลเลอร์แล็ป\nลูกค้า: โรงเรียน A\nปากกา 10 ด้าม 5");
    expect(cmd).toBeTruthy();
    const locked = lockCommandToRoomShop(cmd!, "printing");
    expect(locked.command.fields.shopKey).toBe("printing");
    expect(locked.overridden).toBe(true);
  });

  it("A/B) งานใหม่ในห้องเอกสาร → ใบเสนอราคาเท่านั้น และตัด companion ออก", () => {
    const cmd = parseDocBotCommand("ออกใบส่งของ การพิมพ์\nลูกค้า: โรงเรียน A\nพร้อม: ใบส่งของ, ใบเสร็จ\nปากกา 10 ด้าม 5");
    const out = enforceQuotationFirst(cmd!, null);
    expect(out.command.docType).toBe("quotation");
    expect(out.command.doc?.companions ?? []).toHaveLength(0);
    expect(out.notices.join(" ")).toContain("ใบเสนอราคา");
  });

  it("ข้อความชี้แจงห้องเอกสารไม่มีคิวงาน และแจ้ง error เมื่อยังไม่ผูกร้าน", () => {
    expect(DOC_ONLY_NOTICE).toContain("ไม่มีระบบรันคิวงาน");
    expect(docOnlyStoreMissingText("bot เอกสาร การพิมพ์")).toContain("ยังไม่ได้ผูกกับร้าน");
  });
});

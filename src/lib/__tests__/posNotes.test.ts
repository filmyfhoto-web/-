import { describe, it, expect } from "vitest";
import { buildPosNotes, parsePosNotes, orgLabel } from "../posNotes";

describe("posNotes", () => {
  it("builds and round-trips all parts", () => {
    const s = buildPosNotes({ channel: "หน้าร้าน / เครื่อง 1", org: "โรงเรียนบ้านเชียงกลาง", note: "เบิกงบสิ้นเดือน" });
    expect(s).toContain("หน่วยงาน: โรงเรียนบ้านเชียงกลาง");
    const p = parsePosNotes(s);
    expect(p.org).toBe("โรงเรียนบ้านเชียงกลาง");
    expect(p.note).toBe("เบิกงบสิ้นเดือน");
    expect(p.channel).toBe("หน้าร้าน / เครื่อง 1");
  });

  it("omits empty segments", () => {
    expect(buildPosNotes({ org: "  ", note: "" })).toBe("");
  });

  it("keeps unknown free text as the note", () => {
    expect(parsePosNotes("ลูกค้าประจำ").note).toBe("ลูกค้าประจำ");
  });

  it("tolerates null", () => {
    expect(parsePosNotes(null)).toEqual({ channel: null, org: null, note: null });
  });

  it("labels missing org", () => {
    expect(orgLabel(null)).toBe("ไม่ระบุโรงเรียน/หน่วยงาน");
    expect(orgLabel(" ก ")).toBe("ก");
  });

  it("also accepts a pipe separator from older/manual notes", () => {
    const p = parsePosNotes("หน่วยงาน: โรงเรียน ก | หมายเหตุ: วางบิลสิ้นเดือน");
    expect(p.org).toBe("โรงเรียน ก");
    expect(p.note).toBe("วางบิลสิ้นเดือน");
  });
});

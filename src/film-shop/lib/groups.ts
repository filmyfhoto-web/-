/**
 * 4 กลุ่มงานหลักของระบบ — แยกขาดจากกัน ไม่ปะปนกัน
 * 1) นัฐภรณ์ คัลเลอร์แล็ป (ส้ม) 2) นัฐภรณ์ การพิมพ์ (เขียว)
 * 3) Film Shop (น้ำเงินเข้ม) 4) Q รันงาน (ม่วง) — กลุ่มแยก ไม่ใช่คิวของสามร้าน
 */
export type GroupKey = 'colorlab' | 'printing' | 'filmshop' | 'queue';

export interface GroupDef {
  key: GroupKey;
  /** page id ใน FilmShopApp */
  page: string;
  title: string;
  subtitle: string;
  /** prefix เลขเอกสารประจำกลุ่ม (Q รันงานไม่ออกเอกสาร) */
  docPrefix?: 'CL' | 'NP' | 'FS';
  /** คลาสพื้นหลังเข้มของกลุ่ม (ใช้กับหัวเรื่อง/การ์ด) */
  solid: string;
  /** คลาสพื้นอ่อน + เส้นขอบ */
  soft: string;
  /** คลาสตัวอักษรสีประจำกลุ่ม */
  text: string;
  /** คลาสเส้นขอบสีประจำกลุ่ม */
  border: string;
}

export const GROUPS: Record<GroupKey, GroupDef> = {
  colorlab: {
    key: 'colorlab',
    page: 'group-colorlab',
    title: 'นัฐภรณ์ คัลเลอร์แล็ป',
    subtitle: 'งานและการแจ้งเตือนของคัลเลอร์แล็ปเท่านั้น',
    docPrefix: 'CL',
    solid: 'bg-group-colorlab text-group-colorlab-foreground',
    soft: 'bg-group-colorlab/10 border-group-colorlab/30',
    text: 'text-group-colorlab',
    border: 'border-group-colorlab',
  },
  printing: {
    key: 'printing',
    page: 'group-printing',
    title: 'นัฐภรณ์ การพิมพ์',
    subtitle: 'งานและการแจ้งเตือนของร้านการพิมพ์เท่านั้น',
    docPrefix: 'NP',
    solid: 'bg-group-printing text-group-printing-foreground',
    soft: 'bg-group-printing/10 border-group-printing/30',
    text: 'text-group-printing',
    border: 'border-group-printing',
  },
  filmshop: {
    key: 'filmshop',
    page: 'group-filmshop',
    title: 'Film Shop',
    subtitle: 'ออกใบสั่งจ้างและใบเสร็จเท่านั้น',
    docPrefix: 'FS',
    solid: 'bg-group-filmshop text-group-filmshop-foreground',
    soft: 'bg-group-filmshop/10 border-group-filmshop/30',
    text: 'text-group-filmshop',
    border: 'border-group-filmshop',
  },
  queue: {
    key: 'queue',
    page: 'group-queue',
    title: 'Q รันงาน',
    subtitle: 'เรียงลำดับงาน รับงานเข้ารัน เปลี่ยนสถานะ และสรุปงาน',
    solid: 'bg-group-queue text-group-queue-foreground',
    soft: 'bg-group-queue/10 border-group-queue/30',
    text: 'text-group-queue',
    border: 'border-group-queue',
  },
};

export const GROUP_ORDER: GroupKey[] = ['colorlab', 'printing', 'filmshop', 'queue'];

/** เลขเอกสารที่มี prefix ประจำกลุ่ม เช่น FS-RC-2608001 */
export function withGroupPrefix(prefix: GroupDef['docPrefix'], docNo: string): string {
  if (!prefix) return docNo;
  return docNo.startsWith(`${prefix}-`) ? docNo : `${prefix}-${docNo}`;
}

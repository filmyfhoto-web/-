/** Shared POS types used across CentralPOS and its dialogs. */

export type PosCustomerRef = {
  name: string;
  phone: string | null;
  line_user_id: string | null;
  line_display_name: string | null;
  /** โรงเรียน/หน่วยงานที่ลูกค้าสังกัด (มาจากที่อยู่ในฐานลูกค้ารวม) */
  org?: string | null;
};
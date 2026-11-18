export interface POSItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  price: number;
  total: number;
  width?: number;   // กว้าง (เมตร)
  height?: number;  // ยาว (เมตร)
}

export type PaymentStatus = 'pending' | 'deposit' | 'paid' | 'credit';
// pending = ยังไม่จ่าย
// deposit = มัดจำ
// paid = จ่ายแล้ว  
// credit = ลงบัญชี

export type CopyType = 'customer' | 'shop' | undefined;
// undefined = ใบปกติ
// customer = สำเนาลูกค้า
// shop = สำเนาร้าน

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'ยังไม่จ่าย',
  deposit: 'มัดจำ',
  paid: 'จ่ายแล้ว',
  credit: 'ลงบัญชี',
};

export type POSPaymentType = 'cash' | 'credit' | 'transfer';

export const PAYMENT_TYPE_LABELS: Record<POSPaymentType, string> = {
  cash: 'เงินสด',
  credit: 'ลงบัญชี',
  transfer: 'เงินโอน',
};

export interface POSReceipt {
  id: string;
  receiptNumber: string;
  customerName: string;
  customerId?: string;
  receiptDate: Date;
  paymentType: POSPaymentType;
  paymentStatus: PaymentStatus;
  items: POSItem[];
  subtotal: number;
  deposit: number;
  total: number;
  notes?: string;
  cashReceived?: number;  // เงินที่รับมา
  changeAmount?: number;  // เงินทอน
  createdAt: Date;
  updatedAt: Date;
}

export interface POSProduct {
  id: string;
  name: string;
  price: number;
  unit: string;
  category: string;
  icon?: string;
}

export const POS_CATEGORIES = [
  { id: 'photocopy', name: 'ถ่ายเอกสาร' },
  { id: 'print', name: 'พิมพ์เอกสาร' },
  { id: 'photo', name: 'ถ่ายรูป/อัดรูป' },
  { id: 'card', name: 'ทำบัตร' },
  { id: 'binding', name: 'เข้าเล่ม' },
  { id: 'special', name: 'บริการพิเศษ' },
] as const;

export const POS_PRODUCTS: POSProduct[] = [
  // ถ่ายเอกสาร
  { id: 'copy-a4', name: 'ถ่ายเอกสาร A4', price: 1.50, unit: 'หน้า', category: 'photocopy' },
  { id: 'copy-a3', name: 'ถ่ายเอกสาร A3', price: 3.00, unit: 'หน้า', category: 'photocopy' },
  { id: 'copy-b4', name: 'ถ่ายเอกสาร B4', price: 2.00, unit: 'หน้า', category: 'photocopy' },
  { id: 'copy-a4-color', name: 'ถ่ายเอกสาร A4 สี', price: 5.00, unit: 'หน้า', category: 'photocopy' },
  { id: 'copy-a3-color', name: 'ถ่ายเอกสาร A3 สี', price: 10.00, unit: 'หน้า', category: 'photocopy' },
  
  // พิมพ์เอกสาร
  { id: 'print-a4-bw', name: 'พิมพ์เอกสาร A4 ขาวดำ', price: 2.00, unit: 'หน้า', category: 'print' },
  { id: 'print-a4-color', name: 'พิมพ์เอกสาร A4 สี', price: 5.00, unit: 'หน้า', category: 'print' },
  { id: 'print-a3-bw', name: 'พิมพ์เอกสาร A3 ขาวดำ', price: 4.00, unit: 'หน้า', category: 'print' },
  { id: 'print-a3-color', name: 'พิมพ์เอกสาร A3 สี', price: 10.00, unit: 'หน้า', category: 'print' },
  { id: 'print-banner', name: 'พิมพ์แบนเนอร์', price: 150.00, unit: 'ตร.ม.', category: 'print' },
  { id: 'print-sticker', name: 'พิมพ์สติ๊กเกอร์', price: 200.00, unit: 'ตร.ม.', category: 'print' },
  
  // ถ่ายรูป/อัดรูป
  { id: 'photo-4x6', name: 'อัดรูป 4x6', price: 8.00, unit: 'รูป', category: 'photo' },
  { id: 'photo-5x7', name: 'อัดรูป 5x7', price: 15.00, unit: 'รูป', category: 'photo' },
  { id: 'photo-8x10', name: 'อัดรูป 8x10', price: 30.00, unit: 'รูป', category: 'photo' },
  { id: 'photo-a4', name: 'อัดรูป A4', price: 50.00, unit: 'รูป', category: 'photo' },
  { id: 'photo-id', name: 'ถ่ายรูปติดบัตร', price: 50.00, unit: 'ชุด', category: 'photo' },
  { id: 'photo-passport', name: 'ถ่ายรูปพาสปอร์ต', price: 80.00, unit: 'ชุด', category: 'photo' },
  
  // ทำบัตร
  { id: 'card-pvc', name: 'บัตร PVC พิมพ์', price: 50.00, unit: 'ใบ', category: 'card' },
  { id: 'card-member', name: 'บัตรสมาชิก', price: 80.00, unit: 'ใบ', category: 'card' },
  { id: 'card-employee', name: 'บัตรพนักงาน', price: 100.00, unit: 'ใบ', category: 'card' },
  { id: 'card-student', name: 'บัตรนักเรียน', price: 60.00, unit: 'ใบ', category: 'card' },
  { id: 'card-business', name: 'นามบัตร', price: 200.00, unit: 'กล่อง', category: 'card' },
  { id: 'card-wedding', name: 'การ์ดแต่งงาน', price: 15.00, unit: 'ใบ', category: 'card' },
  
  // เข้าเล่ม
  { id: 'bind-spiral', name: 'เข้าเล่มสันห่วง', price: 30.00, unit: 'เล่ม', category: 'binding' },
  { id: 'bind-tape', name: 'เข้าเล่มสันเทป', price: 25.00, unit: 'เล่ม', category: 'binding' },
  { id: 'bind-glue', name: 'เข้าเล่มสันกาว', price: 50.00, unit: 'เล่ม', category: 'binding' },
  { id: 'bind-hardcover', name: 'เข้าเล่มปกแข็ง', price: 150.00, unit: 'เล่ม', category: 'binding' },
  { id: 'bind-thesis', name: 'เข้าเล่มวิทยานิพนธ์', price: 200.00, unit: 'เล่ม', category: 'binding' },
  
  // บริการพิเศษ
  { id: 'laminate-a4', name: 'เคลือบบัตร A4', price: 20.00, unit: 'แผ่น', category: 'special' },
  { id: 'laminate-a3', name: 'เคลือบบัตร A3', price: 35.00, unit: 'แผ่น', category: 'special' },
  { id: 'laminate-id', name: 'เคลือบบัตรประชาชน', price: 10.00, unit: 'ใบ', category: 'special' },
  { id: 'scan', name: 'สแกนเอกสาร', price: 5.00, unit: 'หน้า', category: 'special' },
  { id: 'fax', name: 'แฟกซ์', price: 10.00, unit: 'หน้า', category: 'special' },
  { id: 'typing', name: 'พิมพ์งาน', price: 20.00, unit: 'หน้า', category: 'special' },
  { id: 'design', name: 'ออกแบบกราฟิก', price: 200.00, unit: 'ชิ้น', category: 'special' },
];

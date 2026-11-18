export interface Customer {
  id: string;
  name: string;
  taxId?: string;
  taxBranch?: string;
  phone?: string;
  address?: string;
  createdAt: Date;
}

export interface VinylItem {
  id: string;
  name: string;
  width: number;
  height: number;
  pricePerSqm: number;
  quantity: number;
  unit: string;
  discount: number;
  pricePerPiece: number;
  total: number;
  category?: string;
  /** หน่วยของ width/height ที่กรอก (ค่าปริยาย = เมตร) ใช้กับ toMeters/lineAreaSqm */
  dimUnit?: 'cm' | 'm';
  /** true = ผู้ใช้กด "แก้ราคาเอง" → total ค่านี้ห้ามถูกคำนวณทับเมื่อแก้กว้าง/ยาว/จำนวน */
  manualPrice?: boolean;
}

export interface InvoiceAttachment {
  name: string;
  path: string;
  size?: number;
  type?: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  type: 'quotation' | 'invoice' | 'receipt' | 'job_order';
  customerId?: string;
  customerName: string;
  customerTaxId?: string;
  customerBranch?: string;
  customerPhone?: string;
  customerAddress?: string;
  items: VinylItem[];
  subtotal: number;
  deposit: number;
  discount: number;
  total: number;
  amountDue: number;
  status: 'pending' | 'partial' | 'paid' | 'deposit' | 'credit';
  jobStatus: 'pending' | 'in-progress' | 'printing' | 'completed' | 'delivered';
  salesPerson?: string;
  referenceDoc?: string;
  notes?: string;
  headerText?: string;
  documentDate?: Date;
  createdAt: Date;
  dueDate?: Date;
  paidAt?: Date;
  paymentMethod?: 'cash' | 'transfer' | 'credit';
  attachments?: InvoiceAttachment[];
  isDraft?: boolean;
  createdVia?: 'app' | 'line';
  createdViaLineUserId?: string;
}

export interface Employee {
  id: string;
  name: string;
  position: string;
  phone?: string;
  email?: string;
  startDate: Date;
  isActive: boolean;
}

export interface Transaction {
  id: string;
  type: 'income' | 'expense';
  category: string;
  description: string;
  amount: number;
  date: Date;
  invoiceId?: string;
  /** ที่มาของรายการ เช่น 'line' เมื่อบันทึกผ่าน “ม่วงจดให้” */
  source?: string | null;
  /** หลักฐานแนบ (สลิป/ไฟล์) ที่ส่งมาพร้อมรายการใน LINE */
  evidence?: Array<{ name: string; path: string }>;
  createdAt?: Date;
}

export interface RubberStampOrder {
  id: string;
  orderNumber: string;
  type: 'quotation' | 'invoice' | 'receipt';
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  customerTaxId?: string;
  customerAddress?: string;
  items: RubberStampItem[];
  subtotal: number;
  deposit: number;
  discount: number;
  total: number;
  amountDue: number;
  status: 'pending' | 'in-progress' | 'completed' | 'delivered';
  paymentStatus: 'pending' | 'partial' | 'paid';
  paymentMethod?: 'cash' | 'transfer' | 'credit';
  salesPerson?: string;
  notes?: string;
  documentDate?: Date;
  createdAt: Date;
  completedAt?: Date;
  paidAt?: Date;
}

export interface RubberStampItem {
  id: string;
  stampType: string;
  size: string;
  text?: string;
  quantity: number;
  pricePerPiece: number;
  total: number;
}

export type ProductPricing = Record<string, number>;
export type ProductLabels = Record<string, string>;

export interface ShopSettings {
  shopName: string;
  shopAddress: string;
  shopPhone: string;
  shopTaxId: string;
  shopLogo?: string;
  defaultPricePerSqm: number;
  productPricing: ProductPricing;
  productLabels: ProductLabels;
  receiptHeader?: string;
  receiptFooter?: string;
  quotationHeaderText?: string;
}

export type ProductType = string;

export type JobStatus = Invoice['jobStatus'];
export type InvoiceType = Invoice['type'];
export type PaymentStatus = Invoice['status'];

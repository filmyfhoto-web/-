/**
 * บันทึกเหตุการณ์ "ลิงก์ปลายทาง" (deep link) ลง activity log ของ FILM SHOP
 * เพื่อไล่ปัญหาย้อนหลังได้เร็ว เช่น ลิงก์แจ้งเตือน LINE เข้าหน้าเช็คงานไม่ได้
 *  - บันทึกปลายทางเดิมก่อนถูกส่งไปหน้าล็อกอิน
 *  - บันทึกผลการนำพากลับหลังล็อกอิน (ได้ปลายทางเดิมหรือถูกเปลี่ยนเพราะสิทธิ์)
 */
import { logFsActivity } from '@/film-shop/lib/fsActivityLog';

/** ปลายทางเดิมก่อนล็อกอิน (ผู้ใช้ยังไม่ได้เข้าสู่ระบบ) */
export function logDeepLinkIntercepted(intended: string, guard: string) {
  logFsActivity('deep_link', 'เก็บปลายทางเดิมก่อนล็อกอิน', {
    'ปลายทางเดิม': intended,
    'ด่าน': guard,
  });
}

/** ผลการนำพากลับหลังล็อกอิน */
export function logDeepLinkResolved(opts: {
  requested: string | null;
  target: string;
  stage: 'existing_session' | 'after_signin';
}) {
  const requested = opts.requested || '-';
  const matched = requested !== '-' && opts.target.split('?')[0] === requested.split('?')[0];
  logFsActivity('deep_link', matched ? 'นำพากลับปลายทางเดิมสำเร็จ' : 'เปลี่ยนปลายทางหลังล็อกอิน', {
    'ปลายทางที่ขอ': requested,
    'ปลายทางจริง': opts.target,
    'ช่วง': opts.stage === 'existing_session' ? 'มีเซสชันอยู่แล้ว' : 'หลังกรอกรหัสผ่าน',
  });
}

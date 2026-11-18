import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * ปุ่มย้อนกลับที่ปลอดภัย — ถ้ามีประวัติภายในแอปให้ถอยหนึ่งก้าว
 * ถ้าไม่มี (เช่น เปิดลิงก์ตรง / เปิดจาก PWA) ให้ไปหน้าหลักของโซนนั้นแทน
 * จะได้ไม่หลุดออกไปนอกแอปหรือค้างหน้าเดิม
 */
export function useSmartBack(fallback: string) {
  const navigate = useNavigate();
  const location = useLocation();

  const hasInAppHistory = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx;
    return typeof idx === 'number' ? idx > 0 : window.history.length > 1;
  };

  const goBack = useCallback(() => {
    if (hasInAppHistory()) navigate(-1);
    else navigate(fallback, { replace: true });
  }, [navigate, fallback]);

  /** ซ่อนปุ่มเมื่ออยู่หน้าหลักของโซนอยู่แล้วและไม่มีที่ให้ย้อน */
  const isAtFallback = location.pathname === fallback;

  return { goBack, isAtFallback };
}

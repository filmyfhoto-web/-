import { useCallback, useEffect, useState } from 'react';

/** คีย์เก็บสถานะยุบ/กางของแถบเมนูซ้าย (คงค่าข้ามการสลับหน้าและรีเฟรช) */
export const SIDEBAR_PREF_KEY = 'filmshop.sidebar.collapsed';

const read = (): boolean => {
  try {
    return window.localStorage.getItem(SIDEBAR_PREF_KEY) === '1';
  } catch {
    return false;
  }
};

/**
 * จำสถานะ “ยุบเป็นแถบไอคอน / กางเต็ม” ของ sidebar ไว้ใน localStorage
 *
 * หมายเหตุ UX: เก็บเฉพาะโหมด rail/full เท่านั้น — overlay drawer บนแท็บเล็ต
 * ไม่ถูกจำสถานะเปิด เพื่อไม่ให้เปิดหน้าใหม่แล้วเจอเมนูค้างทับเนื้อหา
 */
export function useSidebarPreference() {
  const [collapsed, setCollapsedState] = useState<boolean>(() =>
    typeof window === 'undefined' ? false : read(),
  );

  useEffect(() => {
    // sync ข้ามแท็บ/หน้าต่างที่เปิดพร้อมกัน
    const onStorage = (e: StorageEvent) => {
      if (e.key === SIDEBAR_PREF_KEY) setCollapsedState(read());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setCollapsed = useCallback((next: boolean) => {
    setCollapsedState(next);
    try {
      window.localStorage.setItem(SIDEBAR_PREF_KEY, next ? '1' : '0');
    } catch {
      /* storage ถูกบล็อก — ใช้ค่าใน memory ต่อได้ */
    }
  }, []);

  const toggle = useCallback(() => setCollapsed(!collapsed), [collapsed, setCollapsed]);

  return { collapsed, setCollapsed, toggle };
}
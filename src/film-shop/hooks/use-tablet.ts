import { useEffect, useState } from 'react';

/** แท็บเล็ต/จอกลาง: 768–1279px — sidebar ยุบเป็น icon rail */
export function useIsTablet() {
  const [isTablet, setIsTablet] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px) and (max-width: 1279px)');
    const onChange = () => setIsTablet(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return isTablet;
}

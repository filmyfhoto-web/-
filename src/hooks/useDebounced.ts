import { useEffect, useState } from "react";

/** คืนค่าที่หน่วงเวลา เพื่อให้พิมพ์ค้นหาเร็ว ๆ ได้ไม่กระตุก */
export function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export default useDebounced;

import { createContext, useContext, type ReactNode } from 'react';
import { useWorkcenter } from '@/film-shop/workcenter/hooks/useWorkcenter';

type Ctx = ReturnType<typeof useWorkcenter>;

const WorkcenterContext = createContext<Ctx | null>(null);

/** โหลดข้อมูลศูนย์รับงานครั้งเดียวแล้วแชร์ให้ทุกแท็บ (กันโหลด/subscribe ซ้ำ) */
export function WorkcenterProvider({ children }: { children: ReactNode }) {
  const value = useWorkcenter();
  return <WorkcenterContext.Provider value={value}>{children}</WorkcenterContext.Provider>;
}

export function useWorkcenterCtx(): Ctx {
  const ctx = useContext(WorkcenterContext);
  if (!ctx) throw new Error('useWorkcenterCtx must be used inside WorkcenterProvider');
  return ctx;
}
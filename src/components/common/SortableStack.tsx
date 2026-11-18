import { ReactNode, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import {
  ARRANGE_EVENT, getBlockOrder, isArrangeMode, moveInOrder, setBlockOrder,
} from "@/lib/layoutPref";

export interface StackBlock {
  id: string;
  /** ชื่อที่แสดงในโหมดจัดวาง */
  label?: string;
  node: ReactNode;
}

/**
 * ห่อบล็อกของหน้าให้ผู้ใช้สลับลำดับเองได้ (เฉพาะตอนเปิด "โหมดจัดวาง"
 * จากปุ่มปรับหน้าจอ) ปกติจะเรนเดอร์ตามลำดับที่บันทึกไว้เท่านั้น
 * ไม่แตะเนื้อหาหรือ logic ของบล็อกใด ๆ
 */
export default function SortableStack({
  stackKey, blocks, className,
}: { stackKey: string; blocks: StackBlock[]; className?: string }) {
  const { pathname } = useLocation();
  const ids = blocks.map((b) => b.id);
  const [order, setOrder] = useState<string[]>(ids);
  const [arrange, setArrange] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  useEffect(() => {
    setOrder(getBlockOrder(pathname, stackKey, ids));
    setArrange(isArrangeMode());
    const onArrange = (e: Event) => setArrange(!!(e as CustomEvent).detail);
    const onReset = () => setOrder(getBlockOrder(pathname, stackKey, ids));
    window.addEventListener(ARRANGE_EVENT, onArrange);
    window.addEventListener("ui:arrange-reset", onReset);
    return () => {
      window.removeEventListener(ARRANGE_EVENT, onArrange);
      window.removeEventListener("ui:arrange-reset", onReset);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, stackKey, ids.join("|")]);

  const commit = (next: string[]) => {
    setOrder(next);
    setBlockOrder(pathname, stackKey, next);
  };

  const move = (id: string, delta: number) => {
    const from = order.indexOf(id);
    commit(moveInOrder(order, from, from + delta));
  };

  const dropOn = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    commit(moveInOrder(order, order.indexOf(dragId), order.indexOf(targetId)));
    setDragId(null);
  };

  const byId = new Map(blocks.map((b) => [b.id, b]));

  return (
    <div className={className} data-testid={`sortable-stack-${stackKey}`}>
      {order.map((id, index) => {
        const block = byId.get(id);
        if (!block) return null;
        if (!arrange) return <div key={id} data-block-id={id}>{block.node}</div>;
        return (
          <div
            key={id}
            data-block-id={id}
            draggable
            onDragStart={() => setDragId(id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => dropOn(id)}
            className="relative my-2 rounded-xl border-2 border-dashed border-primary/50 bg-primary/5"
          >
            <div className="flex items-center justify-between gap-2 border-b border-primary/30 bg-background/80 px-3 py-1.5">
              <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-primary">
                <GripVertical className="h-4 w-4 shrink-0" aria-hidden />
                <span className="truncate">{block.label ?? id}</span>
              </span>
              <span className="flex gap-1">
                <button type="button" className="rounded-md border p-1 disabled:opacity-40"
                  aria-label={`เลื่อน ${block.label ?? id} ขึ้น`} disabled={index === 0}
                  onClick={() => move(id, -1)}>
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button type="button" className="rounded-md border p-1 disabled:opacity-40"
                  aria-label={`เลื่อน ${block.label ?? id} ลง`} disabled={index === order.length - 1}
                  onClick={() => move(id, 1)}>
                  <ArrowDown className="h-4 w-4" />
                </button>
              </span>
            </div>
            <div className="pointer-events-none select-none">{block.node}</div>
          </div>
        );
      })}
    </div>
  );
}

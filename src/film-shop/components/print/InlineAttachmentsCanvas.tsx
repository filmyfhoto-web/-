import { useEffect, useRef, useState, useCallback } from 'react';
import type { RenderedAttachment } from '@/film-shop/utils/attachmentRender';
import { X, Move, Maximize2 } from 'lucide-react';

export interface AttachmentBox {
  key: string;
  x: number; // px relative to canvas
  y: number;
  w: number;
  h: number;
  z: number;
  visible: boolean;
}

interface Props {
  rendered: RenderedAttachment[];
  layout: Record<string, AttachmentBox>;
  onLayoutChange: (next: Record<string, AttachmentBox>) => void;
  canvasHeightPx?: number;
}

export function InlineAttachmentsCanvas({ rendered, layout, onLayoutChange, canvasHeightPx = 760 }: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<{
    key: string;
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    startBox: AttachmentBox;
  } | null>(null);

  const bringToFront = useCallback((key: string) => {
    const maxZ = Math.max(0, ...Object.values(layout).map(b => b.z));
    if (layout[key]?.z === maxZ) return;
    onLayoutChange({ ...layout, [key]: { ...layout[key], z: maxZ + 1 } });
  }, [layout, onLayoutChange]);

  const onPointerDown = (
    e: React.PointerEvent,
    key: string,
    mode: 'move' | 'resize'
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const box = layout[key];
    if (!box) return;
    bringToFront(key);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDragging({ key, mode, startX: e.clientX, startY: e.clientY, startBox: { ...box } });
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - dragging.startX;
      const dy = e.clientY - dragging.startY;
      const canvas = canvasRef.current;
      const maxW = canvas?.clientWidth ?? 800;
      const maxH = canvas?.clientHeight ?? canvasHeightPx;
      const cur = { ...dragging.startBox };
      if (dragging.mode === 'move') {
        cur.x = Math.max(0, Math.min(maxW - cur.w, cur.x + dx));
        cur.y = Math.max(0, Math.min(maxH - cur.h, cur.y + dy));
      } else {
        const keepRatio = !e.shiftKey;
        if (keepRatio) {
          const ratio = dragging.startBox.w / dragging.startBox.h;
          const newW = Math.max(40, dragging.startBox.w + dx);
          const newH = newW / ratio;
          cur.w = Math.min(maxW - cur.x, newW);
          cur.h = Math.min(maxH - cur.y, newH);
        } else {
          cur.w = Math.max(40, Math.min(maxW - cur.x, dragging.startBox.w + dx));
          cur.h = Math.max(40, Math.min(maxH - cur.y, dragging.startBox.h + dy));
        }
      }
      onLayoutChange({ ...layout, [dragging.key]: cur });
    };
    const onUp = () => setDragging(null);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragging, layout, onLayoutChange, canvasHeightPx]);

  const removeBox = (key: string) => {
    onLayoutChange({ ...layout, [key]: { ...layout[key], visible: false } });
  };

  return (
    <div
      ref={canvasRef}
      className="inline-att-canvas"
      style={{
        position: 'relative',
        width: '100%',
        height: `${canvasHeightPx}px`,
        marginTop: '15px',
        border: '1px dashed #cbd5e1',
        borderRadius: 4,
        background: 'transparent',
      }}
    >
      <div
        className="no-print"
        style={{ position: 'absolute', top: 4, left: 8, fontSize: 10, color: '#94a3b8', pointerEvents: 'none' }}
      >
        พื้นที่ไฟล์แนบ — ลากเพื่อย้าย / ลากมุมเพื่อย่อขยาย (จะไม่แสดงเส้นประเวลาพิมพ์)
      </div>
      {rendered.map((r, i) => {
        const key = `${r.name}-${i}`;
        const box = layout[key];
        if (!box || !box.visible) return null;
        return (
          <div
            key={key}
            style={{
              position: 'absolute',
              left: box.x,
              top: box.y,
              width: box.w,
              height: box.h,
              zIndex: box.z,
              background: '#fff',
              boxShadow: '0 0 0 1px #e5e7eb',
              overflow: 'hidden',
            }}
            onPointerDown={(e) => onPointerDown(e, key, 'move')}
          >
            <img
              src={r.dataUrl}
              alt={r.name}
              draggable={false}
              style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', userSelect: 'none', pointerEvents: 'none' }}
            />
            {/* controls — hidden on print */}
            <button
              type="button"
              className="no-print"
              onPointerDown={(e) => { e.stopPropagation(); }}
              onClick={(e) => { e.stopPropagation(); removeBox(key); }}
              style={{
                position: 'absolute', top: 2, right: 2,
                width: 22, height: 22, borderRadius: 11,
                background: 'rgba(239,68,68,0.9)', color: 'white', border: 'none',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              title="เอาออกจากเลย์เอาต์"
            >
              <X size={14} />
            </button>
            <div
              className="no-print"
              style={{
                position: 'absolute', top: 2, left: 2,
                padding: '2px 4px', borderRadius: 3, background: 'rgba(0,0,0,0.5)',
                color: 'white', fontSize: 10, display: 'flex', alignItems: 'center', gap: 3,
              }}
            >
              <Move size={10} /> {r.name.length > 18 ? r.name.slice(0, 18) + '…' : r.name}
            </div>
            <div
              className="no-print"
              onPointerDown={(e) => onPointerDown(e, key, 'resize')}
              style={{
                position: 'absolute', right: 0, bottom: 0,
                width: 18, height: 18, cursor: 'nwse-resize',
                background: 'rgba(30,64,175,0.85)', color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderTopLeftRadius: 4,
              }}
              title="ลากเพื่อปรับขนาด (กด Shift = อิสระ)"
            >
              <Maximize2 size={12} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function buildDefaultLayout(rendered: RenderedAttachment[], canvasWidthPx = 700): Record<string, AttachmentBox> {
  const layout: Record<string, AttachmentBox> = {};
  const cellW = 280;
  const cellH = 200;
  const gap = 12;
  const cols = Math.max(1, Math.floor(canvasWidthPx / (cellW + gap)));
  rendered.forEach((r, i) => {
    const key = `${r.name}-${i}`;
    const row = Math.floor(i / cols);
    const col = i % cols;
    layout[key] = {
      key,
      x: col * (cellW + gap),
      y: row * (cellH + gap),
      w: cellW,
      h: cellH,
      z: i + 1,
      visible: true,
    };
  });
  return layout;
}

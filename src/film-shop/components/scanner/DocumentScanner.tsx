import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Camera, Image as ImageIcon, RotateCw, Trash2, Check, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';

type Filter = 'original' | 'bw' | 'enhance' | 'gray';

interface Corner { x: number; y: number }
interface Page {
  id: string;
  src: string;
  width: number;
  height: number;
  corners: Corner[];
  filter: Filter;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  outputAs?: 'pdf' | 'images';
  fileBaseName?: string;
  onComplete: (files: File[]) => void;
}

const DEFAULT_INSET = 0.06;

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

function getPerspectiveMatrix(src: Corner[], dstW: number, dstH: number): number[] {
  const dst: Corner[] = [
    { x: 0, y: 0 }, { x: dstW, y: 0 }, { x: dstW, y: dstH }, { x: 0, y: dstH },
  ];
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const X = dst[i].x, Y = dst[i].y, x = src[i].x, y = src[i].y;
    A.push([X, Y, 1, 0, 0, 0, -X * x, -Y * x]); b.push(x);
    A.push([0, 0, 0, X, Y, 1, -X * y, -Y * y]); b.push(y);
  }
  const n = 8;
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
    const div = A[i][i] || 1e-9;
    for (let c = i; c < n; c++) A[i][c] /= div;
    b[i] /= div;
    for (let r = 0; r < n; r++) if (r !== i) {
      const f = A[r][i];
      for (let c = i; c < n; c++) A[r][c] -= f * A[i][c];
      b[r] -= f * b[i];
    }
  }
  return [...b, 1];
}

function applyFilter(data: Uint8ClampedArray, filter: Filter) {
  if (filter === 'original') return;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], bl = data[i + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * bl;
    if (filter === 'gray') {
      data[i] = data[i + 1] = data[i + 2] = y;
    } else if (filter === 'bw') {
      const v = y > 145 ? 255 : 0;
      data[i] = data[i + 1] = data[i + 2] = v;
    } else if (filter === 'enhance') {
      const f = 1.35; const off = -25;
      data[i] = Math.max(0, Math.min(255, (r + off) * f));
      data[i + 1] = Math.max(0, Math.min(255, (g + off) * f));
      data[i + 2] = Math.max(0, Math.min(255, (bl + off) * f));
    }
  }
}

async function warpPage(page: Page): Promise<HTMLCanvasElement> {
  const img = await loadImage(page.src);
  const c = page.corners;
  const wTop = Math.hypot(c[1].x - c[0].x, c[1].y - c[0].y);
  const wBot = Math.hypot(c[2].x - c[3].x, c[2].y - c[3].y);
  const hL = Math.hypot(c[3].x - c[0].x, c[3].y - c[0].y);
  const hR = Math.hypot(c[2].x - c[1].x, c[2].y - c[1].y);
  const outW = Math.round(Math.max(wTop, wBot));
  const outH = Math.round(Math.max(hL, hR));
  const M = getPerspectiveMatrix(c, outW, outH);

  const sc = document.createElement('canvas');
  sc.width = img.naturalWidth; sc.height = img.naturalHeight;
  const sctx = sc.getContext('2d')!;
  sctx.drawImage(img, 0, 0);
  const sd = sctx.getImageData(0, 0, sc.width, sc.height).data;

  const out = document.createElement('canvas');
  out.width = outW; out.height = outH;
  const octx = out.getContext('2d')!;
  const od = octx.createImageData(outW, outH);
  const od8 = od.data;

  const [a, bM, c0, d, e, f, g, h] = M;
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const w = g * x + h * y + 1;
      const sx = (a * x + bM * y + c0) / w;
      const sy = (d * x + e * y + f) / w;
      const i = (y * outW + x) * 4;
      if (sx < 0 || sy < 0 || sx >= sc.width - 1 || sy >= sc.height - 1) {
        od8[i] = od8[i + 1] = od8[i + 2] = 255; od8[i + 3] = 255;
        continue;
      }
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      const dx = sx - x0, dy = sy - y0;
      const idx = (y0 * sc.width + x0) * 4;
      const idx2 = idx + 4;
      const idx3 = idx + sc.width * 4;
      const idx4 = idx3 + 4;
      for (let k = 0; k < 3; k++) {
        const v = sd[idx + k] * (1 - dx) * (1 - dy) +
                  sd[idx2 + k] * dx * (1 - dy) +
                  sd[idx3 + k] * (1 - dx) * dy +
                  sd[idx4 + k] * dx * dy;
        od8[i + k] = v;
      }
      od8[i + 3] = 255;
    }
  }
  applyFilter(od8, page.filter);
  octx.putImageData(od, 0, 0);
  return out;
}

export function DocumentScanner({ open, onOpenChange, outputAs = 'pdf', fileBaseName = 'scan', onComplete }: Props) {
  const [pages, setPages] = useState<Page[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewSize, setPreviewSize] = useState({ w: 0, h: 0 });
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

  useEffect(() => { if (!open) { setPages([]); setActiveIdx(0); setDraggingIdx(null); } }, [open]);

  const addImageFile = async (f: File) => {
    if (!f.type.startsWith('image/')) { toast.error('รองรับเฉพาะไฟล์รูปภาพ'); return; }
    const dataUrl = await new Promise<string>((res) => {
      const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(f);
    });
    const img = await loadImage(dataUrl);
    const W = img.naturalWidth, H = img.naturalHeight;
    const ins = DEFAULT_INSET;
    const corners: Corner[] = [
      { x: W * ins, y: H * ins },
      { x: W * (1 - ins), y: H * ins },
      { x: W * (1 - ins), y: H * (1 - ins) },
      { x: W * ins, y: H * (1 - ins) },
    ];
    setPages((p) => {
      const next = [...p, { id: Math.random().toString(36).slice(2), src: dataUrl, width: W, height: H, corners, filter: 'enhance' as Filter }];
      setActiveIdx(next.length - 1);
      return next;
    });
  };

  const onPickFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) await addImageFile(f);
  };

  const active = pages[activeIdx];

  useEffect(() => {
    if (!active || !previewRef.current) { setPreviewSize({ w: 0, h: 0 }); return; }
    const el = previewRef.current;
    const update = () => {
      const cw = el.clientWidth;
      const ratio = active.height / active.width;
      let targetW = cw;
      let targetH = cw * ratio;
      const maxH = Math.min(window.innerHeight * 0.55, 520);
      if (targetH > maxH) { targetH = maxH; targetW = targetH / ratio; }
      setPreviewSize({ w: targetW, h: targetH });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [active]);

  const updateCorner = (i: number, x: number, y: number) => {
    if (!active) return;
    const nx = Math.max(0, Math.min(active.width, x));
    const ny = Math.max(0, Math.min(active.height, y));
    setPages((p) => {
      const next = [...p];
      const cs = [...next[activeIdx].corners];
      cs[i] = { x: nx, y: ny };
      next[activeIdx] = { ...next[activeIdx], corners: cs };
      return next;
    });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (draggingIdx === null || !active || !previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const sx = (px / previewSize.w) * active.width;
    const sy = (py / previewSize.h) * active.height;
    updateCorner(draggingIdx, sx, sy);
  };

  const setFilter = (f: Filter) => {
    setPages((p) => {
      const next = [...p];
      next[activeIdx] = { ...next[activeIdx], filter: f };
      return next;
    });
  };

  const rotateActive = async () => {
    if (!active) return;
    const img = await loadImage(active.src);
    const c = document.createElement('canvas');
    c.width = img.naturalHeight; c.height = img.naturalWidth;
    const ctx = c.getContext('2d')!;
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    const dataUrl = c.toDataURL('image/jpeg', 0.92);
    const W = c.width, H = c.height;
    const ins = DEFAULT_INSET;
    setPages((p) => {
      const next = [...p];
      next[activeIdx] = {
        ...next[activeIdx],
        src: dataUrl,
        width: W,
        height: H,
        corners: [
          { x: W * ins, y: H * ins },
          { x: W * (1 - ins), y: H * ins },
          { x: W * (1 - ins), y: H * (1 - ins) },
          { x: W * ins, y: H * (1 - ins) },
        ],
      };
      return next;
    });
  };

  const removePage = (i: number) => {
    setPages((p) => p.filter((_, idx) => idx !== i));
    setActiveIdx((idx) => Math.max(0, Math.min(idx, pages.length - 2)));
  };

  const finish = async () => {
    if (pages.length === 0) { toast.error('ยังไม่มีหน้าที่จะบันทึก'); return; }
    setBusy(true);
    try {
      const canvases = await Promise.all(pages.map(warpPage));
      if (outputAs === 'images') {
        const files: File[] = await Promise.all(canvases.map((cv, i) =>
          new Promise<File>((res) => cv.toBlob((b) => res(new File([b!], `${fileBaseName}-${i + 1}.jpg`, { type: 'image/jpeg' })), 'image/jpeg', 0.9))
        ));
        onComplete(files);
      } else {
        const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        canvases.forEach((cv, i) => {
          if (i > 0) pdf.addPage();
          const ratio = Math.min(pageW / cv.width, pageH / cv.height);
          const w = cv.width * ratio;
          const h = cv.height * ratio;
          const x = (pageW - w) / 2;
          const y = (pageH - h) / 2;
          pdf.addImage(cv.toDataURL('image/jpeg', 0.85), 'JPEG', x, y, w, h);
        });
        const blob = pdf.output('blob');
        onComplete([new File([blob], `${fileBaseName}-${Date.now()}.pdf`, { type: 'application/pdf' })]);
      }
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error('สแกนไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  // Compute corner pixel positions for preview
  const previewCorners = active ? active.corners.map((c) => ({
    x: (c.x / active.width) * previewSize.w,
    y: (c.y / active.height) * previewSize.h,
  })) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[95vw] max-h-[95vh] overflow-y-auto p-0">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle>สแกนเอกสาร</DialogTitle>
        </DialogHeader>

        <div className="px-4 pb-4 space-y-3">
          {/* Capture buttons */}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => cameraRef.current?.click()} variant="default" className="flex-1 min-w-[140px]">
              <Camera className="w-4 h-4 mr-2" /> ถ่ายรูป
            </Button>
            <Button onClick={() => galleryRef.current?.click()} variant="secondary" className="flex-1 min-w-[140px]">
              <ImageIcon className="w-4 h-4 mr-2" /> เลือกจากแกลเลอรี
            </Button>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPickFiles(e.target.files)} />
            <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onPickFiles(e.target.files)} />
          </div>

          {/* Editor */}
          {active ? (
            <>
              <div
                ref={previewRef}
                className="relative w-full bg-muted rounded-md overflow-hidden touch-none select-none mx-auto"
                style={{ height: previewSize.h || 320 }}
                onPointerMove={onPointerMove}
                onPointerUp={() => setDraggingIdx(null)}
                onPointerCancel={() => setDraggingIdx(null)}
                onPointerLeave={() => setDraggingIdx(null)}
              >
                {previewSize.w > 0 && (
                  <>
                    <img
                      src={active.src}
                      alt="scan"
                      className="absolute top-0 left-1/2 -translate-x-1/2 pointer-events-none"
                      style={{ width: previewSize.w, height: previewSize.h }}
                      draggable={false}
                    />
                    <svg
                      className="absolute top-0 left-1/2 -translate-x-1/2 pointer-events-none"
                      width={previewSize.w}
                      height={previewSize.h}
                    >
                      <polygon
                        points={previewCorners.map((p) => `${p.x},${p.y}`).join(' ')}
                        fill="hsl(217 91% 60% / 0.2)"
                        stroke="hsl(217 91% 60%)"
                        strokeWidth={2}
                      />
                    </svg>
                    <div
                      className="absolute top-0 left-1/2 -translate-x-1/2"
                      style={{ width: previewSize.w, height: previewSize.h }}
                    >
                      {previewCorners.map((p, i) => (
                        <button
                          key={i}
                          type="button"
                          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDraggingIdx(i); }}
                          className="absolute w-7 h-7 rounded-full bg-primary border-2 border-background shadow-md -translate-x-1/2 -translate-y-1/2 touch-none"
                          style={{ left: p.x, top: p.y }}
                          aria-label={`มุม ${i + 1}`}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Filters & actions */}
              <div className="flex flex-wrap gap-2">
                {([
                  ['original', 'ต้นฉบับ'],
                  ['enhance', 'เพิ่มความชัด'],
                  ['gray', 'เทา'],
                  ['bw', 'ขาว-ดำ'],
                ] as [Filter, string][]).map(([k, l]) => (
                  <Button key={k} size="sm" variant={active.filter === k ? 'default' : 'outline'} onClick={() => setFilter(k)}>{l}</Button>
                ))}
                <Button size="sm" variant="outline" onClick={rotateActive}><RotateCw className="w-4 h-4 mr-1" /> หมุน</Button>
                <Button size="sm" variant="outline" onClick={() => removePage(activeIdx)} className="text-destructive"><Trash2 className="w-4 h-4 mr-1" /> ลบหน้า</Button>
              </div>

              {/* Thumbs */}
              <div className="flex gap-2 overflow-x-auto pb-1">
                {pages.map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setActiveIdx(i)}
                    className={`relative shrink-0 w-16 h-20 rounded border-2 overflow-hidden ${i === activeIdx ? 'border-primary' : 'border-border'}`}
                  >
                    <img src={p.src} alt="" className="w-full h-full object-cover" />
                    <span className="absolute bottom-0 right-0 bg-background/80 text-[10px] px-1">{i + 1}</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => galleryRef.current?.click()}
                  className="shrink-0 w-16 h-20 rounded border-2 border-dashed flex items-center justify-center text-muted-foreground hover:bg-muted"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </>
          ) : (
            <div className="border-2 border-dashed rounded-md p-8 text-center text-muted-foreground">
              เริ่มต้นโดยถ่ายรูปหรือเลือกรูปเอกสาร
            </div>
          )}

          <div className="flex gap-2 pt-2 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">ยกเลิก</Button>
            <Button onClick={finish} disabled={busy || pages.length === 0} className="flex-1">
              {busy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> กำลังประมวลผล</> : <><Check className="w-4 h-4 mr-2" /> เสร็จสิ้น ({pages.length})</>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * ปรับขนาด/ครอปรูปอัตโนมัติก่อนอัปโหลด (client-side, ไม่มี dependency ใหม่)
 * ครอปแบบ cover ให้ได้อัตราส่วนคงที่ → รูปไม่ยืด ไม่เพี้ยนในทุกขนาดหน้าจอ
 */
export type FitResult = { blob: Blob; url: string; width: number; height: number };

/** อัตราส่วนมาตรฐานของรูปในระบบ */
export const IMAGE_PRESETS = {
  hero: { width: 1600, height: 1200 },
  dashboard: { width: 1280, height: 720 },
} as const;

export async function fitImageToCover(
  file: Blob,
  target: { width: number; height: number },
  quality = 0.88,
): Promise<FitResult> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('อ่านไฟล์รูปไม่สำเร็จ'));
      el.src = url;
    });
    const { width: tw, height: th } = target;
    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('เบราว์เซอร์ไม่รองรับการปรับขนาดรูป');
    const scale = Math.max(tw / img.naturalWidth, th / img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (tw - dw) / 2, (th - dh) / 2, dw, dh);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality));
    if (!blob) throw new Error('แปลงรูปไม่สำเร็จ');
    return { blob, url: URL.createObjectURL(blob), width: tw, height: th };
  } finally {
    URL.revokeObjectURL(url);
  }
}

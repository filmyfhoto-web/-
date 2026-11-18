/**
 * Microphone capture that always produces a complete, decodable 16 kHz mono
 * WAV (works on iOS Safari, which records fragmented MP4 with MediaRecorder).
 */
export interface RecorderHandle {
  stop: () => Promise<Blob>;
  cancel: () => void;
}

function encodeWav(chunks: Float32Array[], sampleRate: number, targetRate = 16000): Blob {
  const length = chunks.reduce((s, c) => s + c.length, 0);
  const merged = new Float32Array(length);
  let o = 0;
  for (const c of chunks) { merged.set(c, o); o += c.length; }

  const ratio = Math.max(1, Math.round(sampleRate / targetRate));
  const outLen = Math.floor(merged.length / ratio);
  const buffer = new ArrayBuffer(44 + outLen * 2);
  const view = new DataView(buffer);
  const str = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  const rate = Math.round(sampleRate / ratio);

  str(0, 'RIFF'); view.setUint32(4, 36 + outLen * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  str(36, 'data'); view.setUint32(40, outLen * 2, true);

  for (let i = 0; i < outLen; i++) {
    const s = Math.max(-1, Math.min(1, merged[i * ratio]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

/** Thai-friendly error copy for every microphone failure mode. */
export function micErrorMessage(err: unknown): string {
  const name = (err as { name?: string })?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'ไม่ได้รับอนุญาตให้ใช้ไมโครโฟน กรุณาอนุญาตในเบราว์เซอร์';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'ไม่พบไมโครโฟนบนอุปกรณ์นี้';
  if (name === 'NotReadableError') return 'ไมโครโฟนถูกใช้งานโดยแอปอื่นอยู่';
  return 'เปิดไมโครโฟนไม่สำเร็จ กรุณาลองใหม่';
}

export async function startRecording(): Promise<RecorderHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const Ctx: typeof AudioContext =
    (window as any).AudioContext ?? (window as any).webkitAudioContext;
  const ctx = new Ctx();
  const src = ctx.createMediaStreamSource(stream);
  const node = ctx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  node.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  src.connect(node);
  node.connect(ctx.destination);

  const teardown = async () => {
    stream.getTracks().forEach((t) => t.stop());
    node.disconnect();
    src.disconnect();
    await ctx.close().catch(() => undefined);
  };

  return {
    async stop() {
      const rate = ctx.sampleRate;
      await teardown();
      return encodeWav(chunks, rate);
    },
    cancel() { void teardown(); },
  };
}

export const MIN_AUDIO_BYTES = 2048;
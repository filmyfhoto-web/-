/** อ่านไฟล์คำบรรยาย .srt เป็นรายการบรรทัด เพื่อแสดงตัวอย่างบนหน้าเว็บ */
export interface SrtCue {
  index: number;
  start: number;
  end: number;
  text: string;
}

function toSeconds(stamp: string): number {
  const m = stamp.trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/);
  if (!m) return 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000;
}

export function parseSrt(raw: string): SrtCue[] {
  const blocks = raw.replace(/\r/g, "").split(/\n{2,}/);
  const cues: SrtCue[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    if (lines.length < 2) continue;
    const timeLineIdx = lines.findIndex((l) => l.includes("-->"));
    if (timeLineIdx < 0) continue;
    const [from, to] = lines[timeLineIdx].split("-->");
    const text = lines.slice(timeLineIdx + 1).join(" ").trim();
    if (!text) continue;
    cues.push({
      index: cues.length + 1,
      start: toSeconds(from),
      end: toSeconds(to ?? from),
      text,
    });
  }
  return cues;
}

/** เวลาแบบ ม:วว สำหรับแสดงหน้าเว็บ */
export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

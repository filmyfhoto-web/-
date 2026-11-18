import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring } from "remotion";
import { C, thai } from "../theme";

export interface OutroStep {
  n: string;
  t: string;
  d: string;
}

const DEFAULT_STEPS: OutroStep[] = [
  { n: "1", t: "เปิดหน้าแรก", d: "filmyynatta.com" },
  { n: "2", t: "เลือกสินค้า", d: "แตะแท็บ “สินค้า”" },
  { n: "3", t: "ยืนยันผ่าน LINE", d: "ติดตามในงานของฉัน" },
];

/** ฉากปิด: สรุปขั้นตอน + ที่อยู่เว็บไซต์ */
export const Outro: React.FC<{ heading?: string; steps?: OutroStep[] }> = ({
  heading = "พร้อมสั่งซื้อแล้ว 🎉",
  steps = DEFAULT_STEPS,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const portrait = height > width;
  const s = (d: number) => spring({ frame: frame - d, fps, config: { damping: 200 } });

  return (
    <AbsoluteFill
      style={{
        fontFamily: thai,
        background: `linear-gradient(120deg, ${C.navy} 0%, #3B1B7A 60%, ${C.pink} 160%)`,
        color: C.white,
        justifyContent: "center",
        padding: portrait ? "0 80px" : "0 120px",
      }}
    >
      <div
        style={{
          opacity: s(0),
          transform: `translateY(${(1 - s(0)) * 30}px)`,
          fontSize: portrait ? 76 : 82,
          fontWeight: 800,
        }}
      >
        {heading}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: portrait ? "column" : "row",
          gap: portrait ? 22 : 28,
          marginTop: portrait ? 48 : 56,
        }}
      >
        {steps.map((x, i) => (
          <div
            key={x.n}
            style={{
              opacity: s(10 + i * 8),
              transform: `translateY(${(1 - s(10 + i * 8)) * 40}px)`,
              flex: 1,
              padding: portrait ? 30 : 34,
              borderRadius: 22,
              background: "rgba(255,255,255,0.10)",
              border: "1px solid rgba(255,255,255,0.22)",
            }}
          >
            <div style={{ fontSize: 30, fontWeight: 800, color: "#F2C6FF" }}>{x.n}</div>
            <div style={{ fontSize: 40, fontWeight: 700, marginTop: 12 }}>{x.t}</div>
            <div style={{ fontSize: 28, color: "#DCD3F7", marginTop: 10 }}>{x.d}</div>
          </div>
        ))}
      </div>
      <div
        style={{
          opacity: s(38),
          marginTop: portrait ? 56 : 66,
          fontSize: portrait ? 40 : 44,
          fontWeight: 700,
          letterSpacing: 2,
        }}
      >
        www.filmyynatta.com · NATTA GROUP
      </div>
    </AbsoluteFill>
  );
};

import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { C, thai } from "../theme";

export const Canvas: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame / 90) * 30;
  return (
    <AbsoluteFill style={{ background: C.canvas, fontFamily: thai, color: C.ink }}>
      <div
        style={{
          position: "absolute",
          width: 1100,
          height: 1100,
          borderRadius: "50%",
          top: -420 + drift,
          right: -280,
          background: `radial-gradient(circle at 40% 40%, ${C.light}33, transparent 62%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 900,
          height: 900,
          borderRadius: "50%",
          bottom: -400 - drift,
          left: -260,
          background: `radial-gradient(circle at 60% 60%, ${C.pink}22, transparent 62%)`,
        }}
      />
      {children}
    </AbsoluteFill>
  );
};

/** ตัวเลขขั้นตอน + หัวข้อ + คำอธิบาย (เข้าแบบเบลอ-คม + ขยับขึ้น) */
export const StepText: React.FC<{
  step: string;
  title: string;
  lines: string[];
  delay?: number;
  /** เลย์เอาต์แนวตั้ง 9:16 — ตัวอักษรใหญ่ขึ้นและกว้างเต็มจอ */
  portrait?: boolean;
}> = ({ step, title, lines, delay = 0, portrait = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rise = (d: number) => {
    const s = spring({ frame: frame - delay - d, fps, config: { damping: 200 } });
    return {
      opacity: s,
      filter: `blur(${(1 - s) * 10}px)`,
      transform: `translateY(${(1 - s) * 34}px)`,
    };
  };
  return (
    <div style={{ maxWidth: portrait ? "100%" : 760 }}>
      <div
        style={{
          ...rise(0),
          display: "inline-flex",
          alignItems: "center",
          gap: 14,
          padding: "10px 22px 10px 10px",
          borderRadius: 999,
          background: C.white,
          border: `1px solid ${C.purple}22`,
          boxShadow: "0 10px 26px rgba(18,16,79,0.08)",
          marginBottom: portrait ? 24 : 30,
        }}
      >
        <span
          style={{
            width: 44,
            height: 44,
            borderRadius: 999,
            display: "grid",
            placeItems: "center",
            color: C.white,
            fontWeight: 800,
            fontSize: 22,
            background: `linear-gradient(135deg, ${C.purple}, ${C.pink})`,
          }}
        >
          {step}
        </span>
        <span style={{ fontSize: portrait ? 30 : 24, fontWeight: 700, color: C.purple }}>
          ขั้นตอนที่ {step}
        </span>
      </div>
      <h2
        style={{
          ...rise(6),
          fontSize: portrait ? 68 : 76,
          lineHeight: 1.16,
          fontWeight: 800,
          margin: 0,
        }}
      >
        {title}
      </h2>
      <div
        style={{
          marginTop: portrait ? 26 : 34,
          display: "flex",
          flexDirection: "column",
          gap: portrait ? 14 : 18,
        }}
      >
        {lines.map((l, i) => (
          <div
            key={l}
            style={{
              ...rise(14 + i * 7),
              display: "flex",
              gap: 16,
              alignItems: "flex-start",
              fontSize: portrait ? 34 : 34,
              color: C.muted,
              lineHeight: 1.45,
            }}
          >
            <span
              style={{
                marginTop: 16,
                width: 12,
                height: 12,
                borderRadius: 999,
                background: `linear-gradient(135deg, ${C.purple}, ${C.pink})`,
                flexShrink: 0,
              }}
            />
            <span>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

/** แถบความคืบหน้าด้านล่างจอ */
export const Progress: React.FC<{ index: number; total: number }> = ({ index, total }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const portrait = height > width;
  const grow = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: portrait ? 74 : 66,
        display: "flex",
        gap: 12,
        justifyContent: portrait ? "center" : "flex-start",
        paddingLeft: portrait ? 0 : 96,
      }}
    >
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            width: i === index ? 74 * grow + 26 : 26,
            height: 8,
            borderRadius: 999,
            background:
              i === index ? `linear-gradient(90deg, ${C.purple}, ${C.pink})` : `${C.navy}1f`,
          }}
        />
      ))}
    </div>
  );
};

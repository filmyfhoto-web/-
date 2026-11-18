import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { C, thai } from "../theme";
import { Phone } from "../components/Phone";

/** ฉากเปิด: โลโก้ NATTA GROUP + หัวเรื่องวิดีโอสอนใช้งาน */
export const Intro: React.FC<{
  line1?: string;
  line2?: string;
  sub?: string;
  img?: string;
  scrollTo?: number;
}> = ({
  line1 = "วิธีสั่งซื้อสินค้า",
  line2 = "ผ่านเว็บไซต์ร้าน",
  sub = "ใช้เวลาไม่ถึง 1 นาที — เปิดหน้าแรก เลือกสินค้า แล้วยืนยันผ่าน LINE",
  img = "images/home.png",
  scrollTo = 120,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const portrait = height > width;
  const s = (d: number) => spring({ frame: frame - d, fps, config: { damping: 200 } });
  const wipe = interpolate(frame, [8, 40], [100, 0], {
    extrapolateRight: "clamp",
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });

  return (
    <AbsoluteFill
      style={{
        fontFamily: thai,
        background: `linear-gradient(125deg, ${C.navy} 0%, ${C.navy2} 45%, #4A1E8A 100%)`,
        color: C.white,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 1200,
          height: 1200,
          borderRadius: "50%",
          right: -300,
          bottom: -520,
          background: `radial-gradient(circle, ${C.pink}55, transparent 60%)`,
        }}
      />
      <div
        style={
          portrait
            ? { position: "absolute", left: 72, right: 72, top: 150 }
            : { position: "absolute", left: 110, top: 250, width: 1020 }
        }
      >
        <div
          style={{
            opacity: s(0),
            fontSize: 28,
            letterSpacing: 8,
            fontWeight: 700,
            color: "#C7B6FF",
            marginBottom: 26,
          }}
        >
          NATTA GROUP · เชียงกลาง น่าน
        </div>
        <div style={{ overflow: "hidden" }}>
          <h1
            style={{
              margin: 0,
              fontSize: portrait ? 84 : 104,
              fontWeight: 800,
              lineHeight: 1.14,
              clipPath: `inset(0 ${wipe}% 0 0)`,
            }}
          >
            {line1}
            <br />
            <span
              style={{
                background: `linear-gradient(90deg, #F0A6FF, #8B5CF6)`,
                WebkitBackgroundClip: "text",
                color: "transparent",
              }}
            >
              {line2}
            </span>
          </h1>
        </div>
        <p
          style={{
            opacity: s(24),
            transform: `translateY(${(1 - s(24)) * 24}px)`,
            fontSize: portrait ? 34 : 36,
            color: "#D7CEF5",
            marginTop: 34,
            lineHeight: 1.5,
          }}
        >
          {sub}
        </p>
      </div>
      <div
        style={
          portrait
            ? {
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 40,
                display: "grid",
                placeItems: "center",
              }
            : { position: "absolute", right: 150, top: 130 }
        }
      >
        <div style={portrait ? { transform: "scale(1.12)" } : undefined}>
          <Phone src={img} delay={14} rotate={portrait ? -3 : -6} scrollTo={scrollTo} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

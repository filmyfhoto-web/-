import React from "react";
import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C, thai } from "./theme";
import { SHOTS, useShotMotion, type Shot } from "./RealDemoVideo";

/**
 * เวอร์ชันแนวตั้ง 9:16 (1080x1920) ของวิดีโอสอน “เรียล”
 * ใช้ภาพหน้าจอชุดเดียวกัน แต่ครอปเข้าจุดโฟกัสและวางคำบรรยายใหญ่สำหรับมือถือ/โซเชียล
 */

const INTRO = 84;
/** Safe area สำหรับจอมีรอยบาก/แถบล่าง (iPhone, IG/TikTok UI) */
const SAFE_TOP = 190;
const SAFE_BOTTOM = 230;
const SAFE_X = 64;
const OUTRO = 100;
export const REAL_DEMO_VERTICAL_DURATION =
  INTRO + SHOTS.reduce((s, x) => s + x.dur, 0) + OUTRO;

const Bg: React.FC = () => {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame / 90) * 22;
  return (
    <AbsoluteFill
      style={{ background: `linear-gradient(160deg, ${C.navy} 0%, ${C.navy2} 55%, #2A1B63 100%)` }}
    >
      <div
        style={{
          position: "absolute",
          width: 900,
          height: 900,
          borderRadius: "50%",
          left: -280 + drift,
          top: -260,
          background: `radial-gradient(circle, ${C.purple}55, transparent 62%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 860,
          height: 860,
          borderRadius: "50%",
          right: -300 - drift,
          bottom: -260,
          background: `radial-gradient(circle, ${C.pink}44, transparent 62%)`,
        }}
      />
    </AbsoluteFill>
  );
};

const Cursor: React.FC<{ tapAt: number }> = ({ tapAt }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const press = spring({ frame: frame - tapAt, fps, config: { damping: 12, stiffness: 220 } });
  const ring = interpolate(frame - tapAt, [0, 26], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const scale = 1 - press * 0.2 + (frame > tapAt + 10 ? press * 0.2 : 0);
  return (
    <div style={{ position: "absolute", left: "50%", top: "50%" }}>
      {frame >= tapAt && (
        <div
          style={{
            position: "absolute",
            left: -80,
            top: -80,
            width: 160,
            height: 160,
            borderRadius: "50%",
            border: `6px solid ${C.pink}`,
            opacity: 1 - ring,
            transform: `scale(${0.3 + ring * 1.1})`,
          }}
        />
      )}
      <div
        style={{
          position: "absolute",
          left: -26,
          top: -26,
          width: 52,
          height: 52,
          borderRadius: "50%",
          background: "rgba(255,255,255,.92)",
          border: `5px solid ${C.purple}`,
          boxShadow: "0 10px 30px rgba(0,0,0,.35)",
          transform: `scale(${scale})`,
        }}
      />
    </div>
  );
};

const Screen: React.FC<{ shot: Shot; index: number }> = ({ shot, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 22 });
  const out = interpolate(frame, [shot.dur - 14, shot.dur], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // ครอปแรงกว่าแนวนอนเพื่อให้อ่านออกบนจอมือถือ
  const m = useShotMotion(shot, frame, { baseZoom: 0.34, panSpan: 0.12 });
  const z = m.z;
  // แนวตั้งครอปแคบ — ดึงจุดโฟกัสเข้ากลางเพื่อไม่ให้ติดขอบว่าง
  const px = Math.min(0.66, Math.max(0.34, m.px));
  const py = Math.min(0.72, Math.max(0.24, m.py));

  return (
    <AbsoluteFill
      style={{
        opacity: out,
        padding: `${SAFE_TOP}px ${SAFE_X}px ${SAFE_BOTTOM}px`,
        justifyContent: "center",
      }}
    >
      {/* หัวเรื่อง */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 18,
          opacity: enter,
          transform: `translateY(${interpolate(enter, [0, 1], [-24, 0])}px)`,
        }}
      >
        <div
          style={{
            fontFamily: thai,
            fontWeight: 800,
            fontSize: 34,
            color: C.white,
            background: `linear-gradient(120deg, ${C.purple}, ${C.pink})`,
            padding: "12px 30px",
            borderRadius: 18,
          }}
        >
          {shot.chip}
        </div>
        <div style={{ fontFamily: thai, fontWeight: 700, fontSize: 30, color: "rgba(255,255,255,.6)" }}>
          {index + 1}/{SHOTS.length}
        </div>
      </div>

      <div
        style={{
          fontFamily: thai,
          fontWeight: 800,
          fontSize: 72,
          lineHeight: 1.14,
          color: C.white,
          marginTop: 26,
          opacity: enter,
        }}
      >
        {shot.title}
      </div>

      {/* หน้าจอจริง */}
      <div
        style={{
          marginTop: 34,
          height: 900,
          borderRadius: 30,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,.16)",
          background: "#0C0A22",
          boxShadow: "0 40px 110px rgba(0,0,0,.6)",
          opacity: enter,
          transform: `translateY(${interpolate(enter, [0, 1], [40, 0])}px)`,
          position: "relative",
        }}
      >
        <div
          style={{
            height: 56,
            background: "rgba(255,255,255,.07)",
            display: "flex",
            alignItems: "center",
            gap: 10,
            paddingInline: 22,
          }}
        >
          {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
            <div key={c} style={{ width: 14, height: 14, borderRadius: 99, background: c }} />
          ))}
          <div
            style={{
              marginLeft: 16,
              fontFamily: thai,
              color: "rgba(255,255,255,.72)",
              fontSize: 24,
              background: "rgba(255,255,255,.08)",
              padding: "6px 22px",
              borderRadius: 99,
            }}
          >
            filmyynatta.com
          </div>
        </div>
        <div style={{ position: "relative", width: "100%", height: 844, overflow: "hidden" }}>
          <Img
            src={staticFile(`images/real/${shot.file}`)}
            style={{
              position: "absolute",
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "top center",
              transform: `scale(${z})`,
              transformOrigin: `${px * 100}% ${py * 100}%`,
            }}
          />
          {shot.tapAt !== undefined && (
            <div style={{ position: "absolute", left: `${shot.focus.x * 100}%`, top: `${shot.focus.y * 100}%` }}>
              <Cursor tapAt={shot.tapAt} />
            </div>
          )}
        </div>
      </div>

      {/* คำบรรยาย */}
      <div
        style={{
          marginTop: 34,
          background: "rgba(10,8,32,.86)",
          border: "1px solid rgba(255,255,255,.14)",
          borderRadius: 26,
          padding: "26px 32px",
          opacity: enter,
        }}
      >
        <div style={{ fontFamily: thai, fontWeight: 500, fontSize: 40, lineHeight: 1.35, color: "rgba(255,255,255,.92)" }}>
          {shot.sub}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 14, stiffness: 120 } });
  const s2 = spring({ frame: frame - 12, fps, config: { damping: 18 } });
  const fade = interpolate(frame, [INTRO - 14, INTRO], [1, 0], { extrapolateLeft: "clamp" });
  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        padding: `${SAFE_TOP}px 90px ${SAFE_BOTTOM}px`,
        opacity: fade,
      }}
    >
      <div style={{ fontFamily: thai, fontWeight: 800, fontSize: 34, letterSpacing: 8, color: C.light, opacity: s }}>
        NATTA GROUP
      </div>
      <div
        style={{
          fontFamily: thai,
          fontWeight: 800,
          fontSize: 118,
          lineHeight: 1.1,
          color: C.white,
          marginTop: 20,
          opacity: s,
          transform: `translateY(${interpolate(s, [0, 1], [46, 0])}px)`,
        }}
      >
        สั่งของกับร้าน
        <br />
        และเขียนใบเบิก
      </div>
      <div
        style={{
          fontFamily: thai,
          fontSize: 44,
          color: "rgba(255,255,255,.84)",
          marginTop: 26,
          opacity: s2,
        }}
      >
        สอนจากหน้าจอจริง · ทำตามได้ใน 2 นาที
      </div>
    </AbsoluteFill>
  );
};

const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 16 } });
  const rows = [
    "สั่งสินค้า: หน้าแรก → สินค้า → แตะการ์ด → ตะกร้า → ส่งคำสั่งซื้อ",
    "ใบเขียนเบิก: กรอกหัวเอกสาร → วางตาราง → จัดเรียง → ส่งให้ร้าน",
    "ใบเขียนเบิกเป็นเอกสารประมาณการ ไม่ตัดสต๊อก",
  ];
  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        padding: `${SAFE_TOP}px 70px ${SAFE_BOTTOM}px`,
      }}
    >
      <div
        style={{
          fontFamily: thai,
          fontWeight: 800,
          fontSize: 92,
          color: C.white,
          opacity: s,
          transform: `scale(${interpolate(s, [0, 1], [0.86, 1])})`,
        }}
      >
        เริ่มใช้งานได้เลย
      </div>
      <div style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 18 }}>
        {rows.map((r, i) => {
          const rs = spring({ frame: frame - 12 - i * 9, fps, config: { damping: 18 } });
          return (
            <div
              key={r}
              style={{
                fontFamily: thai,
                fontSize: 36,
                color: "rgba(255,255,255,.9)",
                background: "rgba(255,255,255,.08)",
                border: "1px solid rgba(255,255,255,.14)",
                borderRadius: 20,
                padding: "18px 30px",
                opacity: rs,
                transform: `translateY(${interpolate(rs, [0, 1], [24, 0])}px)`,
              }}
            >
              {r}
            </div>
          );
        })}
      </div>
      <div
        style={{
          marginTop: 46,
          fontFamily: thai,
          fontWeight: 800,
          fontSize: 48,
          color: C.white,
          background: `linear-gradient(120deg, ${C.purple}, ${C.pink})`,
          padding: "18px 52px",
          borderRadius: 22,
          opacity: spring({ frame: frame - 40, fps, config: { damping: 18 } }),
        }}
      >
        filmyynatta.com
      </div>
    </AbsoluteFill>
  );
};

export const RealDemoVertical: React.FC = () => {
  let at = INTRO;
  return (
    <AbsoluteFill style={{ backgroundColor: C.navy }}>
      <Bg />
      <Sequence durationInFrames={INTRO}>
        <Intro />
      </Sequence>
      {SHOTS.map((shot, i) => {
        const from = at;
        at += shot.dur;
        return (
          <Sequence key={shot.file} from={from} durationInFrames={shot.dur}>
            <Screen shot={shot} index={i} />
          </Sequence>
        );
      })}
      <Sequence from={at} durationInFrames={OUTRO}>
        <Outro />
      </Sequence>
    </AbsoluteFill>
  );
};

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

/**
 * Reels 9:16 — โชว์ “หน้าจอแอปจริง” เป็นพระเอกเต็มเฟรม
 * ภาพถ่ายจากระบบจริงในโหมดมือถือ (1170x2532)
 */

type Cut = {
  file: string;
  step: string;
  title: string;
  sub: string;
  /** ตำแหน่งเริ่ม/จบของการเลื่อนดูจอ 0..1 */
  from: number;
  to: number;
  dur: number;
  tap?: { x: number; y: number; at: number };
};

const INTRO = 66;
const OUTRO = 96;

// กรอบหน้าจอ (พื้นที่แสดงแอป)
const FRAME_TOP = 250;
const FRAME_H = 1330;
const FRAME_W = 900;
const FRAME_X = (1080 - FRAME_W) / 2;

export const CUTS: Cut[] = [
  {
    file: "m01_home.png",
    step: "1",
    title: "เปิดแอปร้าน",
    sub: "เข้า filmyynatta.com — หน้าแรกของ NATTA GROUP",
    from: 0,
    to: 0.12,
    dur: 130,
    tap: { x: 0.5, y: 0.82, at: 86 },
  },
  {
    file: "m03_shop.png",
    step: "2",
    title: "แตะแท็บ “สินค้า”",
    sub: "เห็นหมวดป้ายไวนิล สติ๊กเกอร์ ตรายาง เครื่องเขียน",
    from: 0,
    to: 0.24,
    dur: 145,
    tap: { x: 0.3, y: 0.955, at: 30 },
  },
  {
    file: "m04_shop_scroll.png",
    step: "3",
    title: "เลื่อนดูสินค้าจริง",
    sub: "ราคาและสถานะ “รับได้ทันที” อัปเดตจากสต๊อกจริง",
    from: 0.1,
    to: 0.5,
    dur: 150,
  },
  {
    file: "m05_shop_scroll2.png",
    step: "4",
    title: "แตะสินค้าที่ต้องการ",
    sub: "เลือกจำนวนแล้วใส่ตะกร้าได้ทันทีจากการ์ดสินค้า",
    from: 0.15,
    to: 0.45,
    dur: 140,
    tap: { x: 0.62, y: 0.44, at: 74 },
  },
  {
    file: "m02_home_scroll.png",
    step: "5",
    title: "หมวดบริการของร้าน",
    sub: "เครื่องพิมพ์ · เครื่องเขียน · ป้าย & สติกเกอร์ · อุปกรณ์สำนักงาน",
    from: 0.05,
    to: 0.32,
    dur: 135,
  },
  {
    file: "m06_req.png",
    step: "6",
    title: "สร้างใบเขียนเบิก",
    sub: "กรอกชื่อโรงเรียน โครงการ ผู้จัดทำ และวันที่",
    from: 0,
    to: 0.3,
    dur: 150,
  },
  {
    file: "m07_req_scroll.png",
    step: "7",
    title: "Smart Import วางจาก Excel",
    sub: "คัดลอกตารางจาก Excel/Sheets มาวาง ระบบแยกรายการให้เอง",
    from: 0.1,
    to: 0.45,
    dur: 150,
  },
  {
    file: "m08_req_scroll2.png",
    step: "8",
    title: "ส่งรายการให้ร้าน",
    sub: "ยอดรวมคำนวณอัตโนมัติ · เอกสารประมาณการ ไม่ตัดสต๊อก",
    from: 0.25,
    to: 0.6,
    dur: 155,
    tap: { x: 0.5, y: 0.92, at: 96 },
  },
];

export const APP_REELS_DURATION =
  INTRO + CUTS.reduce((s, c) => s + c.dur, 0) + OUTRO;

const Bg: React.FC = () => {
  const frame = useCurrentFrame();
  const d = Math.sin(frame / 110) * 26;
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(165deg, ${C.navy} 0%, ${C.navy2} 52%, #2A1B63 100%)`,
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 980,
          height: 980,
          borderRadius: "50%",
          left: -320 + d,
          top: -300,
          background: `radial-gradient(circle, ${C.purple}55, transparent 62%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 920,
          height: 920,
          borderRadius: "50%",
          right: -330 - d,
          bottom: -280,
          background: `radial-gradient(circle, ${C.pink}44, transparent 62%)`,
        }}
      />
    </AbsoluteFill>
  );
};

const Tap: React.FC<{ at: number }> = ({ at }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < at - 12) return null;
  const press = spring({ frame: frame - at, fps, config: { damping: 13, stiffness: 220 } });
  const ring = interpolate(frame - at, [0, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div style={{ position: "absolute", left: 0, top: 0 }}>
      {frame >= at && (
        <div
          style={{
            position: "absolute",
            left: -95,
            top: -95,
            width: 190,
            height: 190,
            borderRadius: "50%",
            border: `7px solid ${C.pink}`,
            opacity: 1 - ring,
            transform: `scale(${0.25 + ring * 1.15})`,
          }}
        />
      )}
      <div
        style={{
          position: "absolute",
          left: -34,
          top: -34,
          width: 68,
          height: 68,
          borderRadius: "50%",
          background: "rgba(255,255,255,.92)",
          border: `6px solid ${C.purple}`,
          boxShadow: "0 12px 34px rgba(0,0,0,.4)",
          transform: `scale(${1 - press * 0.18})`,
        }}
      />
    </div>
  );
};

const Scene: React.FC<{ cut: Cut; index: number }> = ({ cut, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 20 });
  const out = interpolate(frame, [cut.dur - 12, cut.dur], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ภาพต้นฉบับ 1170x2532 → แสดงเต็มความกว้างกรอบ
  const imgH = (FRAME_W * 2532) / 1170;
  const maxScroll = Math.max(0, imgH - FRAME_H);
  const p = interpolate(frame, [10, cut.dur - 10], [cut.from, cut.to], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const offsetY = -p * maxScroll;

  return (
    <AbsoluteFill style={{ opacity: out }}>
      {/* หัวข้อขั้นตอน */}
      <div
        style={{
          position: "absolute",
          top: 78,
          left: FRAME_X,
          right: FRAME_X,
          display: "flex",
          alignItems: "center",
          gap: 18,
          opacity: enter,
          transform: `translateY(${interpolate(enter, [0, 1], [-20, 0])}px)`,
        }}
      >
        <div
          style={{
            fontFamily: thai,
            fontWeight: 800,
            fontSize: 30,
            color: C.white,
            background: `linear-gradient(120deg, ${C.purple}, ${C.pink})`,
            padding: "10px 26px",
            borderRadius: 999,
          }}
        >
          ขั้นที่ {cut.step}/{CUTS.length}
        </div>
        <div
          style={{
            fontFamily: thai,
            fontWeight: 800,
            fontSize: 52,
            color: C.white,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {cut.title}
        </div>
      </div>

      {/* หน้าจอแอปจริง */}
      <div
        style={{
          position: "absolute",
          left: FRAME_X,
          top: FRAME_TOP,
          width: FRAME_W,
          height: FRAME_H,
          borderRadius: 44,
          overflow: "hidden",
          background: "#fff",
          border: "10px solid rgba(255,255,255,.14)",
          boxShadow: "0 50px 130px rgba(0,0,0,.6)",
          opacity: enter,
          transform: `translateY(${interpolate(enter, [0, 1], [40, 0])}px) scale(${interpolate(
            enter,
            [0, 1],
            [0.97, 1],
          )})`,
        }}
      >
        <Img
          src={staticFile(`images/reels/${cut.file}`)}
          style={{
            position: "absolute",
            left: 0,
            top: offsetY,
            width: FRAME_W,
            height: imgH,
          }}
        />
        {cut.tap && (
          <div
            style={{
              position: "absolute",
              left: cut.tap.x * FRAME_W,
              top: cut.tap.y * FRAME_H,
            }}
          >
            <Tap at={cut.tap.at} />
          </div>
        )}
        {/* เงาขอบบน/ล่างให้ดูเป็นจอ */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            boxShadow: "inset 0 0 90px rgba(12,10,34,.18)",
            pointerEvents: "none",
          }}
        />
      </div>

      {/* คำบรรยายสั้น */}
      <div
        style={{
          position: "absolute",
          left: FRAME_X,
          right: FRAME_X,
          top: FRAME_TOP + FRAME_H + 34,
          background: "rgba(10,8,32,.82)",
          border: "1px solid rgba(255,255,255,.16)",
          borderRadius: 26,
          padding: "24px 30px",
          opacity: enter,
        }}
      >
        <div
          style={{
            fontFamily: thai,
            fontWeight: 500,
            fontSize: 38,
            lineHeight: 1.32,
            color: "rgba(255,255,255,.94)",
          }}
        >
          {cut.sub}
        </div>
      </div>

      {/* ตัวบอกความคืบหน้า */}
      <div
        style={{
          position: "absolute",
          bottom: 96,
          left: FRAME_X,
          right: FRAME_X,
          display: "flex",
          gap: 10,
        }}
      >
        {CUTS.map((_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 8,
              borderRadius: 99,
              background:
                i < index
                  ? "rgba(255,255,255,.55)"
                  : i === index
                    ? C.pink
                    : "rgba(255,255,255,.18)",
            }}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
};

const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 15, stiffness: 120 } });
  const s2 = spring({ frame: frame - 10, fps, config: { damping: 18 } });
  const fade = interpolate(frame, [INTRO - 12, INTRO], [1, 0], { extrapolateLeft: "clamp" });
  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: "0 90px", opacity: fade }}>
      <div style={{ fontFamily: thai, fontWeight: 800, fontSize: 34, letterSpacing: 8, color: C.light, opacity: s }}>
        NATTA GROUP
      </div>
      <div
        style={{
          fontFamily: thai,
          fontWeight: 800,
          fontSize: 116,
          lineHeight: 1.1,
          color: C.white,
          marginTop: 22,
          opacity: s,
          transform: `translateY(${interpolate(s, [0, 1], [46, 0])}px)`,
        }}
      >
        สั่งของ · เขียนใบเบิก
        <br />
        จบในแอปเดียว
      </div>
      <div style={{ fontFamily: thai, fontSize: 44, color: "rgba(255,255,255,.85)", marginTop: 26, opacity: s2 }}>
        ดูจากหน้าจอจริงของร้าน
      </div>
    </AbsoluteFill>
  );
};

const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 16 } });
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: "0 80px" }}>
      <div
        style={{
          fontFamily: thai,
          fontWeight: 800,
          fontSize: 96,
          color: C.white,
          textAlign: "center",
          opacity: s,
          transform: `scale(${interpolate(s, [0, 1], [0.88, 1])})`,
        }}
      >
        เริ่มสั่งได้เลยวันนี้
      </div>
      <div
        style={{
          marginTop: 42,
          fontFamily: thai,
          fontWeight: 800,
          fontSize: 52,
          color: C.white,
          background: `linear-gradient(120deg, ${C.purple}, ${C.pink})`,
          padding: "22px 60px",
          borderRadius: 24,
          opacity: spring({ frame: frame - 18, fps, config: { damping: 18 } }),
        }}
      >
        filmyynatta.com
      </div>
      <div
        style={{
          marginTop: 30,
          fontFamily: thai,
          fontSize: 36,
          color: "rgba(255,255,255,.86)",
          opacity: spring({ frame: frame - 30, fps, config: { damping: 18 } }),
        }}
      >
        ใบเขียนเบิกเป็นเอกสารประมาณการ · ไม่ตัดสต๊อก
      </div>
    </AbsoluteFill>
  );
};

export const AppReels: React.FC = () => {
  let at = INTRO;
  return (
    <AbsoluteFill style={{ backgroundColor: C.navy }}>
      <Bg />
      <Sequence durationInFrames={INTRO}>
        <Intro />
      </Sequence>
      {CUTS.map((cut, i) => {
        const from = at;
        at += cut.dur;
        return (
          <Sequence key={cut.file} from={from} durationInFrames={cut.dur}>
            <Scene cut={cut} index={i} />
          </Sequence>
        );
      })}
      <Sequence from={at} durationInFrames={OUTRO}>
        <Outro />
      </Sequence>
    </AbsoluteFill>
  );
};

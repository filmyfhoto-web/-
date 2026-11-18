import React from "react";
import {
  AbsoluteFill,
  Easing,
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
 * Reels 9:16 “แนะนำเว็บไซต์” — เลื่อน / ซูม / โชว์ฟังก์ชัน
 * ใช้ภาพหน้าเว็บจริง (เดสก์ท็อป 1440 กว้าง) ในกรอบเบราว์เซอร์
 */

type Shot = {
  file: string;
  imgW: number;
  imgH: number;
  step: string;
  title: string;
  sub: string;
  /** จุดเริ่ม/จบของการเลื่อน+ซูม (y เป็นพิกเซลของภาพต้นฉบับ, x เป็นสัดส่วน 0..1) */
  from: { y: number; zoom: number; x?: number };
  to: { y: number; zoom: number; x?: number };
  dur: number;
  tap?: { x: number; y: number; at: number };
};

const INTRO = 72;
const OUTRO = 104;

// กรอบเบราว์เซอร์ (safe area บน/ล่างสำหรับ UI ของ Reels)
const WIN_W = 1000;
const WIN_H = 1040;
const WIN_X = (1080 - WIN_W) / 2;
const WIN_TOP = 300;
const BAR_H = 62;

const HOME = { file: "s01_home.png", imgW: 1440, imgH: 3400 };
const SHOP = { file: "s02_shop.png", imgW: 1440, imgH: 3000 };
const REQ = { file: "s05_req_c.png", imgW: 940, imgH: 830 };

export const SHOTS: Shot[] = [
  {
    ...HOME,
    step: "1",
    title: "หน้าแรกของร้าน",
    sub: "เข้า filmyynatta.com — เมนูครบทั้งสั่งซื้อ ติดตามงาน และติดต่อร้าน",
    from: { y: 0, zoom: 1.02 },
    to: { y: 150, zoom: 1.14 },
    dur: 232,
  },
  {
    ...HOME,
    step: "2",
    title: "บริการครบในที่เดียว",
    sub: "เครื่องพิมพ์ · เครื่องเขียน · ป้าย & สติกเกอร์ · อุปกรณ์สำนักงาน",
    from: { y: 120, zoom: 1.2, x: 0.62 },
    to: { y: 300, zoom: 1.34, x: 0.68 },
    dur: 252,
  },
  {
    ...HOME,
    step: "3",
    title: "ดูคลิปสั้น แล้วสั่งได้เลย",
    sub: "มีคลิปสอนใช้งาน และปุ่มลัดเข้าสู่การสั่งซื้อทันทีจากหน้าแรก",
    from: { y: 620, zoom: 1.26 },
    to: { y: 900, zoom: 1.4 },
    dur: 229,
    tap: { x: 0.76, y: 0.36, at: 140 },
  },
  {
    ...HOME,
    step: "4",
    title: "เวลาเปิดร้าน · ติดต่อเรา",
    sub: "เบอร์โทร ที่อยู่ และ LINE Official อยู่ท้ายหน้าแรก ทักได้ทุกวัน",
    from: { y: 1790, zoom: 1.14, x: 0.5 },
    to: { y: 1960, zoom: 1.24, x: 0.5 },
    dur: 200,
  },
  {
    ...SHOP,
    step: "5",
    title: "หน้าสั่งซื้อสินค้า",
    sub: "ค้นหาสินค้า หรือเลือกตามหมวดหมู่ได้จากแถบด้านบน",
    from: { y: 0, zoom: 1.12 },
    to: { y: 240, zoom: 1.05 },
    dur: 162,
    tap: { x: 0.4, y: 0.16, at: 58 },
  },
  {
    ...SHOP,
    step: "6",
    title: "ราคาและสต๊อกจริง",
    sub: "รายการสินค้าพร้อมราคาและจำนวนคงเหลือ อัปเดตจากสต๊อกจริงของร้าน",
    from: { y: 1000, zoom: 1.0 },
    to: { y: 2200, zoom: 1.0 },
    dur: 224,
  },
  {
    ...SHOP,
    step: "7",
    title: "ใส่ตะกร้า · ส่งผ่าน LINE",
    sub: "ตะกร้าอยู่ข้างขวา สรุปยอดอัตโนมัติ แล้วส่งคำสั่งซื้อได้ทันที",
    from: { y: 900, zoom: 1.5, x: 0.68 },
    to: { y: 1040, zoom: 1.62, x: 0.72 },
    dur: 201,
    tap: { x: 0.62, y: 0.42, at: 118 },
  },
  {
    ...REQ,
    step: "8",
    title: "สร้างใบเขียนเบิก",
    sub: "กรอกชื่อโรงเรียน โครงการ ผู้จัดทำ และวันที่ — ใช้ยื่นขออนุมัติได้เลย",
    from: { y: 0, zoom: 1.14 },
    to: { y: 40, zoom: 1.2 },
    dur: 241,
  },
  {
    ...REQ,
    step: "9",
    title: "วางจาก Excel · รวมยอดให้เอง",
    sub: "Smart Import แยกรายการอัตโนมัติ แล้วกด “ส่งรายการให้ร้าน” · ไม่ตัดสต๊อก",
    from: { y: 100, zoom: 1.32, x: 0.5 },
    to: { y: 200, zoom: 1.4, x: 0.58 },
    dur: 244,
    tap: { x: 0.72, y: 0.5, at: 150 },
  },
];


export const SITE_REELS_DURATION =
  INTRO + SHOTS.reduce((s, c) => s + c.dur, 0) + OUTRO;


const ease = Easing.bezier(0.33, 0, 0.16, 1);

const Bg: React.FC = () => {
  const frame = useCurrentFrame();
  const d = Math.sin(frame / 120) * 24;
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(168deg, ${C.navy} 0%, ${C.navy2} 55%, #2A1B63 100%)`,
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 1000,
          height: 1000,
          borderRadius: "50%",
          left: -330 + d,
          top: -320,
          background: `radial-gradient(circle, ${C.purple}55, transparent 62%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 940,
          height: 940,
          borderRadius: "50%",
          right: -340 - d,
          bottom: -300,
          background: `radial-gradient(circle, ${C.pink}44, transparent 62%)`,
        }}
      />
    </AbsoluteFill>
  );
};

const Tap: React.FC<{ at: number }> = ({ at }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < at - 10) return null;
  const press = spring({ frame: frame - at, fps, config: { damping: 13, stiffness: 220 } });
  const ring = interpolate(frame - at, [0, 32], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div style={{ position: "absolute", left: 0, top: 0 }}>
      {frame >= at && (
        <div
          style={{
            position: "absolute",
            left: -90,
            top: -90,
            width: 180,
            height: 180,
            borderRadius: "50%",
            border: `7px solid ${C.pink}`,
            opacity: 1 - ring,
            transform: `scale(${0.25 + ring * 1.1})`,
          }}
        />
      )}
      <div
        style={{
          position: "absolute",
          left: -32,
          top: -32,
          width: 64,
          height: 64,
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

const Scene: React.FC<{ shot: Shot; index: number }> = ({ shot, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 22 });
  const out = interpolate(frame, [shot.dur - 12, shot.dur], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const t = interpolate(frame, [6, shot.dur - 6], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });

  const zoom = interpolate(t, [0, 1], [shot.from.zoom, shot.to.zoom]);
  const y = interpolate(t, [0, 1], [shot.from.y, shot.to.y]);
  const xFocus = interpolate(t, [0, 1], [shot.from.x ?? 0.5, shot.to.x ?? 0.5]);

  const viewH = WIN_H - BAR_H;
  const baseScale = (WIN_W / shot.imgW) * zoom;
  const drawW = shot.imgW * baseScale;
  const drawH = shot.imgH * baseScale;
  const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
  const left = clamp(WIN_W / 2 - xFocus * drawW, Math.min(0, WIN_W - drawW), 0);
  const top = clamp(-y * baseScale, Math.min(0, viewH - drawH), 0);


  return (
    <AbsoluteFill style={{ opacity: out }}>
      {/* หัวข้อ */}
      <div
        style={{
          position: "absolute",
          top: 108,
          left: WIN_X,
          right: WIN_X,
          opacity: enter,
          transform: `translateY(${interpolate(enter, [0, 1], [-22, 0])}px)`,
        }}
      >
        <div
          style={{
            display: "inline-block",
            fontFamily: thai,
            fontWeight: 800,
            fontSize: 27,
            color: C.white,
            background: `linear-gradient(120deg, ${C.purple}, ${C.pink})`,
            padding: "9px 24px",
            borderRadius: 999,
          }}
        >
          ขั้นที่ {shot.step}/{SHOTS.length}
        </div>
        <div
          style={{
            fontFamily: thai,
            fontWeight: 800,
            fontSize: 60,
            lineHeight: 1.15,
            color: C.white,
            marginTop: 14,
          }}
        >
          {shot.title}
        </div>
      </div>

      {/* กรอบเบราว์เซอร์ */}
      <div
        style={{
          position: "absolute",
          left: WIN_X,
          top: WIN_TOP,
          width: WIN_W,
          height: WIN_H,
          borderRadius: 32,
          overflow: "hidden",
          background: "#fff",
          border: "8px solid rgba(255,255,255,.14)",
          boxShadow: "0 48px 120px rgba(0,0,0,.6)",
          opacity: enter,
          transform: `translateY(${interpolate(enter, [0, 1], [44, 0])}px) scale(${interpolate(
            enter,
            [0, 1],
            [0.97, 1],
          )})`,
        }}
      >
        {/* แถบเบราว์เซอร์ */}
        <div
          style={{
            height: BAR_H,
            background: "#161331",
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "0 24px",
          }}
        >
          {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
            <div key={c} style={{ width: 15, height: 15, borderRadius: "50%", background: c }} />
          ))}
          <div
            style={{
              marginLeft: 16,
              flex: 1,
              height: 34,
              borderRadius: 999,
              background: "rgba(255,255,255,.10)",
              color: "rgba(255,255,255,.72)",
              fontFamily: thai,
              fontSize: 21,
              display: "flex",
              alignItems: "center",
              padding: "0 20px",
            }}
          >
            filmyynatta.com
          </div>
        </div>

        {/* พื้นที่หน้าเว็บ */}
        <div style={{ position: "relative", width: WIN_W, height: viewH, overflow: "hidden" }}>
          <Img
            src={staticFile(`images/site/${shot.file}`)}
            style={{
              position: "absolute",
              left,
              top,
              width: drawW,
              height: drawH,
            }}
          />
          {shot.tap && (
            <div style={{ position: "absolute", left: shot.tap.x * WIN_W, top: shot.tap.y * viewH }}>
              <Tap at={shot.tap.at} />
            </div>
          )}
          <div
            style={{
              position: "absolute",
              inset: 0,
              boxShadow: "inset 0 0 80px rgba(12,10,34,.16)",
            }}
          />
        </div>
      </div>

      {/* คำบรรยาย */}
      <div
        style={{
          position: "absolute",
          left: WIN_X,
          right: WIN_X,
          top: WIN_TOP + WIN_H + 40,
          background: "rgba(10,8,32,.82)",
          border: "1px solid rgba(255,255,255,.16)",
          borderRadius: 26,
          padding: "26px 30px",
          opacity: enter,
        }}
      >
        <div
          style={{
            fontFamily: thai,
            fontWeight: 500,
            fontSize: 37,
            lineHeight: 1.34,
            color: "rgba(255,255,255,.94)",
          }}
        >
          {shot.sub}
        </div>
      </div>

      {/* ความคืบหน้า */}
      <div
        style={{
          position: "absolute",
          bottom: 120,
          left: WIN_X,
          right: WIN_X,
          display: "flex",
          gap: 9,
        }}
      >
        {SHOTS.map((_, i) => (
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
  const s2 = spring({ frame: frame - 12, fps, config: { damping: 18 } });
  const fade = interpolate(frame, [INTRO - 12, INTRO], [1, 0], { extrapolateLeft: "clamp" });
  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: "0 92px", opacity: fade }}>
      <div
        style={{
          fontFamily: thai,
          fontWeight: 800,
          fontSize: 34,
          letterSpacing: 8,
          color: C.light,
          opacity: s,
        }}
      >
        NATTA GROUP
      </div>
      <div
        style={{
          fontFamily: thai,
          fontWeight: 800,
          fontSize: 112,
          lineHeight: 1.1,
          color: C.white,
          marginTop: 22,
          opacity: s,
          transform: `translateY(${interpolate(s, [0, 1], [48, 0])}px) scale(${interpolate(
            s,
            [0, 1],
            [1.08, 1],
          )})`,
        }}
      >
        พาทัวร์เว็บร้าน
        <br />
        ใน 1 คลิป

      </div>
      <div
        style={{
          fontFamily: thai,
          fontSize: 44,
          color: "rgba(255,255,255,.85)",
          marginTop: 26,
          opacity: s2,
        }}
      >
        สั่งของ · ขอราคา · เขียนใบเบิก จบในเว็บเดียว
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
          fontSize: 92,
          color: C.white,
          textAlign: "center",
          opacity: s,
          transform: `scale(${interpolate(s, [0, 1], [0.88, 1])})`,
        }}
      >
        ลองเข้าใช้งานได้เลย
      </div>
      <div
        style={{
          marginTop: 42,
          fontFamily: thai,
          fontWeight: 800,
          fontSize: 54,
          color: C.white,
          background: `linear-gradient(120deg, ${C.purple}, ${C.pink})`,
          padding: "22px 62px",
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
          textAlign: "center",
          opacity: spring({ frame: frame - 30, fps, config: { damping: 18 } }),
        }}
      >
        เพิ่มเพื่อนใน LINE เพื่อสอบถามและติดตามงาน
      </div>
    </AbsoluteFill>
  );
};

export const SiteReels: React.FC = () => {
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
          <Sequence key={`${shot.file}-${i}`} from={from} durationInFrames={shot.dur}>
            <Scene shot={shot} index={i} />
          </Sequence>
        );
      })}
      <Sequence from={at} durationInFrames={OUTRO}>
        <Outro />
      </Sequence>
    </AbsoluteFill>
  );
};

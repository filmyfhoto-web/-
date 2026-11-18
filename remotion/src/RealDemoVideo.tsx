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
 * “เรียล” walkthrough — ใช้ภาพหน้าจอจริงจากแอปร้าน (จับภาพจากระบบจริง)
 * ประกอบเป็นวิดีโอสอน 2 เรื่อง: สั่งซื้อสินค้า และ เขียนใบเบิก
 */

type Focus = { x: number; y: number }; // 0..1 ของภาพ

export type Motion = "hold" | "zoom" | "pan";

export type Shot = {
  file: string;
  chip: string;
  title: string;
  sub: string;
  focus: Focus;
  zoom: number;
  /** ลักษณะการเคลื่อนกล้อง: hold = นิ่ง, zoom = ซูมช้าๆ, pan = เลื่อนดูแบบสกรอลล์ */
  motion?: Motion;
  dur: number;
  tapAt?: number;
};

export const SHOTS: Shot[] = [
  {
    file: "01_home.png",
    chip: "ขั้นที่ 1",
    title: "เปิดเว็บร้าน",
    sub: "เข้า filmyynatta.com แล้วแตะเมนู “สั่งซื้อสินค้า” ด้านบน",
    focus: { x: 0.48, y: 0.1 },
    zoom: 1.1,
    motion: "zoom",
    dur: 120,
    tapAt: 70,
  },
  {
    file: "02_shop.png",
    chip: "ขั้นที่ 2",
    title: "เลือกหมวดสินค้า",
    sub: "ค้นหาชื่อสินค้า หรือแตะหมวด เช่น เครื่องเขียน · ป้ายไวนิล",
    focus: { x: 0.42, y: 0.6 },
    zoom: 1.12,
    motion: "pan",
    dur: 120,
    tapAt: 72,
  },
  {
    file: "03_products.png",
    chip: "ขั้นที่ 3",
    title: "ดูราคาและสต๊อกจริง",
    sub: "ทุกการ์ดแสดงรหัส ราคา และจำนวนคงเหลือแบบเรียลไทม์",
    focus: { x: 0.5, y: 0.42 },
    zoom: 1.12,
    motion: "pan",
    dur: 120,
  },
  {
    file: "04_detail.png",
    chip: "ขั้นที่ 4",
    title: "แตะเพื่อใส่ตะกร้า",
    sub: "แตะการ์ดสินค้า 1 ครั้ง = เพิ่มลงตะกร้าทันที",
    focus: { x: 0.5, y: 0.42 },
    zoom: 1.16,
    motion: "zoom",
    dur: 135,
    tapAt: 60,
  },
  {
    file: "05_cart.png",
    chip: "ขั้นที่ 5",
    title: "ตรวจตะกร้า แล้วส่งคำสั่งซื้อ",
    sub: "เลือกรับหน้าร้าน/จัดส่ง · ใส่คูปองส่วนลด · กรอกชื่อผู้สั่ง",
    focus: { x: 0.78, y: 0.5 },
    zoom: 1.12,
    motion: "zoom",
    dur: 150,
    tapAt: 92,
  },
  {
    file: "05_req.png",
    chip: "ใบเบิก 1",
    title: "เปิดหน้า “สร้างใบเขียนเบิก”",
    sub: "เอกสารประมาณการ — ไม่ตัดสต๊อกของร้าน",
    focus: { x: 0.3, y: 0.2 },
    zoom: 1.08,
    motion: "hold",
    dur: 120,
    tapAt: 66,
  },
  {
    file: "06_req_filled.png",
    chip: "ใบเบิก 2",
    title: "กรอกหัวเอกสาร",
    sub: "ชื่อโรงเรียน/หน่วยงาน · ชื่อโครงการ · ผู้จัดทำ · วันที่",
    focus: { x: 0.45, y: 0.2 },
    zoom: 1.12,
    motion: "pan",
    dur: 130,
  },
  {
    file: "07_paste.png",
    chip: "ใบเบิก 3",
    title: "วางตารางจาก Excel ได้เลย",
    sub: "คัดลอกจาก Excel/Google Sheets → วาง → กด “จัดเรียงรายการ”",
    focus: { x: 0.55, y: 0.48 },
    zoom: 1.12,
    motion: "zoom",
    dur: 145,
    tapAt: 96,
  },
  {
    file: "08_items.png",
    chip: "ใบเบิก 4",
    title: "ระบบแยกรายการและรวมยอดให้",
    sub: "แก้ราคา/จำนวนได้ทันที · ยอดรวมคำนวณอัตโนมัติ · บันทึกร่างหรือส่งให้ร้าน",
    focus: { x: 0.58, y: 0.62 },
    zoom: 1.12,
    motion: "pan",
    dur: 155,
  },
];

const INTRO = 90;
const OUTRO = 105;
const TOTAL = INTRO + SHOTS.reduce((s, x) => s + x.dur, 0) + OUTRO;

export const REAL_DEMO_DURATION = TOTAL;

const Bg: React.FC = () => {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame / 90) * 24;
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, ${C.navy} 0%, ${C.navy2} 55%, #2A1B63 100%)`,
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 1100,
          height: 1100,
          borderRadius: "50%",
          left: -320 + drift,
          top: -420,
          background: `radial-gradient(circle, ${C.purple}55, transparent 62%)`,
          filter: "blur(12px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 900,
          height: 900,
          borderRadius: "50%",
          right: -260 - drift,
          bottom: -380,
          background: `radial-gradient(circle, ${C.pink}44, transparent 62%)`,
          filter: "blur(12px)",
        }}
      />
    </AbsoluteFill>
  );
};

const Cursor: React.FC<{ tapAt: number }> = ({ tapAt }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const press = spring({
    frame: frame - tapAt,
    fps,
    config: { damping: 12, stiffness: 220 },
  });
  const ringT = interpolate(frame - tapAt, [0, 26], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const scale = 1 - press * 0.22 + (frame > tapAt + 10 ? press * 0.22 : 0);
  return (
    <div style={{ position: "absolute", left: "50%", top: "50%" }}>
      {frame >= tapAt && (
        <div
          style={{
            position: "absolute",
            left: -90,
            top: -90,
            width: 180,
            height: 180,
            borderRadius: "50%",
            border: `6px solid ${C.pink}`,
            opacity: 1 - ringT,
            transform: `scale(${0.3 + ringT * 1.1})`,
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


/**
 * กล้องนุ่ม ๆ — ลดอาการลายตา
 * hold: แทบไม่ขยับ · zoom: ซูมเข้าช้า ๆ ครั้งเดียว · pan: ล็อกซูม แล้วเลื่อนดูเหมือนสกรอลล์
 */
export const useShotMotion = (
  shot: Shot,
  frame: number,
  opts?: { baseZoom?: number; panSpan?: number },
) => {
  const base = opts?.baseZoom ?? 0;
  const span = opts?.panSpan ?? 0.18;
  const ease = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: Easing.inOut(Easing.ease) };
  const t = interpolate(frame, [0, shot.dur], [0, 1], ease);
  const motion = shot.motion ?? "zoom";

  if (motion === "hold") {
    const z = shot.zoom + base + Math.sin(frame / 120) * 0.004;
    return { z, px: shot.focus.x, py: shot.focus.y };
  }
  if (motion === "pan") {
    const z = shot.zoom + base;
    const from = Math.max(0.08, shot.focus.y - span / 2);
    const to = Math.min(0.92, from + span);
    return { z, px: shot.focus.x, py: from + (to - from) * t };
  }
  const z = interpolate(t, [0, 1], [shot.zoom - 0.06 + base, shot.zoom + base]);
  return { z, px: shot.focus.x, py: shot.focus.y };
};

const Screen: React.FC<{ shot: Shot; index: number }> = ({ shot, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 24 });
  const out = interpolate(frame, [shot.dur - 14, shot.dur], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const { z, px, py } = useShotMotion(shot, frame);

  const capY = interpolate(enter, [0, 1], [70, 0]);

  return (
    <AbsoluteFill style={{ opacity: out }}>
      {/* หน้าต่างเบราว์เซอร์ */}
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          transform: `translateY(${interpolate(enter, [0, 1], [46, 0])}px)`,
          opacity: enter,
        }}
      >
        <div
          style={{
            width: 1420,
            height: 800,
            borderRadius: 22,
            overflow: "hidden",
            background: "#0C0A22",
            boxShadow: "0 50px 120px rgba(0,0,0,.55)",
            border: "1px solid rgba(255,255,255,.14)",
            marginTop: -108,
          }}
        >
          <div
            style={{
              height: 46,
              background: "rgba(255,255,255,.07)",
              display: "flex",
              alignItems: "center",
              gap: 10,
              paddingInline: 20,
              borderBottom: "1px solid rgba(255,255,255,.09)",
            }}
          >
            {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
              <div key={c} style={{ width: 13, height: 13, borderRadius: 99, background: c }} />
            ))}
            <div
              style={{
                marginLeft: 18,
                fontFamily: thai,
                color: "rgba(255,255,255,.72)",
                fontSize: 19,
                background: "rgba(255,255,255,.08)",
                padding: "5px 20px",
                borderRadius: 99,
              }}
            >
              filmyynatta.com
            </div>
          </div>
          <div style={{ position: "relative", width: "100%", height: 754, overflow: "hidden" }}>
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
              <div
                style={{
                  position: "absolute",
                  left: `${shot.focus.x * 100}%`,
                  top: `${shot.focus.y * 100}%`,
                }}
              >
                <Cursor tapAt={shot.tapAt} />
              </div>
            )}
          </div>
        </div>
      </AbsoluteFill>

      {/* แถบคำบรรยาย */}
      <div
        style={{
          position: "absolute",
          left: 96,
          bottom: 52,
          right: 96,
          transform: `translateY(${capY}px)`,
          opacity: enter,
          display: "flex",
          alignItems: "flex-end",
          gap: 26,
        }}
      >
        <div
          style={{
            fontFamily: thai,
            fontWeight: 800,
            fontSize: 26,
            color: C.white,
            background: `linear-gradient(120deg, ${C.purple}, ${C.pink})`,
            padding: "12px 26px",
            borderRadius: 16,
            whiteSpace: "nowrap",
            boxShadow: "0 14px 34px rgba(124,58,237,.45)",
          }}
        >
          {shot.chip}
        </div>
        <div
          style={{
            background: "rgba(10,8,32,.82)",
            border: "1px solid rgba(255,255,255,.14)",
            borderRadius: 20,
            padding: "18px 30px",
            flex: 1,
          }}
        >
          <div style={{ fontFamily: thai, fontWeight: 800, fontSize: 44, color: C.white, lineHeight: 1.15 }}>
            {shot.title}
          </div>
          <div style={{ fontFamily: thai, fontWeight: 400, fontSize: 27, color: "rgba(255,255,255,.82)", marginTop: 6 }}>
            {shot.sub}
          </div>
        </div>
        <div
          style={{
            fontFamily: thai,
            fontWeight: 700,
            fontSize: 24,
            color: "rgba(255,255,255,.62)",
            paddingBottom: 12,
          }}
        >
          {index + 1}/{SHOTS.length}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 14, stiffness: 120 } });
  const s2 = spring({ frame: frame - 14, fps, config: { damping: 18 } });
  const fadeOut = interpolate(frame, [INTRO - 16, INTRO], [1, 0], { extrapolateLeft: "clamp" });
  return (
    <AbsoluteFill
      style={{ justifyContent: "center", paddingLeft: 150, opacity: fadeOut }}
    >
      <div
        style={{
          fontFamily: thai,
          fontWeight: 800,
          fontSize: 30,
          letterSpacing: 6,
          color: C.light,
          opacity: s,
          transform: `translateX(${interpolate(s, [0, 1], [-60, 0])}px)`,
        }}
      >
        NATTA GROUP
      </div>
      <div
        style={{
          fontFamily: thai,
          fontWeight: 800,
          fontSize: 108,
          color: C.white,
          lineHeight: 1.1,
          marginTop: 14,
          opacity: s,
          transform: `translateY(${interpolate(s, [0, 1], [50, 0])}px)`,
        }}
      >
        สั่งของกับร้าน
        <br />
        และเขียนใบเบิก
      </div>
      <div
        style={{
          fontFamily: thai,
          fontSize: 38,
          color: "rgba(255,255,255,.82)",
          marginTop: 22,
          opacity: s2,
          transform: `translateY(${interpolate(s2, [0, 1], [30, 0])}px)`,
        }}
      >
        สอนจากหน้าจอจริงของระบบ · ทำตามได้ใน 2 นาที
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
    "ใบเขียนเบิก: กรอกหัวเอกสาร → วางตารางจาก Excel → จัดเรียง → ส่งให้ร้าน",
    "ใบเขียนเบิกเป็นเอกสารประมาณการ ไม่ตัดสต๊อกของร้าน",
  ];
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          fontFamily: thai,
          fontWeight: 800,
          fontSize: 84,
          color: C.white,
          opacity: s,
          transform: `scale(${interpolate(s, [0, 1], [0.86, 1])})`,
        }}
      >
        เริ่มใช้งานได้เลย
      </div>
      <div style={{ marginTop: 34, display: "flex", flexDirection: "column", gap: 16 }}>
        {rows.map((r, i) => {
          const rs = spring({ frame: frame - 12 - i * 9, fps, config: { damping: 18 } });
          return (
            <div
              key={r}
              style={{
                fontFamily: thai,
                fontSize: 32,
                color: "rgba(255,255,255,.88)",
                background: "rgba(255,255,255,.08)",
                border: "1px solid rgba(255,255,255,.14)",
                borderRadius: 16,
                padding: "14px 30px",
                opacity: rs,
                transform: `translateY(${interpolate(rs, [0, 1], [26, 0])}px)`,
              }}
            >
              {r}
            </div>
          );
        })}
      </div>
      <div
        style={{
          marginTop: 40,
          fontFamily: thai,
          fontWeight: 800,
          fontSize: 40,
          color: C.white,
          background: `linear-gradient(120deg, ${C.purple}, ${C.pink})`,
          padding: "16px 44px",
          borderRadius: 20,
          opacity: spring({ frame: frame - 44, fps, config: { damping: 18 } }),
        }}
      >
        filmyynatta.com
      </div>
    </AbsoluteFill>
  );
};

export const RealDemoVideo: React.FC = () => {
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

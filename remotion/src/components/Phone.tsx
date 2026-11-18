import React from "react";
import { Img, staticFile, useCurrentFrame, interpolate } from "remotion";
import { C } from "../theme";

/** ขนาดจอในเฟรมมือถือ (ภาพต้นฉบับ 860x1800 ⇒ สูงจริงเมื่อย่อ) */
const SCREEN_W = 406;
const SCREEN_H = 806;
const IMG_H = (1800 * SCREEN_W) / 860;

export interface FocusSpec {
  /** ตำแหน่งบนภาพต้นฉบับ 0..1 */
  fx: number;
  fy: number;
  /** กำลังขยาย */
  scale?: number;
  /** เฟรมที่เริ่มซูม (นับจากต้นฉาก) */
  start: number;
  /** จำนวนเฟรมที่ค้างไว้ */
  hold?: number;
  /** ข้อความกำกับปุ่มที่กด */
  label?: string;
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** โทรศัพท์จำลอง + ซูมเข้าไปที่ปุ่ม + เอฟเฟกต์นิ้วกด */
export const Phone: React.FC<{
  src: string;
  scrollTo?: number;
  delay?: number;
  rotate?: number;
  focus?: FocusSpec;
}> = ({ src, scrollTo = 0, delay = 0, rotate = -4, focus }) => {
  const frame = useCurrentFrame();
  const f = frame - delay;
  const enter = interpolate(f, [0, 28], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeOut,
  });
  const y = interpolate(f, [0, 80], [0, scrollTo], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => t * t * (3 - 2 * t),
  });
  const float = Math.sin(frame / 34) * 6;

  // --- ซูม + กด ---
  const hold = focus?.hold ?? 52;
  const zs = focus?.start ?? 0;
  const zoomScale = focus?.scale ?? 1.85;
  const zt = focus
    ? interpolate(frame, [zs, zs + 18, zs + 18 + hold, zs + 18 + hold + 16], [0, 1, 1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: easeOut,
      })
    : 0;
  const px = focus ? focus.fx * SCREEN_W : 0;
  const py = focus ? focus.fy * IMG_H - y : 0;
  const scale = 1 + (zoomScale - 1) * zt;

  // ระลอกคลื่นตอนกด
  const tapAt = zs + 22;
  const tapT = interpolate(frame, [tapAt, tapAt + 26], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const tapping = frame >= tapAt && frame <= tapAt + 30;
  const press = interpolate(frame, [tapAt - 6, tapAt, tapAt + 8], [0, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        width: 430,
        height: 830,
        borderRadius: 46,
        background: "#0C0A20",
        padding: 12,
        boxShadow: "0 40px 90px rgba(18,16,79,0.35)",
        overflow: "hidden",
        opacity: enter,
        transform: `translateY(${(1 - enter) * 60 + float}px) rotate(${rotate * enter * (1 - zt * 0.8)}deg) scale(${0.94 + enter * 0.06})`,
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 36,
          overflow: "hidden",
          background: C.white,
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            transform: `scale(${scale})`,
            transformOrigin: `${px}px ${py}px`,
          }}
        >
          <Img
            src={staticFile(src)}
            style={{ width: "100%", position: "absolute", top: -y, left: 0 }}
          />

          {focus && (
            <>
              {/* วงไฮไลต์ปุ่ม */}
              <div
                style={{
                  position: "absolute",
                  left: px,
                  top: py,
                  width: 84,
                  height: 84,
                  marginLeft: -42,
                  marginTop: -42,
                  borderRadius: 999,
                  border: `3px solid ${C.pink}`,
                  boxShadow: `0 0 0 6px ${C.pink}22`,
                  opacity: zt * 0.9,
                  transform: `scale(${(1 - press * 0.12) / scale + press * 0})`,
                }}
              />
              {/* ระลอกคลื่นตอนกด */}
              {tapping && (
                <div
                  style={{
                    position: "absolute",
                    left: px,
                    top: py,
                    width: 84,
                    height: 84,
                    marginLeft: -42,
                    marginTop: -42,
                    borderRadius: 999,
                    background: `${C.purple}33`,
                    border: `2px solid ${C.purple}`,
                    opacity: (1 - tapT) * 0.9,
                    transform: `scale(${(0.6 + tapT * 1.9) / scale})`,
                  }}
                />
              )}
              {/* นิ้วมือ */}
              <div
                style={{
                  position: "absolute",
                  left: px + 26,
                  top: py + 22,
                  width: 40,
                  height: 40,
                  borderRadius: 999,
                  background: "rgba(17,14,50,0.55)",
                  border: "2px solid rgba(255,255,255,0.85)",
                  opacity: zt,
                  transform: `scale(${(1 - press * 0.25) / scale})`,
                }}
              />
              {focus.label && (
                <div
                  style={{
                    position: "absolute",
                    left: px + (px > SCREEN_W * 0.5 ? -34 : 34),
                    top: py - 62,
                    transform: `translateX(${px > SCREEN_W * 0.5 ? "-100%" : "0"}) scale(${1 / scale})`,
                    transformOrigin: px > SCREEN_W * 0.5 ? "100% 100%" : "0 100%",

                    padding: "10px 18px",
                    borderRadius: 14,
                    background: `linear-gradient(135deg, ${C.purple}, ${C.pink})`,
                    color: C.white,
                    fontSize: 22,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    opacity: zt,
                    boxShadow: "0 12px 24px rgba(18,16,79,0.3)",
                  }}
                >
                  {focus.label}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

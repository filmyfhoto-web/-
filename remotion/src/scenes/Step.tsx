import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { Canvas, StepText, Progress } from "../components/Bits";
import { Phone, type FocusSpec } from "../components/Phone";

/**
 * ฉากขั้นตอน
 * - แนวนอน: ข้อความซ้าย + มือถือขวา
 * - แนวตั้ง (9:16): ข้อความด้านบน + มือถือใหญ่เต็มด้านล่าง อ่านง่ายบนมือถือ
 */
export const Step: React.FC<{
  step: string;
  title: string;
  lines: string[];
  img: string;
  scrollTo?: number;
  index: number;
  total: number;
  focus?: FocusSpec;
}> = ({ step, title, lines, img, scrollTo = 0, index, total, focus }) => {
  const { width, height } = useVideoConfig();
  const portrait = height > width;

  if (portrait) {
    return (
      <Canvas>
        <AbsoluteFill
          style={{
            padding: "96px 72px 150px",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div style={{ width: "100%" }}>
            <StepText step={step} title={title} lines={lines} portrait />
          </div>
          <div
            style={{
              flex: 1,
              width: "100%",
              display: "grid",
              placeItems: "center",
              marginTop: 24,
            }}
          >
            <div style={{ transform: "scale(1.22)", transformOrigin: "center center" }}>
              <Phone
                src={img}
                scrollTo={scrollTo}
                delay={8}
                rotate={index % 2 === 0 ? -2.5 : 2.5}
                focus={focus}
              />
            </div>
          </div>
        </AbsoluteFill>
        <Progress index={index} total={total} />
      </Canvas>
    );
  }

  return (
    <Canvas>
      <AbsoluteFill style={{ padding: "0 96px", flexDirection: "row", alignItems: "center" }}>
        <div style={{ flex: 1 }}>
          <StepText step={step} title={title} lines={lines} />
        </div>
        <div style={{ width: 560, display: "grid", placeItems: "center" }}>
          <Phone
            src={img}
            scrollTo={scrollTo}
            delay={8}
            rotate={index % 2 === 0 ? -4 : 4}
            focus={focus}
          />
        </div>
      </AbsoluteFill>
      <Progress index={index} total={total} />
    </Canvas>
  );
};

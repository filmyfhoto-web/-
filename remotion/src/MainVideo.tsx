import React from "react";
import { AbsoluteFill } from "remotion";
import { TransitionSeries, springTiming } from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import { fade } from "@remotion/transitions/fade";
import { Intro } from "./scenes/Intro";
import { Step } from "./scenes/Step";
import { Outro } from "./scenes/Outro";

const T = 18;

export const MainVideo: React.FC = () => (
  <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={140}>
        <Intro />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={springTiming({ config: { damping: 200 }, durationInFrames: T })}
      />
      <TransitionSeries.Sequence durationInFrames={165}>
        <Step
          index={0}
          total={3}
          step="1"
          title="เปิดหน้าแรกของร้าน"
          lines={[
            "พิมพ์ www.filmyynatta.com ในเบราว์เซอร์",
            "หรือแตะลิงก์ที่ร้านส่งให้ทาง LINE",
            "ไม่ต้องล็อกอินก็ดูสินค้าได้ทันที",
          ]}
          img="images/home.png"
          scrollTo={44}
          focus={{ fx: 0.28, fy: 0.845, scale: 1.9, start: 62, hold: 52, label: "เลือกหมวดที่สนใจ" }}
        />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={springTiming({ config: { damping: 200 }, durationInFrames: T })}
      />
      <TransitionSeries.Sequence durationInFrames={175}>
        <Step
          index={1}
          total={3}
          step="2"
          title="เลือกซื้อสินค้า"
          lines={[
            "แตะแท็บ “สินค้า” ด้านล่างจอ",
            "เลือกหมวด เช่น รูปติดบัตร ป้ายไวนิล สติ๊กเกอร์",
            "ค้นหาชื่อสินค้าได้จากช่องค้นหาด้านบน",
          ]}
          img="images/shop.png"
          scrollTo={44}
          focus={{ fx: 0.31, fy: 0.435, scale: 2, start: 62, hold: 56, label: "เลือกหมวดสินค้า" }}
        />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={springTiming({ config: { damping: 200 }, durationInFrames: T })}
      />
      <TransitionSeries.Sequence durationInFrames={175}>
        <Step
          index={2}
          total={3}
          step="3"
          title="ใส่ตะกร้าแล้วยืนยัน"
          lines={[
            "กด “เพิ่มลงตะกร้า” แล้วเปิดตะกร้าเพื่อตรวจรายการ",
            "เลือกสินค้าที่ต้องการ แล้วกด “ตรวจสอบก่อนสั่ง”",
            "ยืนยันตัวตนด้วย LINE แล้วรอรับแจ้งสถานะจากร้าน",
          ]}
          img="images/cart.png"
          scrollTo={40}
          focus={{
            fx: 0.753,
            fy: 0.9,
            scale: 1.9,
            start: 60,
            hold: 58,
            label: "ตรวจสอบก่อนสั่ง",
          }}
        />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={springTiming({ config: { damping: 200 }, durationInFrames: 20 })}
      />
      <TransitionSeries.Sequence durationInFrames={150}>
        <Outro />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
);

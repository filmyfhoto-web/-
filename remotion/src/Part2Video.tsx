import React from "react";
import { AbsoluteFill } from "remotion";
import { TransitionSeries, springTiming } from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import { fade } from "@remotion/transitions/fade";
import { Intro } from "./scenes/Intro";
import { Step } from "./scenes/Step";
import { Outro } from "./scenes/Outro";

const T = 18;

/** ตอนที่ 2: จากตะกร้า → แก้จำนวน → ส่งคำขอราคา → ติดตามสถานะ */
export const Part2Video: React.FC = () => (
  <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={140}>
        <Intro
          line1="ตะกร้า · ส่งคำขอราคา"
          line2="และติดตามสถานะงาน"
          sub="แก้จำนวนสินค้า ส่งคำขอราคา แล้วดูสถานะได้ที่ “งานของฉัน”"
          img="images/cart.png"
          scrollTo={60}
        />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={springTiming({ config: { damping: 200 }, durationInFrames: T })}
      />
      <TransitionSeries.Sequence durationInFrames={175}>
        <Step
          index={0}
          total={4}
          step="1"
          title="แก้จำนวนในตะกร้า"
          lines={[
            "กด + / − เพื่อเพิ่มหรือลดจำนวน",
            "กดถังขยะสีแดงเพื่อลบรายการที่ไม่ต้องการ",
            "ยอดรวมด้านล่างจะคำนวณให้อัตโนมัติ",
          ]}
          img="images/cart.png"
          focus={{ fx: 0.328, fy: 0.49, scale: 2.2, start: 58, hold: 60, label: "แตะ + เพิ่มจำนวน" }}
        />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={springTiming({ config: { damping: 200 }, durationInFrames: T })}
      />
      <TransitionSeries.Sequence durationInFrames={175}>
        <Step
          index={1}
          total={4}
          step="2"
          title="ส่งคำขอราคา"
          lines={[
            "ติ๊กเลือกรายการที่ต้องการสั่ง",
            "แนบไฟล์งาน/ระบุตัวเลือกได้ในแต่ละรายการ",
            "กด “ตรวจสอบก่อนสั่ง” เพื่อส่งคำขอให้ร้าน",
          ]}
          img="images/cart.png"
          scrollTo={40}
          focus={{
            fx: 0.753,
            fy: 0.9,
            scale: 2,
            start: 58,
            hold: 60,
            label: "ตรวจสอบก่อนสั่ง",
          }}
        />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={springTiming({ config: { damping: 200 }, durationInFrames: T })}
      />
      <TransitionSeries.Sequence durationInFrames={170}>
        <Step
          index={2}
          total={4}
          step="3"
          title="ยืนยันตัวตนด้วย LINE"
          lines={[
            "กดปุ่มสีเขียว “เข้าสู่ระบบด้วย LINE”",
            "อนุญาตเพียงครั้งเดียว ใช้ได้ทุกครั้งที่กลับมา",
            "ร้านจะติดต่อกลับและแจ้งสถานะทาง LINE",
          ]}
          img="images/line-login.png"
          focus={{
            fx: 0.49,
            fy: 0.475,
            scale: 1.9,
            start: 56,
            hold: 58,
            label: "เข้าสู่ระบบด้วย LINE",
          }}
        />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={springTiming({ config: { damping: 200 }, durationInFrames: T })}
      />
      <TransitionSeries.Sequence durationInFrames={175}>
        <Step
          index={3}
          total={4}
          step="4"
          title="ติดตามสถานะงาน"
          lines={[
            "แตะแท็บ “งานของฉัน” ด้านล่างจอ",
            "ดูรายการที่รอยืนยัน กำลังทำ และเสร็จแล้ว",
            "แจ้งเตือนใหม่จะขึ้นที่กระดิ่ง “แจ้งเตือน”",
          ]}
          img="images/shop.png"
          scrollTo={44}
          focus={{
            fx: 0.48,
            fy: 0.969,
            scale: 2.1,
            start: 58,
            hold: 58,
            label: "งานของฉัน",
          }}
        />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={springTiming({ config: { damping: 200 }, durationInFrames: 20 })}
      />
      <TransitionSeries.Sequence durationInFrames={150}>
        <Outro
          heading="ติดตามงานได้ตลอดเวลา 🎉"
          steps={[
            { n: "1", t: "แก้จำนวน", d: "ปุ่ม + / − ในตะกร้า" },
            { n: "2", t: "ส่งคำขอราคา", d: "ตรวจสอบก่อนสั่ง" },
            { n: "3", t: "ติดตามสถานะ", d: "แท็บ งานของฉัน" },
          ]}
        />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
);

import React from "react";
import { AbsoluteFill } from "remotion";
import { TransitionSeries, springTiming } from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import { fade } from "@remotion/transitions/fade";
import { Intro } from "./scenes/Intro";
import { Step } from "./scenes/Step";
import { Outro } from "./scenes/Outro";

const T = 18;

/** ตอนที่ 3: เขียน “ใบเขียนเบิก” สำหรับโรงเรียน/หน่วยงาน */
export const Part3Video: React.FC = () => (
  <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={140}>
        <Intro
          line1="สร้างใบเขียนเบิก"
          line2="สำหรับโรงเรียนและหน่วยงาน"
          sub="วางตารางจาก Excel ได้ทันที · เอกสารประมาณการ ไม่ตัดสต๊อก"
          img="images/req-landing.png"
          scrollTo={0}
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
          title="เปิดเมนู “ใบเขียนเบิก”"
          lines={[
            "เข้า www.filmyynatta.com ที่หน้าแรก",
            "เลื่อนลงมาที่การ์ด “สั่งซื้อสินค้า”",
            "แตะปุ่ม “ใบเขียนเบิก” สีขาวด้านล่าง",
          ]}
          img="images/req-landing.png"
          focus={{ fx: 0.52, fy: 0.5, scale: 1.75, start: 58, hold: 60, label: "ใบเขียนเบิก" }}
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
          title="กรอกหัวเอกสาร"
          lines={[
            "ใส่ชื่อโรงเรียน/หน่วยงาน และชื่อโครงการ",
            "ระบุผู้จัดทำและวันที่ของเอกสาร",
            "ป้าย “ไม่ตัดสต๊อก” = เป็นเอกสารประมาณการ",
          ]}
          img="images/req-form.png"
          focus={{ fx: 0.52, fy: 0.27, scale: 1.75, start: 56, hold: 58, label: "ชื่อโรงเรียน/หน่วยงาน" }}
        />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={springTiming({ config: { damping: 200 }, durationInFrames: T })}
      />
      <TransitionSeries.Sequence durationInFrames={180}>
        <Step
          index={2}
          total={4}
          step="3"
          title="วางตารางด้วย Smart Import"
          lines={[
            "คัดลอกตารางจาก Excel หรือ Google Sheets",
            "วางลงในกล่อง แล้วกด “จัดเรียงรายการ”",
            "ระบบแยกชื่อสินค้า ราคา และจำนวนให้อัตโนมัติ",
          ]}
          img="images/req-paste.png"
          scrollTo={40}
          focus={{ fx: 0.52, fy: 0.83, scale: 1.75, start: 60, hold: 62, label: "จัดเรียงรายการ" }}
        />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={springTiming({ config: { damping: 200 }, durationInFrames: T })}
      />
      <TransitionSeries.Sequence durationInFrames={180}>
        <Step
          index={3}
          total={4}
          step="4"
          title="ตรวจรายการแล้วส่งให้ร้าน"
          lines={[
            "แก้ราคา จำนวน หน่วย ได้ทุกบรรทัด",
            "ยอดรวมทั้งสิ้นคำนวณให้ทันที",
            "กด “ส่งรายการให้ร้าน” (เข้าสู่ระบบก่อนส่ง)",
          ]}
          img="images/req-items.png"
          focus={{ fx: 0.52, fy: 0.955, scale: 1.75, start: 60, hold: 62, label: "ส่งรายการให้ร้าน" }}
        />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={springTiming({ config: { damping: 200 }, durationInFrames: 20 })}
      />
      <TransitionSeries.Sequence durationInFrames={150}>
        <Outro
          heading="ส่งใบเขียนเบิกได้เลย 🎉"
          steps={[
            { n: "1", t: "เปิดใบเขียนเบิก", d: "จากหน้าแรกของร้าน" },
            { n: "2", t: "วางตารางรายการ", d: "Smart Import จาก Excel" },
            { n: "3", t: "ส่งให้ร้าน", d: "ร้านตรวจแล้วติดต่อกลับ" },
          ]}
        />
      </TransitionSeries.Sequence>

    </TransitionSeries>
  </AbsoluteFill>
);

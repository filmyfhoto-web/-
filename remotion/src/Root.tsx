import React from "react";
import { Composition } from "remotion";
import { MainVideo } from "./MainVideo";
import { Part2Video } from "./Part2Video";
import { Part3Video } from "./Part3Video";
import { RealDemoVideo, REAL_DEMO_DURATION } from "./RealDemoVideo";
import { RealDemoVertical, REAL_DEMO_VERTICAL_DURATION } from "./RealDemoVertical";
import { AppReels, APP_REELS_DURATION } from "./AppReels";
import { SiteReels, SITE_REELS_DURATION } from "./SiteReels";

// ตอนที่ 1: 140 + 165 + 175 + 175 + 150 = 805 − ทรานซิชัน (18*3 + 20 = 74) = 731
// ตอนที่ 2: 140 + 175 + 175 + 170 + 175 + 150 = 985 − ทรานซิชัน (18*4 + 20 = 92) = 893
// ตอนที่ 3: 140 + 175 + 175 + 180 + 180 + 150 = 1000 − ทรานซิชัน (18*4 + 20 = 92) = 908
export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="main"
      component={MainVideo}
      durationInFrames={731}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="part2"
      component={Part2Video}
      durationInFrames={893}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="part3"
      component={Part3Video}
      durationInFrames={908}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="main-vertical"
      component={MainVideo}
      durationInFrames={731}
      fps={30}
      width={1080}
      height={1920}
    />
    <Composition
      id="part2-vertical"
      component={Part2Video}
      durationInFrames={893}
      fps={30}
      width={1080}
      height={1920}
    />
    <Composition
      id="part3-vertical"
      component={Part3Video}
      durationInFrames={908}
      fps={30}
      width={1080}
      height={1920}
    />
    <Composition
      id="realdemo"
      component={RealDemoVideo}
      durationInFrames={REAL_DEMO_DURATION}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="realdemo-vertical"
      component={RealDemoVertical}
      durationInFrames={REAL_DEMO_VERTICAL_DURATION}
      fps={30}
      width={1080}
      height={1920}
    />
    <Composition
      id="app-reels"
      component={AppReels}
      durationInFrames={APP_REELS_DURATION}
      fps={30}
      width={1080}
      height={1920}
    />
    <Composition
      id="site-reels"
      component={SiteReels}
      durationInFrames={SITE_REELS_DURATION}
      fps={30}
      width={1080}
      height={1920}
    />
  </>
);


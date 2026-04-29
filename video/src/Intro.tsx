import { AbsoluteFill, Sequence } from "remotion";
import { loadFont } from "@remotion/google-fonts/NotoSansTC";
import { Title } from "./scenes/Title";
import { Pitch } from "./scenes/Pitch";
import { Flow } from "./scenes/Flow";
import { DemoEdit } from "./scenes/DemoEdit";
import { DemoImage } from "./scenes/DemoImage";
import { DemoAi } from "./scenes/DemoAi";
import { Closing } from "./scenes/Closing";
import { bg } from "./tokens";

const { fontFamily } = loadFont("normal", {
  weights: ["300", "400", "500"],
  subsets: ["[0]", "[6]", "[7]", "[19]", "[20]", "[21]", "[22]"],
  ignoreTooManyRequestsWarning: true,
});

const fontStack = `${fontFamily}, -apple-system, BlinkMacSystemFont, "Helvetica Neue", "Inter", Arial, sans-serif`;

export const Intro = () => (
  <AbsoluteFill
    style={{
      backgroundColor: bg,
      fontFamily: fontStack,
      fontWeight: 300,
      color: "#2D2A26",
    }}
  >
    {/* 0–3s · Title (90 frames) */}
    <Sequence from={0} durationInFrames={90}>
      <Title />
    </Sequence>
    {/* 3–7s · Pitch (120 frames) */}
    <Sequence from={90} durationInFrames={120}>
      <Pitch />
    </Sequence>
    {/* 7–10s · Flow (90 frames) */}
    <Sequence from={210} durationInFrames={90}>
      <Flow />
    </Sequence>
    {/* 10–18s · Demo 1: click to edit text (240 frames) */}
    <Sequence from={300} durationInFrames={240}>
      <DemoEdit />
    </Sequence>
    {/* 18–26s · Demo 2: image upload + resize (240 frames) */}
    <Sequence from={540} durationInFrames={240}>
      <DemoImage />
    </Sequence>
    {/* 26–36s · Demo 3: AI rewrite with diff (300 frames) */}
    <Sequence from={780} durationInFrames={300}>
      <DemoAi />
    </Sequence>
    {/* 36–40s · Closing (120 frames) */}
    <Sequence from={1080} durationInFrames={120}>
      <Closing />
    </Sequence>
  </AbsoluteFill>
);

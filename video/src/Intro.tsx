import { AbsoluteFill, Sequence } from "remotion";
import { loadFont } from "@remotion/google-fonts/NotoSansTC";
import { Title } from "./scenes/Title";
import { Pitch } from "./scenes/Pitch";
import { Flow } from "./scenes/Flow";
import { Features } from "./scenes/Features";
import { Closing } from "./scenes/Closing";
import { bg } from "./tokens";

const { fontFamily } = loadFont("normal", {
  weights: ["300", "400", "500"],
  subsets: ["[0]", "[6]", "[7]", "[19]", "[20]", "[21]", "[22]"],
  ignoreTooManyRequestsWarning: true,
});

// Fallback chain: Noto Sans TC for CJK, system sans-serif for Latin.
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
    {/* 0–3s · Title */}
    <Sequence from={0} durationInFrames={90}>
      <Title />
    </Sequence>
    {/* 3–8s · Pitch */}
    <Sequence from={90} durationInFrames={150}>
      <Pitch />
    </Sequence>
    {/* 8–12s · Flow */}
    <Sequence from={240} durationInFrames={120}>
      <Flow />
    </Sequence>
    {/* 12–20s · Features */}
    <Sequence from={360} durationInFrames={240}>
      <Features />
    </Sequence>
    {/* 20–25s · Closing */}
    <Sequence from={600} durationInFrames={150}>
      <Closing />
    </Sequence>
  </AbsoluteFill>
);

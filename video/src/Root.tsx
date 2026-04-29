import { Composition } from "remotion";
import { Intro } from "./Intro";

export const FPS = 30;
// Total: Title 3 + Pitch 4 + Flow 3 + DemoEdit 8 + DemoImage 8 + DemoAi 10 + Closing 4 = 40s
export const DURATION_FRAMES = 40 * FPS; // 1200 frames

export const RemotionRoot = () => (
  <>
    <Composition
      id="Intro"
      component={Intro}
      durationInFrames={DURATION_FRAMES}
      fps={FPS}
      width={1920}
      height={1080}
    />
  </>
);

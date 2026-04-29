import { Composition } from "remotion";
import { Intro } from "./Intro";

export const FPS = 30;
export const DURATION_FRAMES = 25 * FPS; // 25 seconds

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

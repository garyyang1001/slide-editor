import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { ink, gray } from "../tokens";

const ease = Easing.bezier(0.25, 0.46, 0.45, 0.94);

export const Title = () => {
  const frame = useCurrentFrame();

  const fade = interpolate(frame, [0, 30], [0, 1], {
    extrapolateRight: "clamp",
    easing: ease,
  });
  const liftY = interpolate(frame, [0, 30], [20, 0], {
    extrapolateRight: "clamp",
    easing: ease,
  });
  // Hold, then a gentle fade-out at the end
  const fadeOut = interpolate(frame, [70, 90], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        opacity: fade * fadeOut,
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            color: gray,
            fontSize: 22,
            letterSpacing: "0.18em",
            fontWeight: 400,
            textTransform: "uppercase",
            marginBottom: 56,
          }}
        >
          好事發生數位　·　Ohya Digital
        </div>
        <h1
          style={{
            fontFamily: "inherit",
            fontWeight: 300,
            fontSize: 168,
            margin: 0,
            letterSpacing: "0.02em",
            transform: `translateY(${liftY}px)`,
          }}
        >
          slide-editor
        </h1>
        <div
          style={{
            width: 200,
            height: 1,
            backgroundColor: ink,
            margin: "40px auto",
          }}
        />
        <div
          style={{
            fontSize: 32,
            fontWeight: 300,
            color: ink,
            letterSpacing: "0.04em",
          }}
        >
          瀏覽器內 HTML 簡報編輯器
        </div>
      </div>
    </AbsoluteFill>
  );
};

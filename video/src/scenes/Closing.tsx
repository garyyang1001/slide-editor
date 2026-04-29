import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { ink, gray, red } from "../tokens";

const ease = Easing.bezier(0.25, 0.46, 0.45, 0.94);

export const Closing = () => {
  const frame = useCurrentFrame();
  const fade = interpolate(frame, [0, 30], [0, 1], {
    extrapolateRight: "clamp",
    easing: ease,
  });
  const liftY = interpolate(frame, [0, 30], [20, 0], {
    extrapolateRight: "clamp",
    easing: ease,
  });
  const captionOpacity = interpolate(frame, [40, 60], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  const finalOpacity = interpolate(frame, [70, 90], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        opacity: fade,
      }}
    >
      <div
        style={{
          fontSize: 22,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: gray,
          marginBottom: 64,
          transform: `translateY(${liftY}px)`,
        }}
      >
        開源 · MIT License
      </div>
      <div
        style={{
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 64,
          fontWeight: 400,
          color: ink,
          letterSpacing: "0.02em",
          transform: `translateY(${liftY}px)`,
        }}
      >
        github.com/garyyang1001/slide-editor
      </div>
      <div
        style={{
          width: 320,
          height: 1,
          backgroundColor: ink,
          margin: "56px auto",
          opacity: captionOpacity,
        }}
      />
      <div
        style={{
          fontSize: 28,
          color: gray,
          opacity: captionOpacity,
          marginBottom: 16,
        }}
      >
        單檔 Python　·　零外部相依　·　Claude / Codex CLI
      </div>
      <div
        style={{
          fontSize: 24,
          color: ink,
          opacity: finalOpacity,
          marginTop: 64,
          letterSpacing: "0.05em",
        }}
      >
        好事發生數位　·　<span style={{ color: red }}>ohya.co</span>
      </div>
    </AbsoluteFill>
  );
};

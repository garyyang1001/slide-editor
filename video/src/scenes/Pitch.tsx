import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { ink, gray, red } from "../tokens";

const ease = Easing.bezier(0.25, 0.46, 0.45, 0.94);

const FadeLine: React.FC<{
  startFrame: number;
  fadeOutFrame: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ startFrame, fadeOutFrame, children, style }) => {
  const frame = useCurrentFrame();
  const opacity =
    interpolate(frame, [startFrame, startFrame + 18], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: ease,
    }) *
    interpolate(frame, [fadeOutFrame, fadeOutFrame + 18], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: ease,
    });
  const liftY = interpolate(
    frame,
    [startFrame, startFrame + 24],
    [12, 0],
    { extrapolateRight: "clamp", easing: ease }
  );
  return (
    <div style={{ ...style, opacity, transform: `translateY(${liftY}px)` }}>
      {children}
    </div>
  );
};

export const Pitch = () => (
  <AbsoluteFill
    style={{
      justifyContent: "center",
      alignItems: "flex-start",
      paddingLeft: 220,
      paddingRight: 220,
    }}
  >
    <div
      style={{
        color: gray,
        fontSize: 20,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        marginBottom: 56,
      }}
    >
      為什麼做這個
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
      <FadeLine
        startFrame={6}
        fadeOutFrame={140}
        style={{ fontSize: 64, fontWeight: 300, color: ink, lineHeight: 1.2 }}
      >
        Claude Design 出第一版很猛，
      </FadeLine>
      <FadeLine
        startFrame={36}
        fadeOutFrame={140}
        style={{ fontSize: 64, fontWeight: 300, color: ink, lineHeight: 1.2 }}
      >
        但每改一句話都要重灌整份 deck，
      </FadeLine>
      <FadeLine
        startFrame={72}
        fadeOutFrame={140}
        style={{ fontSize: 64, fontWeight: 500, color: red, lineHeight: 1.2 }}
      >
        token 燒得心痛。
      </FadeLine>
    </div>
  </AbsoluteFill>
);

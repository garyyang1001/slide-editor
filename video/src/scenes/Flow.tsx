import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { ink, gray, red, line, bgWarm } from "../tokens";

const ease = Easing.bezier(0.25, 0.46, 0.45, 0.94);

const FlowBox: React.FC<{
  startFrame: number;
  fadeOutFrame: number;
  caption: string;
  title: string;
  highlight?: boolean;
  width: number;
}> = ({ startFrame, fadeOutFrame, caption, title, highlight, width }) => {
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
    [16, 0],
    { extrapolateRight: "clamp", easing: ease }
  );
  return (
    <div
      style={{
        width,
        padding: "32px 40px",
        background: highlight ? ink : bgWarm,
        color: highlight ? "#F5F5F0" : ink,
        border: `1px solid ${highlight ? ink : line}`,
        opacity,
        transform: `translateY(${liftY}px)`,
        textAlign: "left",
      }}
    >
      <div
        style={{
          fontSize: 18,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: highlight ? "#D4D0C4" : gray,
          marginBottom: 16,
        }}
      >
        {caption}
      </div>
      <div
        style={{
          fontSize: 36,
          fontWeight: highlight ? 500 : 400,
          lineHeight: 1.3,
          whiteSpace: "pre-line",
        }}
      >
        {title}
      </div>
    </div>
  );
};

const Arrow: React.FC<{ startFrame: number; fadeOutFrame: number }> = ({
  startFrame,
  fadeOutFrame,
}) => {
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
  return (
    <div
      style={{
        opacity,
        fontSize: 60,
        fontWeight: 300,
        color: gray,
        margin: "0 8px",
        lineHeight: 1,
      }}
    >
      →
    </div>
  );
};

export const Flow = () => {
  const frame = useCurrentFrame();
  const captionOpacity = interpolate(frame, [60, 80], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  }) *
    interpolate(frame, [105, 120], [1, 0], {
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
      }}
    >
      <div
        style={{
          fontSize: 20,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: gray,
          marginBottom: 80,
        }}
      >
        工作流程
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <FlowBox
          startFrame={0}
          fadeOutFrame={105}
          caption="Step 1"
          title={"Claude Design\n生第一版"}
          width={420}
        />
        <Arrow startFrame={20} fadeOutFrame={105} />
        <FlowBox
          startFrame={28}
          fadeOutFrame={105}
          caption="Step 2"
          title={"匯出 zip\n本機 unzip"}
          width={420}
        />
        <Arrow startFrame={48} fadeOutFrame={105} />
        <FlowBox
          startFrame={56}
          fadeOutFrame={105}
          caption="Step 3"
          title={"slide-editor\n本機迭代"}
          width={420}
          highlight
        />
      </div>
      <div
        style={{
          marginTop: 80,
          fontSize: 28,
          color: ink,
          opacity: captionOpacity,
        }}
      >
        後續所有調整在本機跑　·　每次只送一個元素給 LLM
      </div>
    </AbsoluteFill>
  );
};

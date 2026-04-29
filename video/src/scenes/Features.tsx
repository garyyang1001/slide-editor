import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { ink, gray, red, line, bgWarm } from "../tokens";

const ease = Easing.bezier(0.25, 0.46, 0.45, 0.94);

const FEATURES: Array<{ num: string; title: string; body: string }> = [
  {
    num: "01",
    title: "點任何文字直接改",
    body: "滑過去出現細線提示，點下去就編輯。所有 slide 內文字都自動可編輯。",
  },
  {
    num: "02",
    title: "拖檔上傳圖片",
    body: "把圖片從 Finder 拖進瀏覽器，落在哪張 slide 圖就放哪裡。四角 handle 縮放。",
  },
  {
    num: "03",
    title: "AI 一鍵改寫某段",
    body: "標記、輸入指令、立即重寫。Claude 或 Codex CLI，OAuth 登入不用 API key。",
  },
  {
    num: "04",
    title: "⌘S 寫回原檔",
    body: "改完直接寫回 HTML，自動備份到 .backups/，保留最近 20 份歷史。",
  },
];

const FeatureRow: React.FC<{
  startFrame: number;
  num: string;
  title: string;
  body: string;
}> = ({ startFrame, num, title, body }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [startFrame, startFrame + 24], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  const x = interpolate(frame, [startFrame, startFrame + 24], [-24, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  return (
    <div
      style={{
        opacity,
        transform: `translateX(${x}px)`,
        display: "grid",
        gridTemplateColumns: "120px 1fr",
        gap: 32,
        alignItems: "baseline",
        paddingBottom: 28,
        borderBottom: `1px solid ${line}`,
      }}
    >
      <div
        style={{
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 32,
          color: red,
          letterSpacing: "0.1em",
          fontWeight: 400,
        }}
      >
        {num}
      </div>
      <div>
        <div style={{ fontSize: 38, fontWeight: 500, color: ink, marginBottom: 12, letterSpacing: "0.02em" }}>
          {title}
        </div>
        <div style={{ fontSize: 22, lineHeight: 1.7, color: gray, fontWeight: 300 }}>
          {body}
        </div>
      </div>
    </div>
  );
};

export const Features = () => {
  const frame = useCurrentFrame();
  const headerOpacity = interpolate(frame, [0, 24], [0, 1], {
    extrapolateRight: "clamp",
    easing: ease,
  });

  return (
    <AbsoluteFill
      style={{
        padding: "120px 220px",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          opacity: headerOpacity,
          fontSize: 20,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: gray,
          marginBottom: 24,
        }}
      >
        功能
      </div>
      <div
        style={{
          opacity: headerOpacity,
          fontSize: 64,
          fontWeight: 300,
          color: ink,
          marginBottom: 64,
          letterSpacing: "0.02em",
        }}
      >
        四種編輯方式並存
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        {FEATURES.map((f, i) => (
          <FeatureRow
            key={f.num}
            startFrame={20 + i * 36}
            num={f.num}
            title={f.title}
            body={f.body}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
};

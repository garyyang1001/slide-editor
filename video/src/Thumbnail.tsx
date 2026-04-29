import { AbsoluteFill } from "remotion";
import { ink, bg, gray, line, red, bgWarm } from "./tokens";

// Single-frame thumbnail composition for the YouTube video.
// Loud, paper-feel, designed for shrink-down legibility (Mr. Beast rule:
// readable at 100×56 px).  Left = pain (token 燒光), right = solution.
export const Thumbnail = () => (
  <AbsoluteFill
    style={{
      backgroundColor: bg,
      fontFamily:
        '"Noto Sans TC", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif',
      color: ink,
    }}
  >
    {/* Vertical hairline divider */}
    <div
      style={{
        position: "absolute",
        top: 80,
        bottom: 80,
        left: "50%",
        width: 1,
        background: ink,
        transform: "translateX(-50%)",
      }}
    />

    {/* LEFT — pain side */}
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "50%",
        height: "100%",
        padding: "80px 60px",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          fontSize: 24,
          letterSpacing: "0.18em",
          color: gray,
          textTransform: "uppercase",
          marginBottom: 24,
          fontWeight: 400,
        }}
      >
        改一句　·　燒一輪
      </div>
      <div
        style={{
          fontSize: 152,
          fontWeight: 700,
          lineHeight: 0.95,
          color: red,
          letterSpacing: "0.02em",
          marginBottom: 24,
        }}
      >
        TOKEN
        <br />
        燒光
      </div>
      {/* Burning pile of "tokens" — circles with $ symbol, with red wisps */}
      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              width: 44,
              height: 44,
              border: `2px solid ${ink}`,
              background: bgWarm,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              fontWeight: 700,
              color: ink,
              transform: `translateY(${i * 4}px) rotate(${(i - 2) * 8}deg)`,
              opacity: 1 - i * 0.12,
            }}
          >
            $
          </div>
        ))}
      </div>
      {/* Strikethrough mark */}
      <div
        style={{
          position: "absolute",
          top: 320,
          left: 60,
          right: 60,
          height: 8,
          background: red,
          transform: "rotate(-4deg)",
          opacity: 0.85,
        }}
      />
    </div>

    {/* RIGHT — solution side */}
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        width: "50%",
        height: "100%",
        padding: "80px 60px",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          fontSize: 24,
          letterSpacing: "0.18em",
          color: gray,
          textTransform: "uppercase",
          marginBottom: 16,
          fontWeight: 400,
        }}
      >
        slide-editor　/　本機編輯
      </div>
      <div
        style={{
          fontSize: 220,
          fontWeight: 700,
          lineHeight: 0.9,
          color: ink,
          letterSpacing: "-0.02em",
          marginBottom: 8,
          display: "flex",
          alignItems: "baseline",
        }}
      >
        <span style={{ color: red, fontSize: 280 }}>90</span>
        <span style={{ color: red, fontSize: 160, marginLeft: 8 }}>%</span>
      </div>
      <div
        style={{
          fontSize: 56,
          fontWeight: 500,
          color: ink,
          letterSpacing: "0.02em",
          marginTop: -8,
        }}
      >
        Token 直接砍掉
      </div>
      <div
        style={{
          marginTop: 32,
          fontSize: 22,
          fontWeight: 400,
          color: gray,
          letterSpacing: "0.05em",
        }}
      >
        ✓ 開源　·　✓ 免費　·　✓ MIT
      </div>
    </div>

    {/* Top bar */}
    <div
      style={{
        position: "absolute",
        top: 24,
        left: 0,
        right: 0,
        textAlign: "center",
        fontSize: 18,
        letterSpacing: "0.25em",
        color: gray,
        textTransform: "uppercase",
      }}
    >
      好事發生數位　·　Ohya Digital
    </div>

    {/* Bottom hook tag */}
    <div
      style={{
        position: "absolute",
        bottom: 32,
        left: "50%",
        transform: "translateX(-50%)",
        background: ink,
        color: bg,
        padding: "12px 28px",
        fontSize: 22,
        fontWeight: 500,
        letterSpacing: "0.1em",
      }}
    >
      Claude Design ／ Codex ／ Claude Code 都通
    </div>
  </AbsoluteFill>
);

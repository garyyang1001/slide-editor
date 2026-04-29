import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { ink, gray, line, red } from "../tokens";
import { Cursor } from "../components/Cursor";
import { EditorToolbar } from "../components/EditorToolbar";
import { MockSlide } from "../components/MockSlide";

const ease = Easing.bezier(0.25, 0.46, 0.45, 0.94);

// 8s scene · 240 frames
// Phase A (0-30, 1s):    cursor enters, glides toward h1
// Phase B (30-50):       hover hairline outline appears
// Phase C (50-65):       click — caret + focus outline
// Phase D (65-110):      erase old text char by char
// Phase E (110-180):     type new text char by char
// Phase F (180-240):     hold, status updates to "1 張未存"
export const DemoEdit = () => {
  const frame = useCurrentFrame();

  const cursorX = interpolate(frame, [0, 35], [0.92, 0.36], {
    extrapolateRight: "clamp",
    easing: ease,
  });
  const cursorY = interpolate(frame, [0, 35], [0.85, 0.42], {
    extrapolateRight: "clamp",
    easing: ease,
  });

  const hoverOpacity =
    interpolate(frame, [25, 35], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease }) *
    interpolate(frame, [50, 60], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });

  const focusOpacity = interpolate(frame, [50, 60], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });

  const oldText = "舊文案，內容平淡";
  const newText = "新文案，更直接";

  let displayedText = oldText;
  if (frame >= 65 && frame < 110) {
    // Erase
    const eraseProgress = (frame - 65) / 45;
    const charsLeft = Math.ceil(oldText.length * (1 - eraseProgress));
    displayedText = oldText.slice(0, Math.max(0, charsLeft));
  } else if (frame >= 110 && frame < 180) {
    // Type
    const typeProgress = (frame - 110) / 70;
    const charsTyped = Math.floor(newText.length * Math.min(1, typeProgress));
    displayedText = newText.slice(0, charsTyped);
  } else if (frame >= 180) {
    displayedText = newText;
  }

  const showCaret = frame >= 50 && frame < 200;
  const caretOpacity = showCaret ? (Math.floor(frame / 12) % 2 === 0 ? 1 : 0) : 0;

  const status = frame >= 65 ? "1 張未存" : "就緒";
  const statusLevel: "dirty" | "default" = frame >= 65 ? "dirty" : "default";

  // Sceneintro fade-in for the slide chrome
  const fadeIn = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: "clamp", easing: ease });

  return (
    <AbsoluteFill style={{ opacity: fadeIn }}>
      {/* Caption strip at top */}
      <div
        style={{
          position: "absolute",
          top: 40,
          left: 0,
          right: 0,
          textAlign: "center",
          fontSize: 18,
          letterSpacing: "0.18em",
          color: gray,
          textTransform: "uppercase",
        }}
      >
        Demo 1　·　點任何文字直接改
      </div>

      <MockSlide label="01 cover">
        <div style={{ position: "relative", display: "inline-block" }}>
          <h1
            style={{
              fontSize: 92,
              fontWeight: 300,
              margin: 0,
              color: ink,
              letterSpacing: "0.02em",
              minHeight: 110,
            }}
          >
            {displayedText}
            <span
              style={{
                display: "inline-block",
                width: 3,
                height: 70,
                background: ink,
                marginLeft: 6,
                opacity: caretOpacity,
                verticalAlign: "middle",
              }}
            />
          </h1>
          {/* Hover affordance */}
          <div
            style={{
              position: "absolute",
              inset: -8,
              border: `1px solid ${line}`,
              opacity: hoverOpacity,
              pointerEvents: "none",
            }}
          />
          {/* Focus outline */}
          <div
            style={{
              position: "absolute",
              inset: -8,
              border: `1px solid ${ink}`,
              opacity: focusOpacity,
              pointerEvents: "none",
            }}
          />
        </div>
        <p
          style={{
            fontSize: 26,
            color: gray,
            marginTop: 32,
            fontWeight: 300,
          }}
        >
          副標題：保留不動的內容
        </p>
      </MockSlide>

      <Cursor x={cursorX} y={cursorY} clicked={frame >= 50 && frame < 65} />
      <EditorToolbar status={status} statusLevel={statusLevel} hint="點任何文字直接改" />
    </AbsoluteFill>
  );
};

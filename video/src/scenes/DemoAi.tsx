import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { ink, gray, line, red, bgWarm, bg } from "../tokens";
import { Cursor } from "../components/Cursor";
import { EditorToolbar } from "../components/EditorToolbar";
import { MockSlide } from "../components/MockSlide";

const ease = Easing.bezier(0.25, 0.46, 0.45, 0.94);

// 10s · 300 frames
// 0-15:    intro fade-in
// 15-40:   cursor moves to "標記 prompt" button, clicks → button turns red
// 40-65:   cursor moves to slide paragraph
// 65-75:   click on paragraph
// 75-105:  modal slides up + scale-in
// 105-180: prompt text types into textarea
// 180-200: cursor moves to "立即重寫", click
// 200-235: loading bar sweeps
// 235-265: diff view appears (改寫前 / 改寫後), Δ-style transition
// 265-280: cursor to "套用", click
// 280-300: modal closes, slide paragraph text changes
const ORIGINAL_TEXT = "外銷開發最耗時間的地方";
const REWRITTEN_TEXT = "業務真正卡住的，是寄信前的判斷";
const PROMPT_TEXT = "改成更口語、有共鳴感的版本";

export const DemoAi = () => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: "clamp", easing: ease });

  // Cursor trajectory
  // Phase A 0-40:  to pin button (~ 0.65, 0.92)
  // Phase B 40-65: to paragraph (~ 0.45, 0.45)
  // Phase C 65-180: stays around modal area (~ 0.5, 0.55)
  // Phase D 180-200: to "立即重寫" button (~ 0.62, 0.7)
  // Phase E 200-265: stays around diff
  // Phase F 265-285: to "套用" (~ 0.62, 0.7)
  let cursorX = 0.92, cursorY = 0.92;
  let cursorClicked = false;
  if (frame < 40) {
    cursorX = interpolate(frame, [0, 38], [0.92, 0.65], { extrapolateRight: "clamp", easing: ease });
    cursorY = interpolate(frame, [0, 38], [0.92, 0.92], { extrapolateRight: "clamp", easing: ease });
    cursorClicked = frame >= 35 && frame < 40;
  } else if (frame < 65) {
    cursorX = interpolate(frame, [40, 62], [0.65, 0.45], { extrapolateRight: "clamp", easing: ease });
    cursorY = interpolate(frame, [40, 62], [0.92, 0.45], { extrapolateRight: "clamp", easing: ease });
    cursorClicked = frame >= 62 && frame < 75;
  } else if (frame < 180) {
    // outside modal, holds at lower-right of paragraph area
    cursorX = 0.5;
    cursorY = 0.55;
  } else if (frame < 200) {
    // to "立即重寫" button inside modal
    cursorX = interpolate(frame, [180, 198], [0.5, 0.66], { extrapolateRight: "clamp", easing: ease });
    cursorY = interpolate(frame, [180, 198], [0.55, 0.7], { extrapolateRight: "clamp", easing: ease });
    cursorClicked = frame >= 196 && frame < 200;
  } else if (frame < 265) {
    cursorX = 0.66;
    cursorY = 0.62;
  } else {
    cursorX = interpolate(frame, [265, 280], [0.66, 0.7], { extrapolateRight: "clamp", easing: ease });
    cursorY = interpolate(frame, [265, 280], [0.62, 0.7], { extrapolateRight: "clamp", easing: ease });
    cursorClicked = frame >= 278 && frame < 285;
  }

  const pinActive = frame >= 38; // turns red after click

  // Modal state
  const modalOpening = interpolate(frame, [75, 105], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  const modalClosing = interpolate(frame, [285, 300], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  const modalOpacity = modalOpening * modalClosing;
  const modalScale = 0.95 + 0.05 * modalOpening * modalClosing;

  // Prompt text typing
  let typedPrompt = "";
  if (frame >= 105) {
    const typeProgress = (frame - 105) / 70;
    const charsTyped = Math.floor(PROMPT_TEXT.length * Math.min(1, typeProgress));
    typedPrompt = PROMPT_TEXT.slice(0, charsTyped);
  }

  const showLoadingBar = frame >= 200 && frame < 235;
  const loadingProgress = interpolate(frame, [200, 235], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const showDiff = frame >= 235;

  // Slide paragraph: shows old text until 285, then transitions to new
  const paragraphText = frame < 287 ? ORIGINAL_TEXT : REWRITTEN_TEXT;

  // Status changes
  const status = frame >= 287 ? "1 張未存" : frame >= 38 ? "標記中…" : "就緒";
  const statusLevel: "dirty" | "default" = frame >= 287 ? "dirty" : "default";

  return (
    <AbsoluteFill style={{ opacity: fadeIn }}>
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
        Demo 3　·　AI 一鍵改寫某段
      </div>

      <MockSlide label="07 buyer">
        <h2 style={{ fontSize: 48, fontWeight: 300, margin: 0, color: ink }}>
          業務需要的是有效名單
        </h2>
        <div style={{ marginTop: 56, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
          <div style={{ padding: "24px 28px", border: `1px solid ${line}`, background: bgWarm }}>
            <h3 style={{ fontSize: 24, margin: 0, fontWeight: 500 }}>一般名單</h3>
            <p style={{ fontSize: 18, color: gray, marginTop: 12, lineHeight: 1.7 }}>
              {paragraphText}，業務還要一筆一筆查。
            </p>
          </div>
          <div style={{ padding: "24px 28px", border: `1px solid ${ink}`, background: bgWarm }}>
            <h3 style={{ fontSize: 24, margin: 0, fontWeight: 500, color: red }}>有效名單</h3>
            <p style={{ fontSize: 18, color: gray, marginTop: 12, lineHeight: 1.7 }}>
              已經排好優先順序，業務可以直接接手。
            </p>
          </div>
        </div>
      </MockSlide>

      {/* AI rewrite modal */}
      {modalOpacity > 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(45,42,38,0.55)",
            opacity: modalOpacity,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 40,
          }}
        >
          <div
            style={{
              background: bg,
              border: `1px solid ${ink}`,
              padding: 40,
              width: 720,
              transform: `scale(${modalScale})`,
              boxSizing: "border-box",
            }}
          >
            <h3 style={{ margin: 0, fontSize: 22, fontWeight: 500 }}>改寫這段內容</h3>
            <div
              style={{
                fontSize: 12,
                color: gray,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                margin: "8px 0 24px",
              }}
            >
              位於 07 buyer　·　&lt;p&gt;
            </div>
            <div
              style={{
                fontSize: 12,
                letterSpacing: "0.1em",
                color: gray,
                textTransform: "uppercase",
                marginBottom: 8,
                fontFamily: "ui-monospace, monospace",
              }}
            >
              當前內容
            </div>
            <div
              style={{
                background: bgWarm,
                borderLeft: `1px solid ${ink}`,
                padding: "14px 18px",
                fontSize: 16,
                lineHeight: 1.6,
                marginBottom: 24,
              }}
            >
              {ORIGINAL_TEXT}，業務還要一筆一筆查。
            </div>
            <div
              style={{
                width: "100%",
                minHeight: 80,
                border: `1px solid ${frame >= 105 ? ink : line}`,
                background: bgWarm,
                padding: "14px 18px",
                fontSize: 16,
                lineHeight: 1.6,
                color: typedPrompt ? ink : "#BBB",
              }}
            >
              {typedPrompt || "輸入你要怎麼改…"}
              {frame >= 105 && frame < 175 && Math.floor(frame / 8) % 2 === 0 && (
                <span style={{ display: "inline-block", width: 2, height: 18, background: ink, marginLeft: 2, verticalAlign: "middle" }} />
              )}
            </div>

            {showLoadingBar && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  marginTop: 18,
                  fontSize: 13,
                  color: gray,
                  letterSpacing: "0.05em",
                }}
              >
                <span>Claude 正在改寫…</span>
                <div style={{ height: 1, background: line, flex: 1, position: "relative", overflow: "hidden" }}>
                  <div
                    style={{
                      position: "absolute",
                      left: `${-30 + loadingProgress * 130}%`,
                      width: "30%",
                      height: "100%",
                      background: ink,
                    }}
                  />
                </div>
              </div>
            )}

            {showDiff && (
              <div
                style={{
                  marginTop: 24,
                  paddingTop: 24,
                  borderTop: `1px solid ${line}`,
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 16,
                }}
              >
                <div>
                  <div style={{ fontSize: 11, color: gray, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
                    改寫前
                  </div>
                  <div style={{ background: bgWarm, border: `1px solid ${line}`, padding: "14px 18px", fontSize: 16, lineHeight: 1.6 }}>
                    {ORIGINAL_TEXT}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: red, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
                    改寫後
                  </div>
                  <div style={{ background: bgWarm, border: `1px solid ${line}`, padding: "14px 18px", fontSize: 16, lineHeight: 1.6 }}>
                    {REWRITTEN_TEXT}
                  </div>
                </div>
                <div style={{ gridColumn: "1 / -1", fontSize: 11, color: gray, letterSpacing: "0.05em", marginTop: 8, fontFamily: "ui-monospace, monospace" }}>
                  耗時 8.2 秒　·　API 等價成本 USD 0.142
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 24 }}>
              {!showDiff ? (
                <>
                  <button style={{ fontSize: 12, padding: "10px 16px", border: `1px solid ${ink}`, background: "transparent", color: ink, letterSpacing: "0.1em" }}>
                    加入佇列
                  </button>
                  <button style={{ fontSize: 12, padding: "10px 16px", border: `1px solid ${red}`, background: red, color: bg, letterSpacing: "0.1em" }}>
                    立即重寫
                  </button>
                </>
              ) : (
                <>
                  <button style={{ fontSize: 12, padding: "10px 16px", border: `1px solid ${line}`, background: "transparent", color: gray, letterSpacing: "0.1em" }}>
                    丟棄
                  </button>
                  <button style={{ fontSize: 12, padding: "10px 16px", border: `1px solid ${ink}`, background: ink, color: bg, letterSpacing: "0.1em" }}>
                    套用
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <Cursor x={cursorX} y={cursorY} clicked={cursorClicked} />
      <EditorToolbar
        status={status}
        statusLevel={statusLevel}
        hint="標記位置　·　立即重寫"
        active={pinActive ? "pin" : null}
      />
    </AbsoluteFill>
  );
};

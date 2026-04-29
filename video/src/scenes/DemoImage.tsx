import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { ink, gray, line, red, bgWarm } from "../tokens";
import { Cursor } from "../components/Cursor";
import { EditorToolbar } from "../components/EditorToolbar";
import { MockSlide } from "../components/MockSlide";

const ease = Easing.bezier(0.25, 0.46, 0.45, 0.94);

// 8s · 240 frames
// 0-15:   intro fade-in
// 15-70:  finder file ghost slides in from outside, dragged onto slide
// 50-70:  slide gains red drop-target outline as ghost hovers
// 70-85:  drop — image appears at drop point, ghost vanishes
// 85-115: cursor moves to new image, click selects → 4 corner handles appear
// 115-180: drag bottom-right handle → image shrinks
// 180-240: hold final state
export const DemoImage = () => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: "clamp", easing: ease });

  // Ghost (the dragged file from Finder, simulated)
  const ghostVisible = frame >= 15 && frame < 78;
  const ghostX = interpolate(frame, [15, 70], [1.05, 0.55], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const ghostY = interpolate(frame, [15, 70], [0.95, 0.5], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const ghostOpacity = interpolate(frame, [70, 78], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const dropOutline =
    interpolate(frame, [50, 60], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease }) *
    interpolate(frame, [70, 78], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });

  // Image appears at drop point
  const imgVisible = frame >= 70;
  const imgScale = interpolate(frame, [70, 88], [0.9, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const imgOpacity = interpolate(frame, [70, 80], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Cursor: enters during ghost drag, follows ghost, then heads to image, then drags handle
  // Phase A 0-70: cursor follows ghost
  // Phase B 70-100: stays at drop point
  // Phase C 100-115: moves to bottom-right corner of image
  // Phase D 115-180: drags corner inward
  let cursorX = ghostX + 0.01;
  let cursorY = ghostY + 0.02;
  if (frame >= 70 && frame < 100) {
    cursorX = 0.55;
    cursorY = 0.5;
  } else if (frame >= 100 && frame < 115) {
    cursorX = interpolate(frame, [100, 115], [0.55, 0.66], { extrapolateRight: "clamp", easing: ease });
    cursorY = interpolate(frame, [100, 115], [0.5, 0.62], { extrapolateRight: "clamp", easing: ease });
  } else if (frame >= 115) {
    cursorX = interpolate(frame, [115, 180], [0.66, 0.6], { extrapolateRight: "clamp", easing: ease });
    cursorY = interpolate(frame, [115, 180], [0.62, 0.58], { extrapolateRight: "clamp", easing: ease });
  }

  const cursorClicked = (frame >= 100 && frame < 115) || (frame >= 115 && frame < 180);

  // Selection handles appear after click (frame 110+)
  const handlesOpacity = interpolate(frame, [108, 118], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });

  // Image size shrinks during drag
  const imgWidth = interpolate(frame, [115, 180], [380, 240], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const imgHeight = imgWidth * 0.66;

  const status = frame >= 80 ? "1 張未存" : "就緒";
  const statusLevel: "dirty" | "default" = frame >= 80 ? "dirty" : "default";

  // Use a simple shape for "image" — colored rectangle with mock content. No external asset needed.
  const MockImage = ({ width, height, opacity = 1, scale = 1 }: { width: number; height: number; opacity?: number; scale?: number }) => (
    <div
      style={{
        width,
        height,
        background: `linear-gradient(135deg, #B38A3F 0%, #C84630 100%)`,
        opacity,
        transform: `scale(${scale})`,
        transformOrigin: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.3) 0%, transparent 50%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 12,
          right: 16,
          fontSize: 11,
          letterSpacing: "0.1em",
          color: "rgba(255,255,255,0.7)",
          fontFamily: "ui-monospace, monospace",
          textTransform: "uppercase",
        }}
      >
        IMG · 320 × 213
      </div>
    </div>
  );

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
        Demo 2　·　拖檔上傳圖片　·　四角縮放
      </div>

      <MockSlide label="03 hero">
        <h1 style={{ fontSize: 60, fontWeight: 300, margin: 0, color: ink }}>
          視覺資產區塊
        </h1>
        <p style={{ fontSize: 22, color: gray, marginTop: 24, fontWeight: 300 }}>
          把圖片從 Finder 拖過來
        </p>
        {/* Drop-target outline */}
        {dropOutline > 0 && (
          <div
            style={{
              position: "absolute",
              inset: 4,
              border: `2px solid ${red}`,
              opacity: dropOutline,
              pointerEvents: "none",
            }}
          />
        )}
        {/* Inserted image */}
        {imgVisible && (
          <div
            style={{
              position: "absolute",
              left: "55%",
              top: "60%",
              transform: `translate(-50%, -50%) scale(${imgScale})`,
              opacity: imgOpacity,
            }}
          >
            <MockImage width={imgWidth} height={imgHeight} />
            {/* Selection handles when active */}
            {handlesOpacity > 0 &&
              [
                { x: 0, y: 0, c: "nwse" },
                { x: imgWidth, y: 0, c: "nesw" },
                { x: 0, y: imgHeight, c: "nesw" },
                { x: imgWidth, y: imgHeight, c: "nwse" },
              ].map((h, i) => (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    left: h.x,
                    top: h.y,
                    width: 16,
                    height: 16,
                    background: "#F5F5F0",
                    border: `1px solid ${ink}`,
                    transform: "translate(-50%, -50%)",
                    opacity: handlesOpacity,
                  }}
                />
              ))}
          </div>
        )}
      </MockSlide>

      {/* Dragged ghost from Finder */}
      {ghostVisible && (
        <div
          style={{
            position: "absolute",
            left: `${ghostX * 100}%`,
            top: `${ghostY * 100}%`,
            transform: "translate(-50%, -50%)",
            opacity: 0.6 * ghostOpacity,
            outline: `1px solid ${red}`,
            outlineOffset: 2,
            zIndex: 60,
          }}
        >
          <MockImage width={160} height={106} />
        </div>
      )}

      <Cursor x={cursorX} y={cursorY} clicked={cursorClicked} />
      <EditorToolbar status={status} statusLevel={statusLevel} hint="拖檔上傳圖片　·　點圖片角落縮放" />
    </AbsoluteFill>
  );
};

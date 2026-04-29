import { ink, bg, gray, line, red, bgWarm } from "../tokens";

// Faithful mockup of the slide-editor toolbar that lives at the bottom-right of the page.
// Used in demo scenes to ground the action — viewers see the editor chrome the user actually sees.
export const EditorToolbar: React.FC<{
  hint?: string;
  status?: string;
  statusLevel?: "default" | "dirty" | "ok";
  active?: "pin" | "move" | null;
  queueCount?: number;
}> = ({ hint = "點任何文字直接改　·　標記位置讓 AI 改寫", status = "就緒", statusLevel = "default", active = null, queueCount = 0 }) => {
  const statusColor =
    statusLevel === "dirty" ? red : statusLevel === "ok" ? ink : gray;

  const pinStyle = active === "pin"
    ? { background: red, color: bg, border: `1px solid ${red}` }
    : { background: "transparent", color: ink, border: `1px solid ${ink}` };
  const moveStyle = active === "move"
    ? { background: red, color: bg, border: `1px solid ${red}` }
    : { background: "transparent", color: ink, border: `1px solid ${ink}` };

  const btn: React.CSSProperties = {
    fontSize: 14,
    letterSpacing: "0.1em",
    fontWeight: 400,
    padding: "10px 16px",
    background: "transparent",
    color: ink,
    border: `1px solid ${ink}`,
  };
  const btnInk: React.CSSProperties = { ...btn, background: ink, color: bg };
  const pinLabel = active === "pin" ? "點目標元素　·　Esc 取消" : "標記 prompt";
  const moveLabel = active === "move" ? "移動中　·　Esc 結束" : "移動模式";

  return (
    <div
      style={{
        position: "absolute",
        bottom: 36,
        right: 36,
        background: bgWarm,
        color: ink,
        border: `1px solid ${ink}`,
        minWidth: 720,
        zIndex: 50,
      }}
    >
      <div
        style={{
          padding: "14px 20px",
          borderBottom: `1px solid ${line}`,
          fontSize: 13,
          letterSpacing: "0.1em",
          color: gray,
          textTransform: "uppercase",
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <span style={{ color: ink, fontWeight: 500 }}>編輯器</span>
        <span style={{ color: line }}>／</span>
        <span style={{ flex: 1, textTransform: "none", letterSpacing: "0.025em", fontSize: 14 }}>
          {hint}
        </span>
        <button
          style={{
            width: 28,
            height: 28,
            border: `1px solid ${line}`,
            background: "transparent",
            color: gray,
            fontSize: 14,
            padding: 0,
            lineHeight: "26px",
          }}
        >
          ？
        </button>
      </div>
      <div
        style={{
          padding: "14px 20px",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <button style={{ ...btn, ...pinStyle }}>{pinLabel}</button>
        <button style={{ ...btn, ...moveStyle }}>{moveLabel}</button>
        <button style={btn}>新增圖片</button>
        <button style={btn}>
          佇列 ／ {queueCount}
        </button>
        <button style={btnInk}>存檔</button>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 13,
            letterSpacing: "0.05em",
            color: statusColor,
            minWidth: 100,
            textAlign: "right",
          }}
        >
          {status}
        </span>
      </div>
    </div>
  );
};

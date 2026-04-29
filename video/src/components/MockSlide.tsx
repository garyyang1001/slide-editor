import { ink, gray, line, bgWarm } from "../tokens";

// A simplified visual stand-in for "a slide in the editor".
// Real demo decks have real CSS — we render a subset that looks credible without
// the full framework.
export const MockSlide: React.FC<{
  children: React.ReactNode;
  label?: string;
}> = ({ children, label = "01 cover" }) => (
  <div
    style={{
      position: "absolute",
      top: 100,
      left: 200,
      right: 200,
      bottom: 220,
      background: "#F5F5F0",
      border: `1px solid ${line}`,
      padding: "60px 80px",
      boxSizing: "border-box",
      overflow: "hidden",
    }}
  >
    {/* Page header */}
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        fontSize: 14,
        letterSpacing: "0.18em",
        color: gray,
        textTransform: "uppercase",
        marginBottom: 56,
      }}
    >
      <span>好事發生數位</span>
      <span style={{ color: ink, fontWeight: 500 }}>{label}</span>
    </div>
    {children}
  </div>
);

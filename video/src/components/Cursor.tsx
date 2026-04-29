// Mac-style arrow cursor used to simulate user interactions in the demo scenes.
// x, y are normalized 0..1 across the 1920×1080 stage.
export const Cursor: React.FC<{
  x: number;
  y: number;
  clicked?: boolean;
  size?: number;
}> = ({ x, y, clicked = false, size = 32 }) => {
  return (
    <div
      style={{
        position: "absolute",
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        transform: `translate(-2px, -2px) scale(${clicked ? 0.92 : 1})`,
        transition: "none",
        pointerEvents: "none",
        zIndex: 100,
      }}
    >
      <svg width={size} height={size * 1.33} viewBox="0 0 24 32">
        <path
          d="M2 2 L2 23 L8 18 L11 27 L14 26 L11 17 L19 17 Z"
          fill="#FFFFFF"
          stroke="#2D2A26"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
      {/* Click ripple */}
      {clicked && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 32,
            height: 32,
            border: "1px solid #C84630",
            transform: "translate(-50%, -50%)",
            opacity: 0.6,
          }}
        />
      )}
    </div>
  );
};

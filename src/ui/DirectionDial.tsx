import { useRef } from "react";

const RAD = Math.PI / 180;

/**
 * A spinnable radial control for a direction. The arrow points the way gravity
 * pulls (0° = straight down), so the user sets direction by sight rather than
 * by reading a degree value. Angle convention matches RoomSettingsPanel:
 * screen-space pull direction is (sin a, cos a).
 */
export function DirectionDial({
  angle,
  onChange,
  disabled = false,
  size = 72,
}: {
  angle: number;
  onChange: (deg: number) => void;
  disabled?: boolean;
  size?: number;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const r = size / 2;
  const reach = r - 8;
  const a = angle * RAD;
  const tipX = r + Math.sin(a) * reach;
  const tipY = r + Math.cos(a) * reach;

  const setFromEvent = (e: React.PointerEvent) => {
    const box = ref.current!.getBoundingClientRect();
    const dx = e.clientX - (box.left + box.width / 2);
    const dy = e.clientY - (box.top + box.height / 2);
    if (dx === 0 && dy === 0) return;
    onChange((Math.atan2(dx, dy) / RAD + 360) % 360);
  };
  const onDown = (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* no-op */
    }
    setFromEvent(e);
  };
  const onMove = (e: React.PointerEvent) => {
    if (disabled || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
    setFromEvent(e);
  };

  return (
    <svg
      ref={ref}
      width={size}
      height={size}
      className={`dial${disabled ? " disabled" : ""}`}
      onPointerDown={onDown}
      onPointerMove={onMove}
    >
      <circle cx={r} cy={r} r={reach} fill="#fff" stroke="#2b2b2b" strokeWidth={2} />
      {/* tick marks at the four cardinal directions */}
      {[0, 90, 180, 270].map((d) => {
        const t = d * RAD;
        return (
          <line
            key={d}
            x1={r + Math.sin(t) * (reach - 4)}
            y1={r + Math.cos(t) * (reach - 4)}
            x2={r + Math.sin(t) * reach}
            y2={r + Math.cos(t) * reach}
            stroke="#2b2b2b"
            strokeWidth={1}
            opacity={0.4}
          />
        );
      })}
      <line x1={r} y1={r} x2={tipX} y2={tipY} stroke="#2b2b2b" strokeWidth={2.5} />
      <circle cx={tipX} cy={tipY} r={6} fill="#1f7a3d" stroke="#2b2b2b" strokeWidth={1.5} />
      <circle cx={r} cy={r} r={2.5} fill="#2b2b2b" />
    </svg>
  );
}

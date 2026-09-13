import { useId } from "react";
import { cn } from "@/lib/utils";
import type { ScanPoint } from "@/lib/neural";
import { useReducedMotion } from "@/lib/prefers-reduced-motion";

const WIDTH = 320;
const HEIGHT = 168;
const LINES = 5;
const LEFT = 22;
const RIGHT = 298;
const TOP = 22;
const GAP = 28;

function coord(point: ScanPoint) {
  return {
    x: LEFT + point.x * (RIGHT - LEFT),
    y: TOP + point.y * GAP,
    r: point.r,
  };
}

export function Scanpath({
  points,
  replayKey,
  label,
  className,
}: {
  points: ScanPoint[];
  replayKey?: string | number;
  label: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const uid = useId();
  const mapped = points.map(coord);
  const d = mapped
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");

  return (
    <svg
      key={replayKey ?? d}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className={cn("h-auto w-full text-fg", className)}
      role="img"
      aria-label={label}
    >
      {Array.from({ length: LINES }, (_, line) => (
        <line
          key={line}
          x1={LEFT}
          x2={RIGHT}
          y1={TOP + line * GAP}
          y2={TOP + line * GAP}
          stroke="currentColor"
          strokeOpacity={0.1}
          strokeWidth={1}
        />
      ))}
      {d ? (
        <path
          d={d}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.55}
          strokeWidth={1.4}
          strokeLinejoin="round"
          strokeLinecap="round"
          pathLength={1}
          className={reduce ? undefined : "scanpath-draw"}
        />
      ) : null}
      {mapped.map((point, index) => {
        const kind = points[index]?.kind;
        const dashed = kind === "regression" || kind === "skip";
        return (
          <circle
            key={`${uid}-${index}`}
            cx={point.x}
            cy={point.y}
            r={point.r}
            fill="currentColor"
            fillOpacity={kind === "disengage" ? 0.18 : kind === "skip" ? 0.28 : 0.55}
            stroke="currentColor"
            strokeOpacity={0.8}
            strokeWidth={dashed ? 1 : 0}
            strokeDasharray={kind === "regression" ? "2 2" : undefined}
            style={reduce ? undefined : { animationDelay: `${index * 40}ms` }}
            className={reduce ? undefined : "scanpath-dot"}
          />
        );
      })}
    </svg>
  );
}

import type { ReactNode } from "react";
import { Sprout } from "lucide-react";
import { speciesOf, stageOf, type Garden, type GardenPlant, type Species } from "@/lib/garden";
import { cn } from "@/lib/utils";

/**
 * The reading garden, drawn.
 *
 * Plain SVG, no library and no images: a plant is a stem, some leaves and up
 * to five flowers, and that is few enough shapes to draw by hand and keep
 * crisp at any size. Colours come from the page's own palette where they can,
 * so a plant sits in every theme — night and paper alike — instead of being a
 * bright sticker pasted on top.
 */

/** Stem height by stage, in a 60×100 box with the ground at y = 96. */
const STEM = [0, 24, 44, 62, 78] as const;

const PETAL: Record<Species, string> = {
  0: "#f5efe4", // daisy
  1: "#d9776b", // tulip
  2: "#8d7fc7", // bellflower
  3: "#e0b43a", // sunflower
};
const HEART: Record<Species, string> = {
  0: "#e0b43a",
  1: "#b85a4f",
  2: "#6c5fa8",
  3: "#7a4b25",
};

const LEAF = "color-mix(in oklab, #5b8a55 82%, var(--color-fg))";
const SOIL = "color-mix(in oklab, #7a5a3c 34%, transparent)";
const OUTLINE = "color-mix(in oklab, var(--color-fg) 22%, transparent)";

function Flower({ species, x, y, r }: { species: Species; x: number; y: number; r: number }) {
  const petal = PETAL[species];
  const heart = HEART[species];
  if (species === 1) {
    // Tulip: a cup, open at the top.
    return (
      <path
        d={`M ${x - r} ${y - r * 0.2} Q ${x - r} ${y + r * 1.1} ${x} ${y + r * 1.1} Q ${x + r} ${y + r * 1.1} ${x + r} ${y - r * 0.2} L ${x + r * 0.45} ${y + r * 0.25} L ${x} ${y - r * 0.55} L ${x - r * 0.45} ${y + r * 0.25} Z`}
        fill={petal}
        stroke={OUTLINE}
        strokeWidth={0.8}
      />
    );
  }
  if (species === 2) {
    // Bellflower: hangs, mouth down.
    return (
      <g>
        <path
          d={`M ${x - r * 0.9} ${y + r} Q ${x - r * 0.8} ${y - r * 0.9} ${x} ${y - r * 0.9} Q ${x + r * 0.8} ${y - r * 0.9} ${x + r * 0.9} ${y + r} Q ${x + r * 0.45} ${y + r * 0.7} ${x} ${y + r} Q ${x - r * 0.45} ${y + r * 0.7} ${x - r * 0.9} ${y + r} Z`}
          fill={petal}
          stroke={OUTLINE}
          strokeWidth={0.8}
        />
        <circle cx={x} cy={y + r * 1.05} r={r * 0.18} fill={heart} />
      </g>
    );
  }
  // Daisy and sunflower: petals round a heart; the sunflower has more of
  // them, and a bigger heart.
  const count = species === 3 ? 12 : 8;
  const heartR = species === 3 ? r * 0.5 : r * 0.34;
  return (
    <g>
      {Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * 360;
        return (
          <ellipse
            key={i}
            cx={x}
            cy={y - r * 0.62}
            rx={r * (species === 3 ? 0.22 : 0.26)}
            ry={r * 0.5}
            fill={petal}
            stroke={OUTLINE}
            strokeWidth={0.6}
            transform={`rotate(${angle} ${x} ${y})`}
          />
        );
      })}
      <circle cx={x} cy={y} r={heartR} fill={heart} />
    </g>
  );
}

function Leaf({ x, y, side, size }: { x: number; y: number; side: 1 | -1; size: number }) {
  const tip = x + side * size;
  return (
    <path
      d={`M ${x} ${y} Q ${x + side * size * 0.5} ${y - size * 0.7} ${tip} ${y - size * 0.3} Q ${x + side * size * 0.55} ${y + size * 0.15} ${x} ${y} Z`}
      fill={LEAF}
    />
  );
}

/** One book's plant. */
export function Plant({ plant, className }: { plant: GardenPlant; className?: string }) {
  const species = speciesOf(plant.id);
  const stage = stageOf(plant);
  const top = 96 - STEM[stage];
  const blooms = Math.min(5, plant.blooms.length);
  // Side branches for the second flower onward, alternating, lower each time.
  const branches = Array.from({ length: Math.max(0, blooms - 1) }, (_, i) => {
    const side = (i % 2 === 0 ? 1 : -1) as 1 | -1;
    const y = top + 12 + i * ((96 - top - 20) / 4);
    return { side, y, x: 30 + side * 13 };
  });

  return (
    <svg viewBox="0 0 60 100" className={cn("overflow-visible", className)} aria-hidden>
      {/* Each plant in its own patch of soil, so the ground sits under the
          plants rather than under their names. */}
      <ellipse cx={30} cy={97} rx={15} ry={2.6} fill={SOIL} />
      <path d={`M 30 96 L 30 ${top + 4}`} stroke={LEAF} strokeWidth={2.4} strokeLinecap="round" />
      {branches.map((b, i) => (
        <path
          key={`branch-${i}`}
          d={`M 30 ${b.y + 8} Q ${30 + b.side * 6} ${b.y + 6} ${b.x} ${b.y + 2}`}
          stroke={LEAF}
          strokeWidth={1.6}
          fill="none"
          strokeLinecap="round"
        />
      ))}
      <Leaf x={30} y={90} side={-1} size={11} />
      <Leaf x={30} y={86} side={1} size={10} />
      {stage >= 2 ? <Leaf x={30} y={74} side={1} size={12} /> : null}
      {stage >= 3 ? <Leaf x={30} y={58} side={-1} size={12} /> : null}
      {stage >= 4 ? <Leaf x={30} y={42} side={1} size={11} /> : null}
      {blooms > 0 ? (
        <Flower species={species} x={30} y={top} r={stage >= 3 ? 9 : 7.5} />
      ) : stage >= 2 ? (
        // A bud: a flower is on its way, the next recall card opens it.
        <ellipse cx={30} cy={top + 1} rx={3.2} ry={4.4} fill={LEAF} />
      ) : null}
      {branches.map((b, i) => (
        <Flower key={`flower-${i}`} species={species} x={b.x} y={b.y} r={5.5} />
      ))}
    </svg>
  );
}

/** A single flower, for the moment a recall card finishes. */
export function Bloom({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <Flower species={0} x={20} y={20} r={13} />
    </svg>
  );
}

/** The garden: every book read, as a row of plants on a line of soil. */
export function GardenView({ garden, action }: { garden: Garden; action?: ReactNode }) {
  if (garden.plants.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-lg bg-fg/4 p-4 text-sm text-muted">
        <Sprout size={18} className="shrink-0 text-accent" aria-hidden />
        <p>
          Finish a chapter and something will sprout here. Every book grows its own plant, and
          nothing here ever wilts.
        </p>
      </div>
    );
  }
  return (
    <div>
      <ul className="flex gap-x-2 gap-y-6 overflow-x-auto px-1 pt-2 pb-2 [scrollbar-width:thin]">
        {garden.plants.map((plant) => {
          const chapters = plant.chapters.length;
          const flowers = plant.blooms.length;
          const label = `${plant.title || "A book"}: ${chapters} ${chapters === 1 ? "chapter" : "chapters"} finished, ${flowers} ${flowers === 1 ? "flower" : "flowers"}`;
          return (
            <li
              key={plant.id}
              className="flex w-24 shrink-0 flex-col items-center"
              aria-label={label}
            >
              <Plant plant={plant} className="garden-plant h-28 w-16" />
              <span
                className="mt-1 w-full truncate text-center text-[11px] leading-tight text-muted"
                aria-hidden
              >
                {plant.title || "A book"}
              </span>
            </li>
          );
        })}
      </ul>
      {action}
    </div>
  );
}

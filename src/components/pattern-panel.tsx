import { useState } from "react";
import {
  classifyReading,
  PATTERN_META,
  PATTERN_ORDER,
  type PatternReading,
  type ReadingPatternId,
} from "@/lib/reading-patterns";
import { demoScanpath, detectPassiveState, scanpathFromEvents } from "@/lib/neural";
import { useAppStore } from "@/lib/store";
import { Panel, PanelWell } from "@/components/ui/surfaces";
import { Scanpath } from "@/components/scanpath";
import { cn } from "@/lib/utils";

export function useSittingPattern(): PatternReading {
  const reading = useAppStore((s) => s.reading);
  const targetWpm = useAppStore((s) => s.targetWpm);
  const idleMs = reading.pausedAt ? Math.max(0, Date.now() - reading.pausedAt) : 0;
  return classifyReading({
    progress: reading.progress,
    elapsedActiveMs: reading.elapsedActiveMs,
    currentWpm: reading.currentWpm,
    targetWpm,
    pauses: reading.pauses,
    rereads: reading.rereads,
    skips: reading.skips ?? [],
    dwellCount: reading.dwellCount ?? 0,
    dwellMs: reading.dwellMs ?? 0,
    longDwellCount: reading.longDwellCount ?? 0,
    forwardSteps: reading.forwardSteps ?? 0,
    idleMs,
    neuralEvents: reading.neuralEvents ?? [],
  });
}

export function PatternHint() {
  const pattern = useSittingPattern();
  const events = useAppStore((s) => s.reading.neuralEvents ?? []);
  const elapsed = useAppStore((s) => s.reading.elapsedActiveMs);
  const progress = useAppStore((s) => s.reading.progress);
  const passive = detectPassiveState(events, Date.now());
  if (elapsed < 8_000 && events.length < 2 && progress < 0.06) return null;
  const live = pattern.gathering ? passive.live : pattern.live;
  return <p className="pointer-events-none text-xs text-muted">{live}</p>;
}

export function PatternExplorer({
  eyebrow = "How the eye moves",
  liveId,
}: {
  eyebrow?: string;
  liveId?: ReadingPatternId;
}) {
  const [picked, setPicked] = useState<ReadingPatternId | null>(null);
  const id = picked ?? liveId ?? "flow";
  const meta = PATTERN_META[id];
  const points = demoScanpath(id);

  return (
    <Panel>
      <PanelWell className="px-5 py-5">
        <p className="text-xs font-medium tracking-wide text-muted uppercase">{eyebrow}</p>
        <p className="mt-3 font-serif text-3xl tracking-tight">{meta.label}</p>
        <p className="mt-2 max-w-lg text-sm leading-relaxed text-pretty text-muted">{meta.body}</p>
        <div className="mt-5 overflow-hidden rounded-md bg-fg/4 px-2 py-3">
          <Scanpath points={points} replayKey={id} label={`${meta.label}: ${meta.science}`} />
        </div>
        <ul className="mt-4 flex flex-wrap gap-1.5">
          {PATTERN_ORDER.map((key) => {
            const selected = key === id;
            return (
              <li key={key}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setPicked(key)}
                  className={cn(
                    "min-h-11 rounded-full px-3 text-xs font-medium whitespace-nowrap transition-[background-color,color,transform] duration-[140ms] ease-[var(--ease-out)] active:scale-[0.97]",
                    selected ? "bg-fg text-primary-fg" : "bg-fg/6 hover:bg-fg/10",
                  )}
                >
                  {PATTERN_META[key].label}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-4 text-xs leading-relaxed text-pretty text-muted">
          {meta.science}. {meta.detector} {meta.help}
        </p>
      </PanelWell>
    </Panel>
  );
}

export function PatternPanel() {
  const pattern = useSittingPattern();
  const dwellCount = useAppStore((s) => s.reading.dwellCount ?? 0);
  const forwardSteps = useAppStore((s) => s.reading.forwardSteps ?? 0);
  const skips = useAppStore((s) => s.reading.skips?.length ?? 0);
  const rereads = useAppStore((s) => s.reading.rereads.length);
  const events = useAppStore((s) => s.reading.neuralEvents ?? []);
  const livePoints = scanpathFromEvents(events);
  const mixLabel = pattern.mix.map((item) => `${item.share}% ${item.label.toLowerCase()}`).join(", ");
  const passive = detectPassiveState(events, Date.now());

  return (
    <div className="space-y-3">
      <Panel>
        <PanelWell className="px-5 py-5">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">This sitting</p>
          <p className="mt-3 font-serif text-3xl tracking-tight">{pattern.label}</p>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-pretty text-muted">{pattern.body}</p>
          <p className="mt-3 text-xs leading-relaxed text-pretty text-muted">
            {pattern.science}. Inferred from time on the line and how the page moves — the same rhythm as
            land, jump, and go back. No camera.
          </p>
          {pattern.mix.length > 0 ? (
            <div
              className="mt-5 flex h-1.5 overflow-hidden rounded-full bg-fg/8"
              role="img"
              aria-label={mixLabel || pattern.label}
            >
              {pattern.mix.map((item) => (
                <span
                  key={item.id}
                  className="h-full bg-fg"
                  style={{ width: `${item.share}%`, opacity: PATTERN_META[item.id].bar }}
                  title={`${item.label} ${item.share}%`}
                />
              ))}
            </div>
          ) : (
            <div className="mt-5 h-1.5 rounded-full bg-fg/8" />
          )}
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <li>
              <span className="tabular-nums">{dwellCount}</span> lines held
            </li>
            <li>
              <span className="tabular-nums">{forwardSteps}</span> small advances
            </li>
            <li>
              <span className="tabular-nums">{skips}</span> jumps
            </li>
            <li>
              <span className="tabular-nums">{rereads}</span> rereads
            </li>
            {passive.state !== "gathering" ? <li>{passive.label}</li> : null}
          </ul>
          {livePoints.length >= 2 ? (
            <div className="mt-5 overflow-hidden rounded-md bg-fg/4 px-2 py-3">
              <Scanpath
                points={livePoints}
                replayKey={events.length}
                label={`This sitting’s scanpath, ${pattern.label}`}
              />
            </div>
          ) : null}
        </PanelWell>
      </Panel>
      <PatternExplorer liveId={pattern.gathering ? "flow" : pattern.id} />
    </div>
  );
}

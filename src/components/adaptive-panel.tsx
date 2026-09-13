import { useMemo } from "react";
import { useAppStore } from "@/lib/store";
import { Companion, type CompanionMood } from "@/components/companion";
import { Panel } from "@/components/ui/surfaces";
import { leverOf, TRUST } from "@/lib/adaptive/memory";
import { measureReadingStrain, type AdaptiveRule } from "@/lib/adaptive/engine";

const LEVER_LABEL: Record<AdaptiveRule, string> = {
  "contrast-low": "raising contrast",
  rereading: "opening up line spacing",
  "type-size": "increasing type size",
  pauses: "increasing type size after pauses",
  "pace-strain": "slowing the target pace",
  "strong-performance": "raising the target pace",
};

/**
 * What the adaptive engine has worked out, said plainly.
 *
 * The engine keeps a trust weight per lever and moves it based on whether a
 * change actually reduced strain — so it holds real opinions about how this
 * particular person reads. None of that was visible anywhere, which is a bad
 * position for software that asks to be trusted with someone's attention: it
 * was making decisions and showing only the decision.
 *
 * Lens is the face of it because the alternative is a bare table of weights.
 * A companion that says "spacing helped, so I reach for it first" is legible in
 * a way that `rereading: 1.25` is not.
 */
export function AdaptivePanel() {
  const memory = useAppStore((s) => s.adaptiveMemory);
  const reading = useAppStore((s) => s.reading);
  const targetWpm = useAppStore((s) => s.targetWpm);
  const feel = useAppStore((s) => s.readingFeel);
  const mode = useAppStore((s) => s.mode);

  const strain = useMemo(
    () =>
      measureReadingStrain({
        wordCount: reading.wordCount,
        wordsRead: reading.wordsRead,
        progress: reading.progress,
        elapsedActiveMs: reading.elapsedActiveMs,
        currentWpm: reading.currentWpm,
        targetWpm,
        pauseCount: reading.pauses.length,
        pauses: reading.pauses,
        rereadCount: reading.rereads.length,
        rereads: reading.rereads,
        feel,
      }),
    [reading, targetWpm, feel],
  );

  // Levers the engine has actually formed a view about, strongest opinion first.
  const learned = useMemo(() => {
    const rules = Object.keys(LEVER_LABEL) as AdaptiveRule[];
    return rules
      .map((rule) => ({ rule, ...leverOf(memory, rule) }))
      .filter((lever) => lever.uses > 0)
      .sort((a, b) => Math.abs(b.trust - 1) - Math.abs(a.trust - 1));
  }, [memory]);

  const mood: CompanionMood =
    mode !== "adaptive" ? "resting" : learned.length === 0 ? "watching" : strain.peak > 0.5 ? "thinking" : "pleased";

  const headline =
    mode !== "adaptive"
      ? "Adaptive is off, so I am not watching this sitting."
      : learned.length === 0
        ? "Still learning how you read. Nothing worth changing yet."
        : strain.peak > 0.5
          ? "This page is costing you more than the last one."
          : "This is going well.";

  return (
    <Panel className="mt-4">
      <div className="flex items-start gap-4 px-5 py-5 sm:gap-5">
        <Companion mood={mood} label="Lens, your reading companion" className="size-14 shrink-0 sm:size-16" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">What I have learned</p>
          <p className="mt-1.5 text-sm leading-relaxed text-pretty">{headline}</p>

          {learned.length > 0 ? (
            <ul className="mt-3 space-y-1.5">
              {learned.map((lever) => {
                // Trust above 1 means the change measurably reduced strain for
                // this reader; below means it did not, and the engine has
                // stopped reaching for it first.
                const helped = lever.trust > 1 + 0.001;
                const gaveUp = lever.trust <= TRUST.min + 0.001;
                return (
                  <li key={lever.rule} className="flex items-baseline gap-2 text-sm">
                    <span
                      aria-hidden
                      className={`mt-1.5 size-1.5 shrink-0 rounded-full ${helped ? "bg-accent" : "bg-fg/25"}`}
                    />
                    <span className="text-muted">
                      {helped
                        ? `${LEVER_LABEL[lever.rule]} helped, so I try it sooner`
                        : gaveUp
                          ? `${LEVER_LABEL[lever.rule]} did not help you, so I have stopped suggesting it`
                          : `${LEVER_LABEL[lever.rule]} made little difference`}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}

import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { doneMarker, resumeStep } from "@/lib/coach-progress";
import { track } from "@/lib/analytics";

export const COACH_KEY = "neurolens-coach";
export const STARTED_KEY = "neurolens-started";

/**
 * What a reader needs to know to get going, in the order they will need it.
 *
 * Five now, not three. The two added are the tools nobody discovers on their
 * own: that dragging across a phrase marks it, and that the highlighter button
 * hides a palette and a pen. Those are a gesture and a menu — neither is a
 * button sitting on screen waiting to be noticed, so either they are mentioned
 * here or they may as well not exist.
 */
const STEPS = [
  "Scroll to read. Options, on the left of the bar, changes type and color.",
  "Guides can split syllables, mark b and d, and swap dense words for simpler ones.",
  "Drag across any phrase to highlight it. The highlighter button holds six colors.",
  "That button also has Draw on the page — pen, marker, eraser. A stylus just draws.",
  "The number on the right is how far you are. More holds the quieter tools.",
];

function mark(key: string, value = "1") {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function markStarted() {
  mark(STARTED_KEY);
  if (typeof document !== "undefined") document.documentElement.dataset.started = "1";
}

export function ReadingCoach() {
  const progress = useAppStore((s) => s.reading.progress);
  const [step, setStep] = useState<number | null>(null);

  useEffect(() => {
    setStep(resumeStep(read(COACH_KEY), STEPS.length));
  }, []);

  if (step == null || progress >= 0.12) return null;

  function finish() {
    // Stamped with how many steps existed, so a later release can show what it
    // added without replaying the whole tour.
    mark(COACH_KEY, doneMarker(STEPS.length));
    setStep(null);
  }

  function next() {
    if (step == null) return;
    if (step >= STEPS.length - 1) {
      track("tour", { step: String(step + 1), action: "done" });
      finish();
      return;
    }
    track("tour", { step: String(step + 1), action: "next" });
    const index = step + 1;
    mark(COACH_KEY, String(index));
    setStep(index);
  }

  return (
    <div
      role="status"
      className="material-surface pointer-events-auto flex max-w-md flex-col gap-2 rounded-lg px-3 py-2.5 shadow-float sm:flex-row sm:items-center"
    >
      <p className="min-w-0 text-xs leading-relaxed text-pretty">{STEPS[step]}</p>
      <div className="flex shrink-0 gap-1.5">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            track("tour", { step: String(step + 1), action: "skip" });
            finish();
          }}
        >
          Skip
        </Button>
        <Button size="sm" onClick={next}>
          {step >= STEPS.length - 1 ? "Got it" : "Next"}
        </Button>
      </div>
    </div>
  );
}

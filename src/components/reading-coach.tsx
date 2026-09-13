import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";

export const COACH_KEY = "neurolens-coach";
export const STARTED_KEY = "neurolens-started";

const STEPS = [
  "Scroll to read. Options, on the left of the bar, changes type and color.",
  "Guides can split syllables, mark b and d, and swap dense words for simpler ones.",
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
    const raw = read(COACH_KEY);
    if (raw === "done") {
      setStep(null);
      return;
    }
    const next = Number(raw);
    setStep(Number.isFinite(next) && next >= 0 && next < STEPS.length ? next : 0);
  }, []);

  if (step == null || progress >= 0.12) return null;

  function finish() {
    mark(COACH_KEY, "done");
    setStep(null);
  }

  function next() {
    if (step == null) return;
    if (step >= STEPS.length - 1) {
      finish();
      return;
    }
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
        <Button size="sm" variant="ghost" onClick={finish}>
          Skip
        </Button>
        <Button size="sm" onClick={next}>
          {step >= STEPS.length - 1 ? "Got it" : "Next"}
        </Button>
      </div>
    </div>
  );
}

import { toast } from "sonner";
import { useAppStore } from "@/lib/store";
import { feedback } from "@/lib/feedback";
import { Button } from "@/components/ui/button";
import type { ReadingFeel } from "@/lib/types";

const OPTIONS: { id: ReadingFeel; label: string }[] = [
  { id: "slow", label: "Too fast" },
  { id: "right", label: "Just right" },
  { id: "fast", label: "Too slow" },
];

export function ReadingFeelBar() {
  const progress = useAppStore((s) => s.reading.progress);
  const feel = useAppStore((s) => s.readingFeel);
  const submit = useAppStore((s) => s.submitReadingFeel);
  const targetWpm = useAppStore((s) => s.targetWpm);
  const setTargetWpm = useAppStore((s) => s.setTargetWpm);
  const locked = useAppStore((s) => s.lockedSettings.includes("targetWpm"));
  const mode = useAppStore((s) => s.mode);

  if (progress < 0.12 || feel) return null;

  function choose(id: ReadingFeel) {
    feedback(id === "right" ? "good" : "ok", {
      message:
        id === "right" ? "Pace noted as right" : id === "slow" ? "Marked as too fast" : "Marked as too slow",
    });
    submit(id);
    if (id === "right") {
      toast.success("Noted. We’ll keep this pace in mind.");
      return;
    }
    if (locked) {
      toast("Thanks — Target WPM is locked, so nothing will change.");
      return;
    }
    if (mode === "adaptive") {
      toast.success(id === "slow" ? "Adaptive will offer a slower target." : "Adaptive will offer a faster target.");
      return;
    }
    const next = id === "slow" ? Math.max(120, targetWpm - 20) : Math.min(480, targetWpm + 20);
    toast(id === "slow" ? "This stretch felt rushed." : "You had room to go a little faster.", {
      description: `Move target to ${next} WPM?`,
      action: {
        label: "Apply",
        onClick: () => setTargetWpm(next),
      },
    });
  }

  return (
    <div
      role="group"
      aria-label="How is this pace?"
      className="material-surface pointer-events-auto flex max-w-md flex-col gap-2 rounded-lg px-3 py-2.5 shadow-float sm:flex-row sm:items-center"
    >
      <p className="text-xs font-medium text-muted">How is this pace?</p>
      <div className="flex flex-wrap gap-1.5">
        {OPTIONS.map((option) => (
          <Button key={option.id} size="sm" variant="outline" onClick={() => choose(option.id)}>
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

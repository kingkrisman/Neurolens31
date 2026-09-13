import { useEffect, useMemo, useState } from "react";
import { Pause, Play } from "lucide-react";
import { resolveRhythmCurve, rsvpDelayMs, splitOrp } from "@/lib/rhythm";
import { isSentenceBoundary } from "@/lib/sentences";
import { tapFeedback } from "@/lib/feedback";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/field";
import { IconSwap } from "@/components/ui/icon-swap";
import { Progress } from "@/components/ui/surfaces";
import { announce } from "@/lib/announce";

export function SpeedReader({
  open,
  onOpenChange,
  words,
  onProgress,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  words: string[];
  onProgress?: (index: number) => void;
}) {
  const profile = useAppStore((s) => s.profile);
  const targetWpm = useAppStore((s) => s.targetWpm);
  const progress = useAppStore((s) => s.reading.progress);
  const setAutoScrolling = useAppStore((s) => s.setAutoScrolling);
  const [playing, setPlaying] = useState(false);
  const [wpm, setWpm] = useState(targetWpm);
  const [index, setIndex] = useState(0);
  const rhythmCurve = resolveRhythmCurve(profile.rhythmCurve, profile.rhythmOptimization);

  useEffect(() => {
    if (!open) return;
    const start = words.length
      ? Math.min(words.length - 1, Math.max(0, Math.floor(progress * words.length)))
      : 0;
    setIndex(start);
    setWpm(targetWpm);
    setPlaying(words.length > 0);
    setAutoScrolling(false);
    tapFeedback("start");
  }, [open, words.length, progress, targetWpm, setAutoScrolling]);

  useEffect(() => {
    if (!open) return;
    onProgress?.(index);
  }, [open, index, onProgress]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        event.preventDefault();
        setPlaying((prev) => !prev);
      } else if (event.code === "ArrowRight") {
        event.preventDefault();
        skipSentence(1);
      } else if (event.code === "ArrowLeft") {
        event.preventDefault();
        skipSentence(-1);
      } else if (event.code === "Escape") {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, words, index, onOpenChange]);

  useEffect(() => {
    if (!open || !playing || words.length === 0) return;
    const delay = rsvpDelayMs(words[index] || "", wpm, rhythmCurve, words[index + 1] || "");
    const timer = window.setTimeout(() => {
      setIndex((prev) => {
        if (prev >= words.length - 1) {
          setPlaying(false);
          announce("End of speed reader");
          return prev;
        }
        return prev + 1;
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [open, playing, wpm, words, index, rhythmCurve]);

  function skipSentence(direction: 1 | -1) {
    if (words.length === 0) return;
    if (direction > 0) {
      let next = index;
      while (next < words.length - 1 && !isSentenceBoundary(words[next] || "", words[next + 1] || "")) {
        next += 1;
      }
      setIndex(Math.min(words.length - 1, next + 1));
      return;
    }
    let prev = index > 0 ? index - 1 : 0;
    while (prev > 0 && !isSentenceBoundary(words[prev - 1] || "", words[prev] || "")) {
      prev -= 1;
    }
    setIndex(prev);
  }

  const word = words[index] || "";
  const parts = splitOrp(word);
  const remaining = Math.max(0, words.length - index);
  const minutes = remaining / Math.max(80, wpm);
  const pct = words.length ? Math.round(((index + 1) / words.length) * 100) : 0;
  const done = words.length > 0 && index >= words.length - 1 && !playing;

  const stage = useMemo(
    () => (
      <div className="rsvp-stage mx-auto w-full max-w-lg font-medium tracking-tight">
        <span className="rsvp-before">{parts.before}</span>
        <span className="rsvp-orp">{parts.orp || "·"}</span>
        <span className="rsvp-after">{parts.after}</span>
      </div>
    ),
    [parts.after, parts.before, parts.orp],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(100%-1.5rem,36rem)] text-center">
        <DialogTitle className="text-sm font-medium text-muted">Speed reader</DialogTitle>
        <DialogDescription className="sr-only">
          Visual one-word display aligned to the recognition point. This is not spoken. Use Listen in the
          reader for speech. Space pauses. Arrows skip a sentence.
        </DialogDescription>
        <p className="mt-1 text-xs text-muted">
          Starts where you left the page. The accent letter is the landing point. Spoken reading lives on Listen.
        </p>
        <div className="relative mt-6 min-h-28" aria-hidden="true">
          {stage}
          <div className="rsvp-tick" />
        </div>
        <div className="mt-4">
          <Progress value={pct} label="Speed reader progress" />
          <p className="mt-2 text-xs tabular-nums text-muted">
            {index + 1} / {words.length} · {wpm} WPM · {done ? "done" : `~${Math.max(1, Math.ceil(minutes * 60))}s left`}
          </p>
        </div>
        <div className="mt-4">
          <Slider
            min={120}
            max={600}
            step={10}
            value={[wpm]}
            onValueChange={([value]) => setWpm(value ?? targetWpm)}
            aria-label="Words per minute"
          />
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button variant="outline" onClick={() => setPlaying((prev) => !prev)}>
            <IconSwap active={playing} ActiveIcon={Pause} InactiveIcon={Play} />
            {playing ? "Pause" : "Play"}
          </Button>
          <Button variant="ghost" onClick={() => skipSentence(-1)}>
            Last sentence
          </Button>
          <Button variant="ghost" onClick={() => skipSentence(1)}>
            Next sentence
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useRef, useState } from "react";
import { Compass } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { tapFeedback } from "@/lib/feedback";
import { Button } from "@/components/ui/button";
import {
  buildLocalRecap,
  detectDisengagement,
  dismissReconnect,
  recapCacheKey,
  reconnectDismissed,
  windowForModel,
  type ReconnectRecap,
} from "@/lib/reconnect";
import { shapeRecap } from "@/lib/reconnect-ai";

const recapCache = new Map<string, ReconnectRecap>();
let recapCalls = 0;
const MAX_RECAP_CALLS = 6;
const shapedFor = new Set<string>();

export function ReconnectDock({
  text,
  open,
  onOpenChange,
  onResume,
}: {
  text: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResume: (progress: number) => void;
}) {
  const progress = useAppStore((s) => s.reading.progress);
  const elapsedActiveMs = useAppStore((s) => s.reading.elapsedActiveMs);
  const pauses = useAppStore((s) => s.reading.pauses);
  const rereads = useAppStore((s) => s.reading.rereads);
  const skips = useAppStore((s) => s.reading.skips);
  const pausedAt = useAppStore((s) => s.reading.pausedAt);
  const startedAt = useAppStore((s) => s.reading.startedAt);
  const autoScrolling = useAppStore((s) => s.autoScrolling);
  const [now, setNow] = useState(() => Date.now());
  const [recap, setRecap] = useState<ReconnectRecap | null>(null);
  const [shaping, setShaping] = useState(false);
  const [openPrompt, setOpenPrompt] = useState("A short recap of the last solid stretch.");
  const lastText = useRef(text);
  const openProgress = useRef(progress);

  useEffect(() => {
    if (lastText.current === text) return;
    lastText.current = text;
    recapCalls = 0;
    setRecap(null);
  }, [text]);

  useEffect(() => {
    if (!pausedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [pausedAt]);

  const idleMs = pausedAt ? Math.max(0, now - pausedAt) : 0;
  const nudge = detectDisengagement({
    progress,
    elapsedActiveMs,
    pauses,
    rereads,
    skips,
    now,
    startedAt,
    autoScrolling,
    idleMs,
  });
  const silenced = reconnectDismissed(now);
  const showChip = Boolean(nudge) && !open && !silenced && !autoScrolling;

  useEffect(() => {
    if (!open) {
      setShaping(false);
      return;
    }
    const state = useAppStore.getState();
    const at = state.reading.progress;
    openProgress.current = at;
    const live = detectDisengagement({
      progress: at,
      elapsedActiveMs: state.reading.elapsedActiveMs,
      pauses: state.reading.pauses,
      rereads: state.reading.rereads,
      skips: state.reading.skips,
      now: Date.now(),
      startedAt: state.reading.startedAt,
      autoScrolling: state.autoScrolling,
      idleMs: state.reading.pausedAt ? Date.now() - state.reading.pausedAt : 0,
    });
    setOpenPrompt(live?.prompt ?? "A short recap of the last solid stretch.");
    const key = recapCacheKey(text, at);
    const local = recapCache.get(key) ?? buildLocalRecap(text, at);
    recapCache.set(key, local);
    setRecap(local);

    if (shapedFor.has(key) || recapCalls >= MAX_RECAP_CALLS) return;
    const slice = windowForModel(text, at);
    if (!slice.covered.trim()) return;

    let cancelled = false;
    recapCalls += 1;
    shapedFor.add(key);
    setShaping(true);
    void shapeRecap({ data: { covered: slice.covered, next: slice.next, progress: at, text } })
      .then((result) => {
        if (cancelled || !result?.recap) return;
        recapCache.set(key, result.recap);
        setRecap(result.recap);
      })
      .catch(() => {
        /* local recap already on screen */
      })
      .finally(() => {
        if (!cancelled) setShaping(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, text]);

  function closeQuiet() {
    dismissReconnect();
    setNow(Date.now());
    onOpenChange(false);
  }

  function takeThere() {
    const skip = (skips ?? []).at(-1);
    const fromSkip =
      skip && Date.now() - skip.at < 90_000 && skip.to - skip.from >= 0.12 ? skip.from : null;
    const target = fromSkip ?? recap?.resumeAt ?? Math.max(0, openProgress.current - 0.08);
    tapFeedback("ok");
    onResume(target);
    closeQuiet();
  }

  if (!showChip && !open) return null;

  if (!open && nudge) {
    return (
      <div
        role="status"
        className="material-surface pointer-events-auto flex max-w-md flex-col gap-2 rounded-lg px-3 py-2.5 shadow-float sm:flex-row sm:items-center"
      >
        <p className="min-w-0 text-xs leading-relaxed text-pretty">{nudge.prompt}</p>
        <div className="flex shrink-0 gap-1.5">
          <Button size="sm" variant="ghost" onClick={closeQuiet}>
            Not now
          </Button>
          <Button
            size="sm"
            onClick={() => {
              tapFeedback("ok");
              onOpenChange(true);
            }}
          >
            Reconnect
          </Button>
        </div>
      </div>
    );
  }

  const body = recap ?? buildLocalRecap(text, progress);

  return (
    <div
      role="dialog"
      aria-label="Reconnect"
      className="material-surface pointer-events-auto w-[min(28rem,calc(100vw-1.5rem))] rounded-lg p-3 shadow-float"
    >
      <p className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted uppercase">
        <Compass size={14} aria-hidden className="icon-motion icon-turn" />
        Reconnect
      </p>
      <p className="mt-1 text-sm leading-relaxed">{openPrompt}</p>
      <p className="mt-3 text-xs font-medium tracking-wide text-muted uppercase">What you just covered</p>
      <p className="mt-1 text-sm leading-relaxed text-pretty">{body.recap}</p>
      <blockquote className="mt-3 rounded-sm border-l-2 border-accent bg-fg/4 px-3 py-2">
        <p className="text-xs font-medium tracking-wide text-muted uppercase">Main idea</p>
        <p className="mt-1 font-serif text-base leading-snug text-pretty">{body.idea}</p>
      </blockquote>
      <p className="mt-3 text-xs font-medium tracking-wide text-muted uppercase">What matters next</p>
      <p className="mt-1 text-sm leading-relaxed text-pretty text-muted">{body.next}</p>
      {shaping ? <p className="mt-2 text-xs text-muted">Shaping the recap…</p> : null}
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={closeQuiet}>
          Not now
        </Button>
        <Button size="sm" onClick={takeThere}>
          Take me there
        </Button>
      </div>
    </div>
  );
}

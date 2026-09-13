import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { microphone, speakerHigh, x } from "@/lib/ph-icons";
import { useAppStore } from "@/lib/store";
import { Companion, type CompanionMood } from "@/components/companion";
import { Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { askNeuro, NEURO_SUGGESTIONS, type NeuroAction } from "@/lib/neuro-intents";
import { dictateOnce, listenForWake, voiceSupported } from "@/lib/neuro-voice";
import { announce } from "@/lib/announce";
import { lookupWord, speakWord, type WordSense } from "@/lib/dictionary";
import { useReducedMotion } from "@/lib/prefers-reduced-motion";
import { useDismiss } from "@/lib/use-dismiss";
import { impact } from "@/lib/haptics";
import { cn } from "@/lib/utils";

const DOCK_KEY = "neurolens-neuro-dock";
const VOICE_KEY = "neurolens-neuro-voice";

interface Dock {
  /** Fraction of the viewport, so the position survives a resize or a rotation. */
  x: number;
  y: number;
}

const DEFAULT_DOCK: Dock = { x: 0.94, y: 0.86 };

function readDock(): Dock {
  try {
    const raw = JSON.parse(localStorage.getItem(DOCK_KEY) || "null") as Dock | null;
    if (raw && Number.isFinite(raw.x) && Number.isFinite(raw.y)) {
      return { x: Math.min(1, Math.max(0, raw.x)), y: Math.min(1, Math.max(0, raw.y)) };
    }
  } catch {
    /* private mode */
  }
  return DEFAULT_DOCK;
}

/**
 * Neuro — the companion, everywhere.
 *
 * Floats above every view, can be dragged anywhere, answers questions about the
 * app, and carries out the ones that map to a setting. It can be dismissed
 * outright from Settings, which is not a token option: a face that follows you
 * across an app you are trying to read in is exactly the kind of thing some of
 * these readers will want gone, and the honest way to offer it is to make
 * leaving as easy as arriving.
 *
 * Position is stored as a fraction of the viewport rather than in pixels, so
 * where you put it survives a resize, a rotation, and a different screen.
 */
export function Neuro() {
  const profile = useAppStore((s) => s.profile);
  const setProfile = useAppStore((s) => s.setProfile);
  const setTab = useAppStore((s) => s.setTab);
  const setMode = useAppStore((s) => s.setMode);
  const setControlsOpen = useAppStore((s) => s.setControlsOpen);
  const targetWpm = useAppStore((s) => s.targetWpm);
  const setTargetWpm = useAppStore((s) => s.setTargetWpm);

  const [open, setOpen] = useState(false);
  const [dock, setDock] = useState<Dock>(DEFAULT_DOCK);
  const [dragging, setDragging] = useState(false);
  const [question, setQuestion] = useState("");
  const [said, setSaid] = useState<string | null>(null);
  const [voiceOn, setVoiceOn] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [heard, setHeard] = useState<string | null>(null);
  const [dictating, setDictating] = useState(false);
  const [sense, setSense] = useState<WordSense | null>(null);
  const [looking, setLooking] = useState(false);
  const stopDictation = useRef<(() => void) | null>(null);
  const reduce = useReducedMotion();

  const rootRef = useRef<HTMLDivElement>(null);
  const dragged = useRef(false);
  const grab = useRef({ dx: 0, dy: 0 });

  useEffect(() => {
    setDock(readDock());
    try {
      setVoiceOn(localStorage.getItem(VOICE_KEY) === "on");
    } catch {
      /* private mode */
    }
  }, []);

  /** Run what a question asked for. Everything here is a real app setting. */
  const perform = useCallback(
    (action: NeuroAction) => {
      const current = useAppStore.getState().profile;
      const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
      switch (action.kind) {
        case "setBionic":
          setProfile({ ...current, bionicStrength: action.value });
          break;
        case "adjustBionic":
          setProfile({ ...current, bionicStrength: clamp(current.bionicStrength + action.delta, 0, 1) });
          break;
        case "adjustFontSize":
          setProfile({ ...current, fontSize: clamp(current.fontSize + action.delta, 14, 28) });
          break;
        case "adjustLineHeight":
          setProfile({
            ...current,
            lineHeight: Math.round(clamp(current.lineHeight + action.delta, 1.4, 2.2) * 10) / 10,
          });
          break;
        case "adjustWpm":
          setTargetWpm(clamp(targetWpm + action.delta, 120, 480));
          break;
        case "setTheme":
          setProfile({ ...current, theme: action.value });
          break;
        case "toggle":
          setProfile({ ...current, [action.setting]: !current[action.setting] });
          break;
        case "goTab":
          setTab(action.tab);
          break;
        case "openPanel":
          if (action.panel === "options") setControlsOpen(true);
          else window.dispatchEvent(new CustomEvent("nl-neuro-panel", { detail: action.panel }));
          break;
        case "setMode":
          setMode(action.mode);
          break;
        case "hide":
          setProfile({ ...current, companion: false });
          break;
        default:
          break;
      }
    },
    [setProfile, setTab, setMode, setControlsOpen, setTargetWpm, targetWpm],
  );

  const ask = useCallback(
    (text: string) => {
      const reply = askNeuro(text);
      setSaid(reply.text);
      setSense(null);
      announce(reply.text);
      setQuestion("");

      if (reply.action.kind === "define") {
        const word = reply.action.word;
        setLooking(true);
        void lookupWord(word)
          .then((found) => {
            setLooking(false);
            if (found) {
              setSense(found);
              // Read out as a sentence rather than a card: a screen reader
              // getting "noun" and a phonetic spelling on their own has been
              // told the shape of an answer, not the answer.
              announce(`${found.word}, ${found.partOfSpeech}. ${found.definition}`);
              setSaid(null);
            } else {
              setSaid(`I could not find “${word}”. It may be a name, or spelled differently.`);
            }
          })
          .catch(() => {
            setLooking(false);
            setSaid(`I could not reach the dictionary for “${word}”. It needs a connection.`);
          });
        return;
      }

      perform(reply.action);
    },
    [perform],
  );

  /** Speak a request instead of typing it. One utterance, then the mic closes. */
  const dictate = useCallback(() => {
    if (dictating) {
      stopDictation.current?.();
      setDictating(false);
      return;
    }
    setDictating(true);
    setQuestion("");
    stopDictation.current = dictateOnce({
      // Fill the field as the words arrive, so it is visibly hearing you.
      onPartial: (text) => setQuestion(text),
      onFinal: (text) => {
        setDictating(false);
        setQuestion(text);
        // Answered straight away: having spoken a request, being made to press
        // a second button to send it is the kind of step that makes a voice
        // feature feel slower than typing.
        ask(text);
      },
      onError: (reason) => {
        setDictating(false);
        setVoiceError(reason);
      },
    });
  }, [dictating, ask]);

  // Wake word. Only ever running because someone switched it on.
  useEffect(() => {
    if (!voiceOn) return;
    const stop = listenForWake({
      onWake: () => {
        // Un-hide first. The listener keeps running while hidden — that is the
        // point of a wake word — but waking only opened the panel, and a hidden
        // companion renders nothing for the panel to open on. It heard its name
        // and had no way back.
        const current = useAppStore.getState().profile;
        if (current.companion === false) {
          setProfile({ ...current, companion: true });
        }
        setOpen(true);
        setSaid("You called?");
        announce("Neuro is listening");
      },
      onHeard: (transcript) => setHeard(transcript),
      onError: (reason) => setVoiceError(reason),
    });
    return stop;
  }, [voiceOn, setProfile]);

  // Pressing anywhere else closes it. `rootRef` covers the panel and the orb
  // together, so the orb still toggles instead of closing and reopening.
  useDismiss(rootRef, open, useCallback(() => setOpen(false), []));

  // Escape closes the panel before it closes anything behind it.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  function onPointerDown(event: React.PointerEvent) {
    const node = rootRef.current;
    if (!node) return;
    const box = node.getBoundingClientRect();
    grab.current = { dx: event.clientX - box.left, dy: event.clientY - box.top };
    dragged.current = false;
    setDragging(true);
    // Picked up, and later set down. A dragged object that gives nothing at
    // either end feels like it is sliding rather than being held.
    impact("soft");
    node.setPointerCapture(event.pointerId);
  }

  // Lean in the direction of travel while being dragged, and settle back after.
  // Weight is what separates something being carried from something teleporting
  // — a shape that stays perfectly upright while it moves reads as a cursor,
  // not as a companion.
  const lean = useRef({ x: 0, y: 0 });

  function onPointerMove(event: React.PointerEvent) {
    if (!dragging) return;
    const node = rootRef.current;
    if (!node) return;
    const box = node.getBoundingClientRect();
    // A few pixels of slack, so a click with a shaky hand still reads as a
    // click rather than becoming an accidental drag.
    if (Math.abs(event.movementX) + Math.abs(event.movementY) > 2) dragged.current = true;
    const x = (event.clientX - grab.current.dx + box.width / 2) / window.innerWidth;
    const y = (event.clientY - grab.current.dy + box.height / 2) / window.innerHeight;
    setDock({ x: Math.min(0.98, Math.max(0.02, x)), y: Math.min(0.96, Math.max(0.04, y)) });

    // Written straight to the node: this runs on every pointer frame, and the
    // tilt is presentation only — nothing else needs to know about it.
    lean.current.x = lean.current.x * 0.7 + event.movementX * 0.3;
    lean.current.y = lean.current.y * 0.7 + event.movementY * 0.3;
    const tilt = Math.max(-14, Math.min(14, lean.current.x * 0.9));
    const squash = Math.min(0.12, Math.hypot(lean.current.x, lean.current.y) * 0.006);
    const orb = rootRef.current?.querySelector<HTMLElement>(".nl-neuro-orb");
    if (orb) {
      orb.style.transform = `rotate(${tilt.toFixed(1)}deg) scale(${(1.1 + squash).toFixed(3)}, ${(1.1 - squash).toFixed(3)})`;
    }
  }

  function onPointerUp(event: React.PointerEvent) {
    if (!dragging) return;
    setDragging(false);
    rootRef.current?.releasePointerCapture(event.pointerId);
    const orb = rootRef.current?.querySelector<HTMLElement>(".nl-neuro-orb");
    if (orb) orb.style.transform = "";
    lean.current = { x: 0, y: 0 };
    // Rigid on release: the sharpest tap available, which is what reads as
    // something landing rather than drifting to a stop.
    if (dragged.current) impact("rigid");
    try {
      localStorage.setItem(DOCK_KEY, JSON.stringify(dock));
    } catch {
      /* private mode */
    }
    if (!dragged.current) setOpen((value) => !value);
  }

  if (profile.companion === false) return null;

  const mood: CompanionMood = dragging ? "pleased" : open ? "watching" : voiceOn ? "idle" : "idle";
  // Anchor the panel on the side with room for it.
  const leftHalf = dock.x < 0.5;

  return (
    <div
      ref={rootRef}
      className={cn(
        "fixed z-70 -translate-x-1/2 -translate-y-1/2 select-none",
        dragging ? "cursor-grabbing" : "cursor-grab",
        !dragging && !reduce && "transition-[left,top] duration-300 ease-[var(--ease-out)]",
      )}
      style={{ left: `${dock.x * 100}%`, top: `${dock.y * 100}%` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <button
        type="button"
        aria-label={open ? "Close Neuro" : "Ask Neuro"}
        aria-expanded={open}
        className={cn(
          // No background of its own: the companion draws a face circle, and a
          // second circle behind it read as a ring around a smaller head. The
          // button is a hit target, the face is the shape.
          "nl-neuro-orb icon-group flex size-16 items-center justify-center rounded-full",
          "transition-transform duration-[160ms] ease-[var(--ease-out)]",
          "focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-fg)_22%,transparent)]",
          dragging && "scale-110",
        )}
        // Dragging is handled on the wrapper; the button only reports its state.
        onClick={(event) => event.preventDefault()}
      >
        <Companion mood={mood} follow className="size-16 drop-shadow-[0_6px_16px_rgba(0,0,0,0.18)]" />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Ask Neuro"
          className={cn(
            "nl-menu-in absolute bottom-[calc(100%+0.75rem)] w-[min(20rem,calc(100vw-2rem))] rounded-lg bg-surface p-3 shadow-float",
            leftHalf ? "left-0 origin-bottom-left" : "right-0 origin-bottom-right",
          )}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <p className="text-xs font-medium tracking-wide text-muted uppercase">Ask Neuro</p>
            <button
              type="button"
              aria-label="Close"
              className="icon-group -mt-0.5 -mr-0.5 rounded-sm p-1 text-muted hover:text-fg"
              onClick={() => setOpen(false)}
            >
              <Icon icon={x} width={14} height={14} aria-hidden className="icon-motion icon-turn" />
            </button>
          </div>

          {said ? (
            <p className="mb-3 rounded-md bg-bg px-3 py-2.5 text-sm leading-relaxed text-pretty">{said}</p>
          ) : null}

          {looking ? (
            <p className="mb-3 rounded-md bg-bg px-3 py-2.5 text-sm text-muted">Looking it up…</p>
          ) : null}

          {sense ? (
            <div className="mb-3 rounded-md bg-bg px-3 py-2.5">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium">{sense.word}</span>
                {sense.phonetic ? (
                  <span className="text-xs text-muted">{sense.phonetic}</span>
                ) : null}
                <button
                  type="button"
                  onClick={() => speakWord(sense.word)}
                  aria-label={`Hear ${sense.word}`}
                  className="icon-group ml-auto rounded-sm p-1 text-muted hover:text-fg"
                >
                  <Icon icon={speakerHigh} width={14} height={14} aria-hidden className="icon-motion icon-lift" />
                </button>
              </div>
              <p className="mt-1 text-xs text-subtle italic">{sense.partOfSpeech}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-pretty">{sense.definition}</p>
              {sense.example ? (
                <p className="mt-2 border-l-2 border-fg/10 pl-2.5 text-sm leading-relaxed text-pretty text-muted italic">
                  {sense.example}
                </p>
              ) : null}
            </div>
          ) : null}

          <form
            className="flex items-center gap-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              ask(question);
            }}
          >
            <Input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder={dictating ? "Listening…" : "Reduce the fixation…"}
              aria-label="Ask Neuro a question"
              autoFocus
              className="min-w-0 flex-1"
            />
            {voiceSupported() ? (
              <button
                type="button"
                onClick={dictate}
                aria-label={dictating ? "Stop listening" : "Speak your request"}
                aria-pressed={dictating}
                className={cn(
                  "icon-group flex size-9 shrink-0 items-center justify-center rounded-md",
                  "transition-[background-color,color] duration-[140ms] ease-[var(--ease-out)]",
                  dictating ? "nl-neuro-listening bg-accent/15 text-accent" : "text-muted hover:bg-fg/6 hover:text-fg",
                )}
              >
                <Icon icon={microphone} width={17} height={17} aria-hidden className="icon-motion icon-lift" />
              </button>
            ) : null}
          </form>

          {!said ? (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {NEURO_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="rounded-full bg-fg/6 px-2.5 py-1 text-xs text-muted transition-colors hover:bg-fg/10 hover:text-fg"
                  onClick={() => ask(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          ) : null}

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-fg/8 pt-2.5">
            {voiceSupported() ? (
              <label className="flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={voiceOn}
                  onChange={(event) => {
                    const on = event.target.checked;
                    setVoiceOn(on);
                    setVoiceError(null);
                    try {
                      localStorage.setItem(VOICE_KEY, on ? "on" : "off");
                    } catch {
                      /* private mode */
                    }
                  }}
                />
                Say “Neuro” to call me
              </label>
            ) : (
              <span className="text-xs text-subtle">Voice needs Chrome</span>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 text-xs"
              onClick={() => setProfile({ ...profile, companion: false })}
            >
              Hide me
            </Button>
          </div>

          {voiceOn ? (
            <p className="mt-2 text-xs leading-relaxed text-subtle">
              {voiceError === "not-allowed" || voiceError === "service-not-allowed"
                ? "Microphone permission was declined, so I cannot listen. Allow it from the padlock in the address bar."
                : voiceError === "network"
                  ? "Speech recognition needs a network connection, and there is none."
                  : voiceError
                    ? `Listening stopped: ${voiceError}.`
                    : heard
                      ? `Heard “${heard}”. Say “Neuro” and I will open.`
                      : "Listening for my name. Your browser sends audio to its speech service to do this — everything else in NeuroLens stays on your device."}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}


import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/lib/prefers-reduced-motion";
import { cn } from "@/lib/utils";

export type CompanionMood = "idle" | "watching" | "pleased" | "thinking" | "resting";

/**
 * How far the eyes travel, in viewBox units.
 *
 * The viewBox is 100 units wide and the orb renders at around 44px, so every
 * unit is worth well under half a screen pixel. Values tuned by eye in the
 * viewBox are therefore roughly half as large as they look in the source — the
 * first pass used 7 and 5, which came to about three pixels of travel and read
 * as nothing moving at all.
 */
const GAZE_X = 16;
const GAZE_Y = 11;

/**
 * Neuro — the companion.
 *
 * A face is a strong thing to put in an app for people who are easily pulled
 * away from what they are reading, so the rule it follows is the one the rest
 * of the motion here follows: it is contingent, never a loop. It blinks on an
 * irregular schedule, watches the pointer, glances around of its own accord
 * when nothing has happened, and leans when it is dragged. A face that moves on
 * a timer reads as decoration; one that responds reads as attention.
 *
 * Everything per-frame is written straight to the DOM through a ref. The first
 * version held the gaze in React state and re-rendered on every `pointermove` —
 * a render per mouse pixel, for an effect that only changes one transform.
 */
export function Companion({
  mood = "idle",
  className,
  label,
  /** Watch the pointer anywhere on screen, rather than only when it is close. */
  follow = false,
}: {
  mood?: CompanionMood;
  className?: string;
  label?: string;
  follow?: boolean;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const eyesRef = useRef<SVGGElement>(null);
  const reduce = useReducedMotion();
  const [blinking, setBlinking] = useState(false);

  /**
   * Blink on an irregular schedule.
   *
   * A fixed interval is what gives a mascot away — real blinking clusters and
   * drifts — so the next one is drawn from a range rather than counted off a
   * metronome, with the occasional double blink. That last detail is small and
   * does more than anything else here to stop it reading as a machine.
   */
  useEffect(() => {
    if (reduce || mood === "resting") return;
    let timer = 0;
    const blink = () => {
      setBlinking(true);
      window.setTimeout(() => setBlinking(false), 130);
      if (Math.random() < 0.22) {
        window.setTimeout(() => {
          setBlinking(true);
          window.setTimeout(() => setBlinking(false), 110);
        }, 260);
      }
    };
    const schedule = () => {
      timer = window.setTimeout(
        () => {
          blink();
          schedule();
        },
        3000 + Math.random() * 5000,
      );
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [reduce, mood]);

  /**
   * Watch the pointer, and look around when there is nothing to watch.
   *
   * One rAF loop drives both. The eyes ease toward a target rather than snapping
   * to it, which is most of what makes the movement read as *looking* rather
   * than as a value being assigned. After a few seconds with the pointer still,
   * the target wanders on its own — so an idle cursor leaves a curious face
   * instead of a frozen one.
   */
  useEffect(() => {
    if (reduce || mood === "resting") return;
    const node = ref.current;
    const eyes = eyesRef.current;
    if (!node || !eyes) return;

    let raf = 0;
    let targetX = 0;
    let targetY = 0;
    let x = 0;
    let y = 0;
    let idleSince = performance.now();
    let nextGlance = 0;

    const onMove = (event: PointerEvent) => {
      const box = node.getBoundingClientRect();
      const dx = event.clientX - (box.left + box.width / 2);
      const dy = event.clientY - (box.top + box.height / 2);
      const distance = Math.hypot(dx, dy) || 1;

      if (follow) {
        // The floating companion looks anywhere on screen. Direction carries
        // the meaning, so magnitude saturates early and then holds.
        const reach = Math.min(1, distance / 260);
        targetX = (dx / distance) * reach * GAZE_X;
        targetY = (dy / distance) * reach * GAZE_Y;
      } else {
        // A panel instance only looks at a pointer plausibly about it; tracking
        // one across the whole page would read as twitchy.
        const RANGE = 380;
        if (distance > RANGE) {
          targetX = 0;
          targetY = 0;
          return;
        }
        const nearness = 1 - distance / RANGE;
        targetX = (dx / distance) * nearness * GAZE_X;
        targetY = (dy / distance) * nearness * GAZE_Y;
      }
      idleSince = performance.now();
    };

    const frame = (now: number) => {
      if (now - idleSince > 2600 && now > nextGlance) {
        const angle = Math.random() * Math.PI * 2;
        const reach = 0.35 + Math.random() * 0.5;
        targetX = Math.cos(angle) * reach * GAZE_X;
        targetY = Math.sin(angle) * reach * GAZE_Y;
        nextGlance = now + 1400 + Math.random() * 2600;
      }
      x += (targetX - x) * 0.18;
      y += (targetY - y) * 0.18;
      eyes.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
      raf = requestAnimationFrame(frame);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    raf = requestAnimationFrame(frame);
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
      eyes.style.transform = "";
    };
  }, [reduce, mood, follow]);

  // Expression lives in the eyes: their height, and how open they sit.
  const shut = blinking || mood === "resting";
  const squint = mood === "pleased";
  const leftH = shut ? 3.5 : squint ? 18 : 31;
  const rightH = shut ? 3.5 : squint ? 15 : 26;

  return (
    <svg
      ref={ref}
      viewBox="0 0 100 100"
      className={cn("nl-companion size-16", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <circle cx="50" cy="50" r="40" className="nl-companion-face" />
      <g ref={eyesRef} className="nl-companion-eyes">
        {/* Two eyes of slightly different size and tilt. Perfect symmetry is
            what makes a drawn face look mechanical rather than curious. */}
        <rect
          x="37"
          y={62 - leftH / 2}
          width="15"
          height={leftH}
          rx="7.5"
          transform="rotate(-8 44.5 62)"
          className="nl-companion-eye"
        />
        <rect
          x="61"
          y={64 - rightH / 2}
          width="13"
          height={rightH}
          rx="6.5"
          transform="rotate(10 67.5 64)"
          className="nl-companion-eye"
        />
      </g>
      {mood === "thinking" && !reduce ? (
        <circle cx="82" cy="26" r="3.5" className="nl-companion-think" />
      ) : null}
    </svg>
  );
}

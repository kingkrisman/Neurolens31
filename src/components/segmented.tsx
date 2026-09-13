import { useReducedMotion } from "@/lib/prefers-reduced-motion";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { cn } from "@/lib/utils";
import { selection } from "@/lib/haptics";

interface SegmentedOption<T extends string> {
  id: T;
  label: string;
  disabled?: boolean;
  /** Why it is unavailable — surfaced on hover and to screen readers. */
  disabledReason?: string;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  label,
  tone = "choice",
}: {
  value: T;
  onChange: (id: T) => void;
  options: SegmentedOption<T>[];
  className?: string;
  label?: string;
  tone?: "choice" | "nav";
}) {
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState({ left: 4, width: 0 });
  const [canAnimate, setCanAnimate] = useState(false);
  const isChoice = tone === "choice";

  const measure = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const button = root.querySelector<HTMLElement>(`[data-seg="${CSS.escape(String(value))}"]`);
    if (!button) return;
    setPill({ left: button.offsetLeft, width: button.offsetWidth });
  }, [value]);

  useLayoutEffect(() => {
    measure();
    const frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, [measure, options]);

  useEffect(() => {
    if (!document.fonts?.ready) return;
    let cancelled = false;
    void document.fonts.ready.then(() => {
      if (!cancelled) measure();
    });
    return () => {
      cancelled = true;
    };
  }, [measure]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setCanAnimate(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    let first = true;
    const observer = new ResizeObserver(() => {
      if (first) {
        first = false;
        measure();
        return;
      }
      setCanAnimate(false);
      measure();
      requestAnimationFrame(() => setCanAnimate(true));
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, [measure]);

  function move(delta: number) {
    const enabled = options.filter((option) => !option.disabled);
    if (enabled.length === 0) return;
    const current = enabled.findIndex((option) => option.id === value);
    const next = enabled[(current + delta + enabled.length) % enabled.length];
    if (!next) return;
    selection();
    onChange(next.id);
    requestAnimationFrame(() => {
      rootRef.current
        ?.querySelector<HTMLElement>(`[data-seg="${CSS.escape(String(next.id))}"]`)
        ?.focus();
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!isChoice) return;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      const first = options.find((option) => !option.disabled);
      if (first) {
        selection();
        onChange(first.id);
        requestAnimationFrame(() => {
          rootRef.current
            ?.querySelector<HTMLElement>(`[data-seg="${CSS.escape(String(first.id))}"]`)
            ?.focus();
        });
      }
    } else if (event.key === "End") {
      event.preventDefault();
      const last = [...options].reverse().find((option) => !option.disabled);
      if (last) {
        selection();
        onChange(last.id);
        requestAnimationFrame(() => {
          rootRef.current
            ?.querySelector<HTMLElement>(`[data-seg="${CSS.escape(String(last.id))}"]`)
            ?.focus();
        });
      }
    }
  }

  return (
    <div
      ref={rootRef}
      role={isChoice ? "radiogroup" : "group"}
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn("relative isolate inline-flex h-10 items-center rounded-md bg-fg/5 p-1", className)}
    >
      {options.map((option) => {
        const selected = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            data-seg={option.id}
            disabled={option.disabled}
            title={option.disabled ? option.disabledReason : undefined}
            aria-description={option.disabled ? option.disabledReason : undefined}
            role={isChoice ? "radio" : undefined}
            aria-checked={isChoice ? selected : undefined}
            aria-current={!isChoice && selected ? "page" : undefined}
            tabIndex={isChoice ? (selected ? 0 : -1) : undefined}
            onClick={() => {
              // Only when it actually moves: re-picking the option you
              // are already on changed nothing, and a tick for nothing
              // teaches the reader to stop trusting the feedback.
              if (option.id !== value) selection();
              onChange(option.id);
            }}
            className={cn(
              "relative z-10 h-8 shrink-0 rounded-sm px-2 text-xs font-medium whitespace-nowrap text-muted transition-colors duration-[150ms] ease-[var(--ease-standard)] sm:px-3 sm:text-sm",
              "hover:text-fg",
              selected && "text-fg",
              option.disabled && "opacity-30",
            )}
          >
            {option.label}
          </button>
        );
      })}
      <div
        aria-hidden
        className="pointer-events-none absolute top-1 bottom-1 z-[1] rounded-sm bg-surface shadow-border"
        style={{
          left: pill.left,
          width: pill.width,
          transition:
            canAnimate && !reduceMotion
              ? "left 220ms var(--ease-in-out), width 220ms var(--ease-in-out)"
              : "none",
        }}
      />
    </div>
  );
}


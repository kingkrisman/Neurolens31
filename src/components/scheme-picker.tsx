import { Check } from "lucide-react";
import { COLOR_SCHEMES, type ThemeId } from "@/lib/types";
import { evaluateScheme, formatContrastRatio } from "@/lib/contrast";
import { cn } from "@/lib/utils";

const LIGHT = COLOR_SCHEMES.filter((scheme) => scheme.room === "light");
const DARK = COLOR_SCHEMES.filter((scheme) => scheme.room === "dark");

function SchemeCard({
  id,
  selected,
  onChange,
  compact,
}: {
  id: ThemeId;
  selected: boolean;
  onChange: (id: ThemeId) => void;
  compact?: boolean;
}) {
  const scheme = COLOR_SCHEMES.find((item) => item.id === id);
  if (!scheme) return null;
  const report = evaluateScheme(id, 18);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={`${scheme.label}, ${scheme.line}`}
      data-scheme={id}
      onClick={() => onChange(id)}
      className={cn(
        "scheme-card group flex min-h-11 min-w-0 flex-col overflow-hidden rounded-lg bg-bg text-left text-fg transition-[transform,box-shadow] duration-[140ms] ease-[var(--ease-out)] active:scale-[0.98]",
        selected ? "shadow-float ring-2 ring-fg" : "shadow-border hover:shadow-border-hover",
      )}
    >
      <span className={cn("relative min-w-0", compact ? "px-2.5 pt-2.5 pb-1.5" : "px-3 pt-3 pb-2")}>
        <span className="block font-serif text-base leading-snug whitespace-nowrap">
          Aa <em className="italic">page</em>
        </span>
        <span className="mt-1 block truncate text-[11px] leading-relaxed text-muted">{scheme.line}</span>
        {selected ? (
          <span className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-full bg-fg text-primary-fg">
            <Check size={12} strokeWidth={2.5} className="icon-motion icon-lift" />
          </span>
        ) : null}
      </span>
      <span className="flex h-1.5 w-full shrink-0" aria-hidden>
        <span className="flex-1 bg-accent" />
        <span className="w-8 bg-fg" />
      </span>
      <span
        className={cn(
          "mt-auto flex min-w-0 items-center gap-2 border-t border-border bg-surface",
          compact ? "justify-start px-2.5 py-1.5" : "justify-between px-3 py-2",
        )}
      >
        <span className="min-w-0 truncate text-sm font-medium whitespace-nowrap">{scheme.label}</span>
        {compact ? null : (
          <span className="shrink-0 text-[10px] tracking-wide text-muted uppercase">
            {report.bodyLevel} {formatContrastRatio(report.body)}
          </span>
        )}
      </span>
    </button>
  );
}

export function SchemePicker({
  value,
  onChange,
  compact = false,
}: {
  value: ThemeId;
  onChange: (id: ThemeId) => void;
  compact?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">Light rooms</p>
        <div
          role="radiogroup"
          aria-label="Light color schemes"
          className={cn("grid gap-2", compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3")}
        >
          {LIGHT.map((scheme) => (
            <SchemeCard key={scheme.id} id={scheme.id} selected={value === scheme.id} onChange={onChange} compact={compact} />
          ))}
        </div>
        {compact ? null : (
          <p className="mt-2 text-xs leading-relaxed text-pretty text-muted">
            British Dyslexia Association cream, and Rello & Bigham's peach and pale yellow, beat cool white
            for many dyslexic readers. Preference still wins — try Cream, Peach, or Butter before Contrast.
          </p>
        )}
      </div>
      <div>
        <p className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">Dark rooms</p>
        <div
          role="radiogroup"
          aria-label="Dark color schemes"
          className={cn("grid gap-2", compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4")}
        >
          {DARK.map((scheme) => (
            <SchemeCard key={scheme.id} id={scheme.id} selected={value === scheme.id} onChange={onChange} compact={compact} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function ContrastMeter({ theme, fontSize }: { theme: ThemeId; fontSize: number }) {
  const report = evaluateScheme(theme, fontSize);
  const label = report.bodyLevel === "fail" ? "below AA" : report.bodyLevel;
  return (
    <p className="mt-3 text-xs leading-relaxed text-muted">
      Body {formatContrastRatio(report.body)} at {fontSize}px · WCAG {label}. Muted{" "}
      {formatContrastRatio(report.muted)}.
    </p>
  );
}

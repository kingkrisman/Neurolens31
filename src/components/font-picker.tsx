import { FONT_CHOICES, FONT_CLASS, FONT_GROUPS, type FontId } from "@/lib/types";
import { cn } from "@/lib/utils";

export function FontPicker({
  value,
  onChange,
  compact = false,
}: {
  value: FontId;
  onChange: (id: FontId) => void;
  compact?: boolean;
}) {
  return (
    <div className="space-y-5">
      {FONT_GROUPS.map((group) => (
        <div key={group.id}>
          <p className="text-xs font-medium tracking-wide text-muted uppercase">{group.label}</p>
          <p className="mt-1 mb-2 text-xs leading-relaxed text-pretty text-muted">{group.hint}</p>
          <div className="grid grid-cols-1 gap-1.5">
            {FONT_CHOICES.filter((font) => font.group === group.id).map((font) => {
              const selected = value === font.id;
              return (
                <button
                  key={font.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onChange(font.id)}
                  className={cn(
                    "flex min-h-11 min-w-0 flex-col items-start justify-center rounded-md px-3 py-2.5 text-left transition-[background-color,transform] duration-[140ms] ease-[var(--ease-out)] active:scale-[0.97]",
                    selected ? "bg-fg text-primary-fg" : "bg-fg/4 hover:bg-fg/8",
                  )}
                >
                  <span className="text-sm font-medium whitespace-nowrap">{font.label}</span>
                  <span
                    className={cn(
                      "mt-0.5 block text-sm leading-snug text-pretty",
                      FONT_CLASS[font.id],
                      selected ? "text-primary-fg/75" : "text-muted",
                      compact ? "hidden" : "",
                    )}
                  >
                    {font.sample}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {value === "opendyslexic" ? <OpenDyslexicNote /> : null}
    </div>
  );
}

export function OpenDyslexicNote() {
  return (
    <div className="rounded-md bg-fg/4 px-3 py-3">
      <p className="text-xs leading-relaxed text-pretty text-muted">
        OpenDyslexic weights the base of each letter so b, d, p, and q look less alike. Controlled trials have not
        found faster or more accurate reading than Arial or Times — some readers still prefer the shapes. Size,
        spacing, and a distinct sans (Lexend, Atkinson) are what the evidence actually supports. Keep this face if it
        feels easier; switch if it does not.
      </p>
      <p className="font-opendyslexic mt-3 text-xl leading-relaxed tracking-wide">
        <span className="letter-b">b</span>
        <span className="mx-2 text-muted">·</span>
        <span className="letter-d">d</span>
        <span className="mx-2 text-muted">·</span>
        <span className="letter-p">p</span>
        <span className="mx-2 text-muted">·</span>
        <span className="letter-q">q</span>
      </p>
    </div>
  );
}

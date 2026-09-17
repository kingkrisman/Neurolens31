import { useState } from "react";
import { Check, RotateCcw, Shuffle } from "lucide-react";
import { UserAvatar } from "@/components/auth/user-avatar";
import {
  AVATAR_BACKGROUNDS,
  AVATAR_STYLES,
  DEFAULT_AVATAR,
  setAvatarPrefs,
  useAvatarPrefs,
} from "@/lib/avatar-prefs";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

/**
 * Choose a face.
 *
 * Every style tile shows this person's own face in that style, not a stock
 * sample, so choosing is comparing rather than imagining. Shuffle moves to a
 * different face within the style; the change applies immediately everywhere,
 * because there is nothing to save and a Save button would only be a step to
 * forget.
 */
export function AvatarPicker({ seed }: { seed: string }) {
  const prefs = useAvatarPrefs();
  const [announce, setAnnounce] = useState("");

  const choose = (next: Parameters<typeof setAvatarPrefs>[0], message: string) => {
    const saved = setAvatarPrefs(next);
    setAnnounce(message);
    track("avatar_changed", { style: saved.style });
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4">
        <UserAvatar seed={seed} size={88} label="Your avatar" />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => choose({ shuffle: prefs.shuffle + 1 }, "Shuffled to a new face")}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-surface px-4 text-sm font-medium shadow-border hover:bg-fg/6 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg"
          >
            <Shuffle size={15} aria-hidden />
            Shuffle
          </button>
          <button
            type="button"
            onClick={() => choose(DEFAULT_AVATAR, "Avatar reset")}
            disabled={
              prefs.style === DEFAULT_AVATAR.style && prefs.shuffle === 0 && prefs.background === ""
            }
            className="inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted hover:bg-fg/6 hover:text-fg disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg"
          >
            <RotateCcw size={14} aria-hidden />
            Reset
          </button>
        </div>
      </div>

      <p className="mt-6 text-sm font-medium">Style</p>
      <div
        role="radiogroup"
        aria-label="Avatar style"
        className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6"
      >
        {AVATAR_STYLES.map((style) => {
          const active = prefs.style === style.id;
          return (
            <button
              key={style.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => choose({ style: style.id, shuffle: 0 }, `${style.label} style chosen`)}
              className={cn(
                "group flex flex-col items-center gap-1.5 rounded-md p-2 text-[11px] text-muted transition-colors duration-150",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
                active ? "bg-fg/8 text-fg" : "hover:bg-fg/4",
              )}
            >
              <span className="relative">
                <UserAvatar
                  seed={seed}
                  size={44}
                  styleId={style.id}
                  shuffle={0}
                  background={prefs.background}
                />
                {active ? (
                  <span className="absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-full bg-fg text-bg">
                    <Check size={10} strokeWidth={3} aria-hidden />
                  </span>
                ) : null}
              </span>
              <span className="truncate">{style.label}</span>
            </button>
          );
        })}
      </div>

      <p className="mt-6 text-sm font-medium">Background</p>
      <div role="radiogroup" aria-label="Avatar background" className="mt-2 flex flex-wrap gap-2">
        {AVATAR_BACKGROUNDS.map((color) => {
          const active = prefs.background === color;
          const name = color ? `#${color}` : "None";
          return (
            <button
              key={color || "none"}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={color ? `Background ${name}` : "No background"}
              title={name}
              onClick={() =>
                choose({ background: color }, color ? "Background changed" : "Background removed")
              }
              className={cn(
                "grid size-8 place-items-center rounded-full shadow-border transition-transform duration-150 hover:scale-110",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
                active && "ring-2 ring-fg ring-offset-2 ring-offset-bg",
              )}
              style={
                color
                  ? { backgroundColor: `#${color}` }
                  : {
                      backgroundImage:
                        "linear-gradient(135deg, transparent 45%, currentColor 45%, currentColor 55%, transparent 55%)",
                    }
              }
            >
              {active ? (
                <Check size={12} strokeWidth={3} className="text-[#1A1208]" aria-hidden />
              ) : null}
            </button>
          );
        })}
      </div>

      <p role="status" className="sr-only">
        {announce}
      </p>
    </div>
  );
}

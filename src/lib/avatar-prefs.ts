import { useMemo } from "react";
import { useAppStore } from "@/lib/store";

/**
 * How a person has chosen to look.
 *
 * It is appearance, not identity: the face is generated from a seed, so nothing
 * here is a photo and nothing here identifies anybody.
 *
 * Stored on the account's `meta`, per reader and synced.
 *
 * Two homes before this one, both wrong. First a device-wide `neurolens-avatar`
 * key, which two accounts on one machine shared and which the sync layer never
 * saw. Then the reading profile — and the profile is replaced wholesale by every
 * mode change, saved setup and sync pull, so a chosen face could be thrown away
 * by switching to Dyslexia mode. `meta` is merged rather than replaced, and the
 * choice carries a timestamp so a pull bringing an older face cannot overwrite
 * a newer one that has not been sent yet.
 */

export const AVATAR_STYLES = [
  { id: "notionists-neutral", label: "Sketch" },
  { id: "lorelei-neutral", label: "Lorelei" },
  { id: "micah", label: "Micah" },
  { id: "personas", label: "Persona" },
  { id: "avataaars-neutral", label: "Cartoon" },
  { id: "big-smile", label: "Big smile" },
  { id: "croodles-neutral", label: "Doodle" },
  { id: "miniavs", label: "Mini" },
  { id: "dylan", label: "Dylan" },
  { id: "thumbs", label: "Thumbs" },
  { id: "shapes", label: "Shapes" },
  { id: "glass", label: "Glass" },
] as const;

export type AvatarStyleId = (typeof AVATAR_STYLES)[number]["id"];

/** Soft grounds that sit on the app's paper in both themes. "" means none. */
export const AVATAR_BACKGROUNDS = [
  "",
  "f3e8d8",
  "e7d7f2",
  "d6e9f5",
  "d8efdf",
  "fbe0c9",
  "f7d4dc",
  "e3e3e3",
] as const;

export interface AvatarPrefs {
  style: AvatarStyleId;
  /** 0 is the face the seed gives; each shuffle moves to another. */
  shuffle: number;
  background: string;
}

export const DEFAULT_AVATAR: AvatarPrefs = {
  style: "notionists-neutral",
  shuffle: 0,
  background: "",
};

/** The old device-wide key. Read from, never written to. See `legacyAvatar`. */
const KEY = "neurolens-avatar";

/** Repair whatever was stored into something renderable. */
export function normalizeAvatar(value: unknown): AvatarPrefs {
  const input = (value && typeof value === "object" ? value : {}) as Partial<AvatarPrefs>;
  const style = AVATAR_STYLES.some((s) => s.id === input.style)
    ? (input.style as AvatarStyleId)
    : DEFAULT_AVATAR.style;
  const shuffle =
    Number.isInteger(input.shuffle) && (input.shuffle as number) >= 0
      ? (input.shuffle as number)
      : 0;
  const background = (AVATAR_BACKGROUNDS as readonly string[]).includes(
    String(input.background ?? ""),
  )
    ? String(input.background ?? "")
    : "";
  return { style, shuffle, background };
}

/** The seed actually rendered: the person's own, moved along by their shuffles. */
export function avatarSeed(base: string, prefs: AvatarPrefs): string {
  return prefs.shuffle > 0 ? `${base}#${prefs.shuffle}` : base;
}

/**
 * What the old device-wide key held.
 *
 * Read only as a fallback, and never copied into an account: somebody who
 * picked a face before this moved keeps seeing it, and the moment they change
 * anything the choice is written to their profile where it belongs. Nothing
 * migrates it for them, because writing one account's old avatar into whichever
 * account happens to sign in next is the bug this is fixing.
 */
function legacyAvatar(): AvatarPrefs | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalizeAvatar(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function useAvatarPrefs(): AvatarPrefs {
  // Selected by reference. A selector that normalised inline would return a
  // fresh object on every render and zustand compares with Object.is, so the
  // component would re-render forever.
  const stored = useAppStore((state) => state.meta.avatar);
  return useMemo(() => normalizeAvatar(stored ?? legacyAvatar()), [stored]);
}

export function setAvatarPrefs(next: Partial<AvatarPrefs>): AvatarPrefs {
  const current = useAppStore.getState().meta.avatar ?? legacyAvatar() ?? DEFAULT_AVATAR;
  const merged = normalizeAvatar({ ...current, ...next });
  // Stamped, so a sync pull carrying an older face loses to this one instead
  // of undoing it. Through `setMeta`, so it is scoped to this reader and
  // queued for their account.
  useAppStore.getState().setMeta({ avatar: { ...merged, at: Date.now() } });
  return merged;
}

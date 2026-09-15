import { useSyncExternalStore } from "react";

/**
 * How a person has chosen to look.
 *
 * Kept on the device, beside the rest of their settings. It is appearance, not
 * identity: the face is generated from a seed, so nothing here is a photo and
 * nothing here needs to leave the browser.
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
export const AVATAR_BACKGROUNDS = ["", "f3e8d8", "e7d7f2", "d6e9f5", "d8efdf", "fbe0c9", "f7d4dc", "e3e3e3"] as const;

export interface AvatarPrefs {
  style: AvatarStyleId;
  /** 0 is the face the seed gives; each shuffle moves to another. */
  shuffle: number;
  background: string;
}

export const DEFAULT_AVATAR: AvatarPrefs = { style: "notionists-neutral", shuffle: 0, background: "" };

const KEY = "neurolens-avatar";
const listeners = new Set<() => void>();

/** Repair whatever was stored into something renderable. */
export function normalizeAvatar(value: unknown): AvatarPrefs {
  const input = (value && typeof value === "object" ? value : {}) as Partial<AvatarPrefs>;
  const style = AVATAR_STYLES.some((s) => s.id === input.style) ? (input.style as AvatarStyleId) : DEFAULT_AVATAR.style;
  const shuffle = Number.isInteger(input.shuffle) && (input.shuffle as number) >= 0 ? (input.shuffle as number) : 0;
  const background = (AVATAR_BACKGROUNDS as readonly string[]).includes(String(input.background ?? ""))
    ? String(input.background ?? "")
    : "";
  return { style, shuffle, background };
}

/** The seed actually rendered: the person's own, moved along by their shuffles. */
export function avatarSeed(base: string, prefs: AvatarPrefs): string {
  return prefs.shuffle > 0 ? `${base}#${prefs.shuffle}` : base;
}

let cachedRaw: string | null | undefined;
let cached: AvatarPrefs = DEFAULT_AVATAR;

function snapshot(): AvatarPrefs {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cached = normalizeAvatar(raw ? JSON.parse(raw) : null);
    } catch {
      cached = DEFAULT_AVATAR;
    }
  }
  return cached;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useAvatarPrefs(): AvatarPrefs {
  return useSyncExternalStore(subscribe, snapshot, () => DEFAULT_AVATAR);
}

export function setAvatarPrefs(next: Partial<AvatarPrefs>): AvatarPrefs {
  const merged = normalizeAvatar({ ...snapshot(), ...next });
  try {
    localStorage.setItem(KEY, JSON.stringify(merged));
  } catch {
    /* private mode — the choice lasts for this page only */
  }
  for (const listener of listeners) listener();
  return merged;
}

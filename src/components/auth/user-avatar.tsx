import { useEffect, useMemo, useState } from "react";
import { Avatar, Style } from "@dicebear/core";
import notionists from "@dicebear/styles/notionists-neutral.json";
import { avatarSeed, useAvatarPrefs, type AvatarStyleId } from "@/lib/avatar-prefs";
import { cn } from "@/lib/utils";

type Definition = ConstructorParameters<typeof Style>[0];

/**
 * Each style is fetched only when someone looks at it.
 *
 * Twelve styles are between nine and a hundred kilobytes each; bundling all of
 * them would put half a megabyte in front of every reader to serve a menu most
 * people open once. The default is bundled so the header never waits.
 */
const LOADERS: Record<AvatarStyleId, () => Promise<{ default: unknown }>> = {
  "notionists-neutral": async () => ({ default: notionists }),
  "lorelei-neutral": () => import("@dicebear/styles/lorelei-neutral.json"),
  micah: () => import("@dicebear/styles/micah.json"),
  personas: () => import("@dicebear/styles/personas.json"),
  "avataaars-neutral": () => import("@dicebear/styles/avataaars-neutral.json"),
  "big-smile": () => import("@dicebear/styles/big-smile.json"),
  "croodles-neutral": () => import("@dicebear/styles/croodles-neutral.json"),
  miniavs: () => import("@dicebear/styles/miniavs.json"),
  dylan: () => import("@dicebear/styles/dylan.json"),
  thumbs: () => import("@dicebear/styles/thumbs.json"),
  shapes: () => import("@dicebear/styles/shapes.json"),
  glass: () => import("@dicebear/styles/glass.json"),
};

const styles = new Map<AvatarStyleId, Style<unknown>>([
  ["notionists-neutral", new Style(notionists as Definition) as Style<unknown>],
]);
const pending = new Map<AvatarStyleId, Promise<Style<unknown>>>();

function loadStyle(id: AvatarStyleId): Promise<Style<unknown>> {
  const ready = styles.get(id);
  if (ready) return Promise.resolve(ready);
  let promise = pending.get(id);
  if (!promise) {
    promise = LOADERS[id]().then((mod) => {
      const style = new Style(mod.default as Definition) as Style<unknown>;
      styles.set(id, style);
      return style;
    });
    pending.set(id, promise);
  }
  return promise;
}

function useStyle(id: AvatarStyleId): Style<unknown> | null {
  const [style, setStyle] = useState<Style<unknown> | null>(() => styles.get(id) ?? null);
  useEffect(() => {
    let live = true;
    const ready = styles.get(id);
    if (ready) {
      setStyle(ready);
      return;
    }
    setStyle(null);
    void loadStyle(id).then((loaded) => {
      if (live) setStyle(loaded);
    });
    return () => {
      live = false;
    };
  }, [id]);
  return style;
}

/**
 * A generated face for a person.
 *
 * With no overrides it shows the face they chose on the account page, so the
 * header, the menu and the account page always agree. The picker passes
 * overrides to preview a choice before it is made.
 */
export function UserAvatar({
  seed,
  size = 32,
  className,
  label,
  styleId,
  shuffle,
  background,
}: {
  seed: string;
  size?: number;
  className?: string;
  label?: string;
  styleId?: AvatarStyleId;
  shuffle?: number;
  background?: string;
}) {
  const saved = useAvatarPrefs();
  const prefs = {
    style: styleId ?? saved.style,
    shuffle: shuffle ?? saved.shuffle,
    background: background ?? saved.background,
  };
  const style = useStyle(prefs.style);

  const uri = useMemo(() => {
    if (!style) return null;
    return new Avatar(style, {
      seed: avatarSeed(seed, prefs),
      size: size * 2,
      ...(prefs.background ? { backgroundColor: [prefs.background] } : {}),
    } as never).toDataUri();
    // prefs is rebuilt each render; its three fields are the real dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style, seed, size, prefs.style, prefs.shuffle, prefs.background]);

  const box = { width: size, height: size };

  if (!uri) {
    return (
      <span
        aria-hidden
        className={cn("block shrink-0 animate-pulse rounded-full bg-fg/8", className)}
        style={box}
      />
    );
  }

  return (
    <img
      src={uri}
      width={size}
      height={size}
      alt={label ?? ""}
      aria-hidden={label ? undefined : true}
      draggable={false}
      className={cn("shrink-0 rounded-full bg-surface shadow-border", className)}
      style={box}
    />
  );
}

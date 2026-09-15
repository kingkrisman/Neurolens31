import { useMemo } from "react";
import { Avatar, Style } from "@dicebear/core";
import notionists from "@dicebear/styles/notionists-neutral.json";
import { cn } from "@/lib/utils";

/**
 * One parsed style, shared by every avatar on the page.
 *
 * DiceBear asks for a `Style` instance to be reused across avatars rather than
 * rebuilt per render, and a header badge re-renders on every route change.
 * Notionists-neutral: line-drawn faces that sit with this app's serif and paper
 * rather than shouting over them, and the neutral set avoids assigning anyone a
 * skin tone they did not choose.
 */
const style = new Style(notionists as ConstructorParameters<typeof Style>[0]);

/**
 * A generated face for a person.
 *
 * Seeded, so the same person gets the same face on every device and every visit
 * without storing an image — and a real profile photo can replace it later
 * without anything else on the page changing.
 */
export function UserAvatar({
  seed,
  size = 32,
  className,
  label,
}: {
  seed: string;
  size?: number;
  className?: string;
  /** Pass a name when the avatar stands alone; omit when a name is beside it. */
  label?: string;
}) {
  const uri = useMemo(() => new Avatar(style, { seed, size: size * 2 }).toDataUri(), [seed, size]);

  return (
    <img
      src={uri}
      width={size}
      height={size}
      alt={label ?? ""}
      aria-hidden={label ? undefined : true}
      draggable={false}
      className={cn("shrink-0 rounded-full bg-surface shadow-border", className)}
      style={{ width: size, height: size }}
    />
  );
}

import { type ComponentProps, type HTMLAttributes, type ImgHTMLAttributes, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl bg-surface p-3 shadow-border transition-[box-shadow] duration-[150ms] ease-[var(--ease-out)]",
        className,
      )}
      {...props}
    />
  );
}

/** Concentric shell: 16px outer radius, 8px pad, 8px inner well. */
export function Panel({
  hover = false,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-xl bg-surface p-2 shadow-border",
        hover &&
          "transition-[box-shadow,transform] duration-[150ms] ease-[var(--ease-out)] hover:shadow-border-hover active:scale-[0.99]",
        className,
      )}
      {...props}
    />
  );
}

export function PanelWell({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg bg-bg", className)} {...props} />;
}

export function PanelHeader({
  eyebrow,
  title,
  description,
  className,
  as: Heading = "h2",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  className?: string;
  /**
   * Heading level for the title.
   *
   * A panel is an `h2` on a page whose only other heading is the `h1` title.
   * Once panels are gathered under group labels, those labels take `h2` and the
   * panels have to step down — otherwise the page is a flat run of same-level
   * headings and the grouping exists only visually, which is exactly the part
   * a screen reader cannot see.
   */
  as?: "h2" | "h3";
}) {
  return (
    <div className={cn("scroll-mt-20 px-3 pt-3 pb-3", className)}>
      {eyebrow ? (
        <p className="text-xs font-medium tracking-wide text-muted uppercase">{eyebrow}</p>
      ) : null}
      <Heading className={cn("font-medium", eyebrow && "mt-1")}>{title}</Heading>
      {description ? <p className="mt-1.5 text-sm leading-relaxed text-muted">{description}</p> : null}
    </div>
  );
}

export function Badge({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-fg/6 px-2.5 py-1 text-xs font-medium text-muted",
        className,
      )}
      {...props}
    />
  );
}

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("skeleton rounded-md", className)}
      {...props}
    />
  );
}

export function Separator({
  className,
  orientation = "horizontal",
  ...props
}: HTMLAttributes<HTMLDivElement> & { orientation?: "horizontal" | "vertical" }) {
  return (
    <div
      role="separator"
      className={cn(
        "bg-border",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      {...props}
    />
  );
}

export function Progress({
  value,
  className,
  label = "Progress",
}: {
  value: number;
  className?: string;
  label?: string;
}) {
  const now = Math.round(Math.min(100, Math.max(0, value)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={now}
      className={cn("h-1.5 overflow-hidden rounded-full bg-fg/10", className)}
    >
      <div
        className="h-full origin-left rounded-full bg-fg transition-transform duration-[250ms] ease-[var(--ease-out)] motion-reduce:transition-none"
        style={{ transform: `scaleX(${now / 100})` }}
      />
    </div>
  );
}

export function Kbd({ children, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd className="kbd" {...props}>
      {children}
    </kbd>
  );
}

export function Media({
  zoom,
  className,
  alt = "",
  loading = "lazy",
  decoding = "async",
  src,
  onLoad,
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & { zoom?: boolean }) {
  const ref = useRef<HTMLImageElement>(null);
  const eager = loading === "eager";
  const [ready, setReady] = useState(eager);

  useLayoutEffect(() => {
    const node = ref.current;
    if (node && node.complete && node.naturalWidth > 0) setReady(true);
  }, [src]);

  return (
    <img
      ref={ref}
      alt={alt}
      src={src}
      loading={eager ? "eager" : "lazy"}
      decoding={decoding}
      onLoad={(event) => {
        setReady(true);
        onLoad?.(event);
      }}
      className={cn(
        "media bg-fg/6 transition-opacity duration-300 ease-[var(--ease-out)] motion-reduce:transition-none",
        zoom && "media-zoom",
        ready ? "opacity-100" : "opacity-0",
        className,
      )}
      {...props}
    />
  );
}

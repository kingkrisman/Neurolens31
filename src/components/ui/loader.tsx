import { cn } from "@/lib/utils";

export function LensLoader({
  label = "Loading",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex items-center gap-2.5 text-sm text-muted", className)} role="status">
      <span
        aria-hidden
        className="lens-orbit inline-block size-4 shrink-0 rounded-full border-2 border-fg/20 border-t-fg"
      />
      <span>{label}</span>
    </div>
  );
}

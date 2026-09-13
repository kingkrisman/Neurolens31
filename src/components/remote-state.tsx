import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/surfaces";
import { LensLoader } from "@/components/ui/loader";
import { remoteMessage } from "@/lib/remote";

const LINE_WIDTHS = ["w-5/6", "w-full", "w-2/3", "w-4/5", "w-3/4", "w-5/6"] as const;

export function RemoteLoading({
  label,
  lines = 4,
}: {
  label: string;
  lines?: number;
}) {
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      <LensLoader label={label} />
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className={`h-4 ${LINE_WIDTHS[index % LINE_WIDTHS.length]}`} />
      ))}
    </div>
  );
}

export function RemoteErrorView({
  error,
  onRetry,
  hint,
}: {
  error: unknown;
  onRetry?: () => void;
  hint?: string;
}) {
  const message = remoteMessage(error, "Could not load that.");
  return (
    <div role="alert" className="space-y-3">
      <div className="flex items-start gap-2.5">
        <AlertCircle size={16} className="mt-0.5 shrink-0 text-danger" />
        <div>
          <p className="text-sm text-danger">{message}</p>
          {hint ? <p className="mt-1.5 text-xs leading-relaxed text-muted">{hint}</p> : null}
        </div>
      </div>
      {onRetry ? (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}

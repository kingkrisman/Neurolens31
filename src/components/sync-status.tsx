import { useEffect, useState } from "react";
import { CloudAlert, CloudOff, RefreshCw } from "lucide-react";
import { flush, subscribeSync, syncState, type SyncState } from "@/lib/sync/engine";
import { cn } from "@/lib/utils";

/**
 * Says when the account is behind, and only then.
 *
 * Sync had no visible state at all, so when writes stopped reaching the server
 * nothing said so — the reader kept working, the queue kept growing, and the
 * first sign of trouble was noticing that highlights made last week were not on
 * the other laptop. A reader should not have to audit their own library.
 *
 * Silent while things are working, which is most of the time: a permanent
 * "synced" badge is a thing people stop seeing, and it would compete with the
 * reading for attention — the one thing this app exists to protect. It appears
 * for the two states worth acting on, offline with work pending and a real
 * failure, and offers the one useful action.
 *
 * Not shown merely because a sync is in progress. Those last a moment and
 * resolve themselves, and flashing a spinner at somebody mid-sentence is worse
 * than saying nothing.
 */
export function SyncStatus({ hidden = false }: { hidden?: boolean }) {
  const [state, setState] = useState<SyncState>(() => syncState());
  const [retrying, setRetrying] = useState(false);

  useEffect(() => subscribeSync(setState), []);

  const stuck = state.phase === "error" && state.pending > 0;
  const waiting = state.phase === "offline" && state.pending > 0;
  if (hidden || (!stuck && !waiting)) return null;

  const retry = async () => {
    setRetrying(true);
    try {
      await flush();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div
      role="status"
      className={cn(
        "pointer-events-auto fixed bottom-4 left-4 z-40 flex max-w-[22rem] items-start gap-3 rounded-2xl bg-surface p-4 shadow-[0_0_0_1px_rgba(22,22,21,0.07),0_18px_36px_-18px_rgba(22,22,21,0.3)]",
        "sm:bottom-6 sm:left-6",
      )}
    >
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-full",
          waiting ? "bg-fg/8 text-muted" : "bg-danger/10 text-danger",
        )}
      >
        {waiting ? <CloudOff size={15} aria-hidden /> : <CloudAlert size={15} aria-hidden />}
      </span>

      <div className="min-w-0">
        <p className="text-sm font-medium text-fg">
          {waiting ? "Waiting for a connection" : "Your account is behind"}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-pretty text-muted">
          {waiting ? (
            <>
              {state.pending} {state.pending === 1 ? "change is" : "changes are"} saved on this
              device and will sync when you are back online.
            </>
          ) : (
            <>
              {state.pending} {state.pending === 1 ? "change has" : "changes have"} not reached your
              account. Nothing is lost — it is still here.
            </>
          )}
        </p>
        {stuck ? (
          <button
            type="button"
            onClick={() => void retry()}
            disabled={retrying}
            className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-full bg-fg px-3 text-xs font-semibold text-bg transition-[transform,opacity] duration-150 ease-[var(--ease-out)] hover:opacity-90 active:scale-[0.97] disabled:opacity-60"
          >
            <RefreshCw size={12} aria-hidden className={retrying ? "animate-spin" : undefined} />
            {retrying ? "Trying…" : "Try again"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

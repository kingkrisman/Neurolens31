import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { BookUp, Check } from "lucide-react";
import { useAuthStatus } from "@/lib/auth-ui/session";
import { declineUpload, localOnly, shouldAskToUpload, uploadLocal, type LocalOnly } from "@/lib/sync/migrate";
import { flush } from "@/lib/sync/engine";
import { cn } from "@/lib/utils";

/**
 * Asking, once, before anything leaves the device.
 *
 * Everyone who read here before accounts existed was told their files stayed on
 * their device. Signing in must not quietly make that untrue, so this is the
 * question rather than the assumption — and it is the only route by which an
 * existing library reaches the account.
 *
 * It says what it will send, counted. "We found some books" is not enough to
 * decide on; nine books and two hundred highlights is.
 *
 * Both answers are final and neither is destructive. Declining leaves
 * everything exactly where it is, still readable, and the account page can
 * offer again later.
 */
export function UploadPrompt() {
  const { user, loading } = useAuthStatus();
  const [found, setFound] = useState<LocalOnly | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    // A beat after sign-in: arriving to a question before the page has settled
    // reads as an interruption rather than a choice.
    const timer = window.setTimeout(() => {
      if (shouldAskToUpload(user.id)) setFound(localOnly());
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [user, loading]);

  if (!user || !found) return null;

  const dismiss = () => {
    setLeaving(true);
    window.setTimeout(() => setFound(null), 220);
  };

  const accept = async () => {
    setBusy(true);
    uploadLocal(user.id);
    setDone(true);
    // Sent in the background; the reader does not wait on it, and the queue
    // survives them closing the tab.
    void flush();
    window.setTimeout(dismiss, 1400);
  };

  const decline = () => {
    declineUpload(user.id);
    dismiss();
  };

  const books = found.books.length;
  const summary = [
    books ? `${books} ${books === 1 ? "book" : "books"}` : null,
    found.highlights ? `${found.highlights} ${found.highlights === 1 ? "highlight" : "highlights"}` : null,
    found.bookmarks ? `${found.bookmarks} ${found.bookmarks === 1 ? "bookmark" : "bookmarks"}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div
      role="dialog"
      aria-labelledby="upload-title"
      aria-describedby="upload-body"
      className={cn(
        "pointer-events-auto fixed right-4 bottom-4 left-4 z-50 max-w-md rounded-2xl bg-surface p-5 shadow-[0_0_0_1px_rgba(22,22,21,0.07),0_24px_48px_-20px_rgba(22,22,21,0.35)] sm:left-auto sm:right-6 sm:bottom-6 sm:w-[26rem]",
        "transition-[opacity,transform,filter] duration-300 ease-[var(--ease-out)]",
        leaving ? "translate-y-3 opacity-0 blur-[4px]" : "translate-y-0 opacity-100 blur-0",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent/10 text-accent">
          {done ? <Check size={16} aria-hidden /> : <BookUp size={16} aria-hidden />}
        </span>
        <div className="min-w-0">
          <p id="upload-title" className="text-[15px] font-semibold tracking-[-0.01em] text-fg">
            {done ? "Uploading to your account" : "Bring this device's library with you?"}
          </p>
          <p id="upload-body" className="mt-1 text-sm leading-relaxed text-pretty text-muted">
            {done ? (
              <>It will keep going in the background, and finish even if you close this tab.</>
            ) : (
              <>
                You have <span className="font-medium text-fg">{summary}</span> saved on this device
                only. Upload them and they will be waiting on every device you read on.{" "}
                <Link to="/privacy" className="text-fg underline decoration-fg/30 underline-offset-2">
                  What is stored
                </Link>
              </>
            )}
          </p>
        </div>
      </div>

      {done ? null : (
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void accept()}
            className="h-10 flex-1 rounded-full bg-fg px-4 text-sm font-semibold text-bg transition-[transform,opacity] duration-150 ease-[var(--ease-out)] hover:opacity-90 active:scale-[0.97] disabled:opacity-60"
          >
            Upload
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={decline}
            className="h-10 flex-1 rounded-full bg-bg px-4 text-sm font-medium text-fg shadow-border transition-[transform,background-color] duration-150 ease-[var(--ease-out)] hover:bg-fg/5 active:scale-[0.97] disabled:opacity-60"
          >
            Keep them here
          </button>
        </div>
      )}
    </div>
  );
}

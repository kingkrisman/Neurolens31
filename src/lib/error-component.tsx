import { Component, type ErrorInfo, type ReactNode } from "react";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";

export function isStaleChunkError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /dynamically imported module|loading chunk \d+|Importing a module script failed/i.test(message);
}

export function friendlyViewError(error: unknown) {
  if (isStaleChunkError(error)) return "This view did not load. Reload and it should come back.";
  if (error instanceof Error && error.message.trim()) return error.message;
  return "This view hit a snag.";
}

export function reloadView(slot = "view") {
  if (typeof window === "undefined") return;
  try {
    const key = `nl-chunk-reload:${slot}`;
    const last = Number(sessionStorage.getItem(key) || "0");
    if (Date.now() - last < 12_000) return;
    sessionStorage.setItem(key, String(Date.now()));
  } catch {
    /* private mode */
  }
  window.location.reload();
}

export function AppErrorComponent({ error }: ErrorComponentProps) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg px-6 text-center text-fg">
      <span className="text-danger" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="text-lg font-medium">The page hit a snag</h1>
      <p className="max-w-md text-sm break-words text-muted">
        {friendlyViewError(error) || "Reload and try again. If you were opening a file, paste the text instead."}
      </p>
      <button
        type="button"
        className="mt-2 h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-fg"
        onClick={() => window.location.reload()}
      >
        Reload
      </button>
    </main>
  );
}

export class TabErrorBoundary extends Component<{ children: ReactNode; slot?: string }, { error: Error | null; nonce: number }> {
  state: { error: Error | null; nonce: number } = { error: null, nonce: 0 };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("NeuroLens view failed", error, info.componentStack);
    if (isStaleChunkError(error)) reloadView(this.props.slot ?? "tab");
  }

  render() {
    if (this.state.error) {
      const stale = isStaleChunkError(this.state.error);
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="max-w-md text-sm text-pretty text-muted">{friendlyViewError(this.state.error)}</p>
          <button
            type="button"
            className="h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-fg"
            onClick={() => {
              if (stale) {
                window.location.reload();
                return;
              }
              this.setState((state) => ({ error: null, nonce: state.nonce + 1 }));
            }}
          >
            {stale ? "Reload" : "Try again"}
          </button>
        </div>
      );
    }
    return <div className="contents" key={this.state.nonce}>{this.props.children}</div>;
  }
}

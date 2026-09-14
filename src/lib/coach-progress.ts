/**
 * Where the reading tour should pick up.
 *
 * Its own module so the rule can be tested without rendering anything, and
 * because the interesting cases are all about a tour whose length changed
 * between releases — none of which are reachable by clicking through a fresh
 * install, and all of which decide whether a returning reader is told about a
 * tool that did not exist last time.
 */

/**
 * How many steps had been seen when the tour was last finished.
 *
 * The original marker was the bare word "done", written before there was any
 * notion of the tour growing. It means the three steps that existed then — so
 * it is read as three rather than as "everything", and someone who finished the
 * old tour is shown what was added instead of nothing.
 */
export const LEGACY_DONE_COUNT = 3;

/** The marker written when the tour is finished at a given length. */
export function doneMarker(total: number): string {
  return `done:${total}`;
}

/** Which step to open on, or null to stay quiet. */
export function resumeStep(stored: string | null, total: number): number | null {
  if (total <= 0) return null;

  if (stored === "done") {
    return LEGACY_DONE_COUNT < total ? LEGACY_DONE_COUNT : null;
  }

  if (stored?.startsWith("done:")) {
    const seen = Number(stored.slice(5));
    if (!Number.isFinite(seen)) return null;
    // A newer build finished a longer tour: rolling back must not replay it.
    return seen < total ? Math.max(0, seen) : null;
  }

  const next = Number(stored);
  return Number.isFinite(next) && next > 0 && next < total ? next : 0;
}

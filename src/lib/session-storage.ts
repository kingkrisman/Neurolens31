/**
 * Fitting reading history into whatever storage the browser will give.
 *
 * Its own module so it can be tested without dragging the whole store — and
 * because deciding what to keep is a rule about the data, not about the app.
 */
import type { Session } from "./types.ts";

/**
 * A first guess at what will fit, in characters.
 *
 * Deliberately below every browser's ceiling rather than near the largest.
 * localStorage is measured in bytes and a JavaScript string is UTF-16, so a
 * payload costs about *twice* its length: the old budget of 3,500,000
 * characters was 6.7 MB of storage, which is over Safari's ~5 MB per origin —
 * the app's own ceiling was above the limit it was meant to stay under. This
 * is only the fast path now; the write below is what actually decides.
 */
const SESSIONS_BUDGET = 2_000_000;

/**
 * Persist history, shedding the oldest entries until it fits.
 *
 * Sessions carry their full text so reading can resume, so a shelf of novels
 * runs into the storage quota. `writeLocal` swallows that failure, which meant
 * the real behaviour was worse than it looked: one oversized history and
 * *nothing* saved after it, newest included. Dropping whole old sessions keeps
 * recent books resumable, and keeps the invariant that a session either
 * restores completely or is not offered at all.
 */

/**
 * Shed oldest-first until the browser accepts the write.
 *
 * The number is a guess; the browser is not. Quotas differ by engine, by
 * private mode, and by whatever else this origin has already stored, so a
 * constant can only ever be wrong in one direction or the other — and it was
 * wrong in the dangerous one. Every attempt is therefore checked, and a refusal
 * sheds another session and tries again.
 *
 * That matters most where it used to fail worst: a quota refusal was swallowed,
 * so the loop exited believing it had saved and the newest book — the one just
 * opened — was silently not there on return.
 */
export function fitSessions(
  sessions: Session[],
  write: (payload: string) => boolean,
  budget: number = SESSIONS_BUDGET,
): Session[] {
  let kept = sessions;
  while (kept.length) {
    const payload = JSON.stringify(kept);
    if (payload.length <= budget && write(payload)) return kept;
    kept = kept.slice(0, -1);
  }
  // Nothing fits, so leave nothing behind: what is on disk has to match what
  // this reports keeping, or the next read offers a book that cannot resume.
  write("[]");
  return [];
}

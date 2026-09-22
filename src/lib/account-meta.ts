/**
 * Facts about an account, as opposed to how it likes to read.
 *
 * These used to live on the reading profile, and that was a mistake with a
 * visible cost: the first-run survey kept coming back. The profile is the one
 * object in this app treated as disposable —
 *
 *  - switching mode rebuilds it from a preset, keeping only theme and alignment;
 *  - applying a saved setup replaces it outright;
 *  - every sync pull replaces the local copy wholesale with the server's.
 *
 * Each of those threw away "this reader has already been asked", so the survey
 * reappeared on refresh, and after changing mode, for people who had answered
 * it. The avatar, moved onto the profile the day before, had the same exposure.
 *
 * So account facts get their own object, their own storage key and their own
 * database column, and — the part that actually fixes it — they are *merged*
 * when a pull arrives, never replaced. Nothing that resets reading settings
 * can reach them.
 */

export interface AvatarChoice {
  style: string;
  shuffle: number;
  background: string;
  /** When this was chosen, so two devices can agree on which is newer. */
  at: number;
}

export interface AccountMeta {
  /** When this account finished or skipped the first-run survey. */
  onboardedAt?: number;
  avatar?: AvatarChoice;
}

const isPositive = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

function normalizeAvatarChoice(value: unknown): AvatarChoice | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Partial<AvatarChoice>;
  if (typeof input.style !== "string" || !input.style) return undefined;
  return {
    style: input.style,
    shuffle: Number.isInteger(input.shuffle) && (input.shuffle as number) >= 0 ? input.shuffle! : 0,
    background: typeof input.background === "string" ? input.background : "",
    // A choice saved before choices carried a time is treated as older than
    // any that does, which is the safe way round: it can be replaced, never
    // replace.
    at: isPositive(input.at) ? input.at : 0,
  };
}

/** Repair whatever came out of storage or off the network. */
export function normalizeMeta(value: unknown): AccountMeta {
  if (!value || typeof value !== "object") return {};
  const input = value as Record<string, unknown>;
  const out: AccountMeta = {};
  if (isPositive(input.onboardedAt)) out.onboardedAt = input.onboardedAt;
  const avatar = normalizeAvatarChoice(input.avatar);
  if (avatar) out.avatar = avatar;
  return out;
}

/**
 * Combine what this device has with what the account has.
 *
 * This is the function the whole fix rests on, so the rules are deliberately
 * simple enough to state in a sentence each:
 *
 *  - **Having been asked is sticky.** If either side says the survey was
 *    answered, it was. A missing value is never evidence of "not asked", only
 *    of a copy that has not caught up — so absence cannot win.
 *  - **The newer avatar wins.** Sync pulls before it pushes, so a pull can
 *    arrive carrying the account's *old* avatar while this device's new one is
 *    still queued. Taking the server's blindly would undo a choice made a
 *    second ago and then push the old one back up.
 */
export function mergeMeta(local: AccountMeta, remote: AccountMeta | undefined): AccountMeta {
  const theirs = normalizeMeta(remote);
  const ours = normalizeMeta(local);
  const merged: AccountMeta = {};

  // The earlier of the two: that is when the reader was actually first asked.
  const asked = [ours.onboardedAt, theirs.onboardedAt].filter(isPositive);
  if (asked.length > 0) merged.onboardedAt = Math.min(...asked);

  if (ours.avatar && theirs.avatar) {
    merged.avatar = theirs.avatar.at > ours.avatar.at ? theirs.avatar : ours.avatar;
  } else {
    const avatar = ours.avatar ?? theirs.avatar;
    if (avatar) merged.avatar = avatar;
  }

  return merged;
}

/**
 * Pull account facts out of a profile that still carries them.
 *
 * For the migration only. Profiles saved before this split may hold
 * `onboardedAt` and `avatar`; those are lifted into `AccountMeta` once, so
 * nobody who answered the survey under the old arrangement is asked again.
 */
export function metaFromLegacyProfile(profile: unknown): AccountMeta {
  if (!profile || typeof profile !== "object") return {};
  const input = profile as Record<string, unknown>;
  return normalizeMeta({ onboardedAt: input.onboardedAt, avatar: input.avatar });
}

/** Whether two metas say the same thing, so a no-op merge writes nothing. */
export function sameMeta(a: AccountMeta, b: AccountMeta): boolean {
  return JSON.stringify(normalizeMeta(a)) === JSON.stringify(normalizeMeta(b));
}

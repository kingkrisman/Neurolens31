/**
 * Who the first-run survey is for.
 *
 * It is a first sign-in survey. Accounts made before it first worked had
 * already been reading — and six of them lost their "already asked" flag to a
 * bug in its first day (the flag lived on the reading profile, which gets
 * rebuilt). Asking those readers now would be asking people who are not new,
 * some of them for the second time. They are counted as asked; anyone can
 * still take it from Settings → "Set up my reading".
 *
 * The cut-off is when the survey first reached anyone: commit 32e7071,
 * deployed 21 September 2026 at 21:50 UTC. Before that it existed in the code
 * and was shown to no one.
 */
export const SURVEY_REACHED_READERS_AT = Date.parse("2026-09-21T22:00:00Z");

export function predatesSurvey(accountCreatedAt: number | null | undefined): boolean {
  return (
    typeof accountCreatedAt === "number" &&
    Number.isFinite(accountCreatedAt) &&
    accountCreatedAt > 0 &&
    accountCreatedAt < SURVEY_REACHED_READERS_AT
  );
}

/**
 * The upstream identity providers this app offers for sign-in (via the broker).
 *
 * Source of truth for BOTH the server (`server.ts`, one `genericOAuth` provider
 * per entry) and the client (`client.ts` / sign-in buttons). Kept in its own
 * dependency-free module so the client can import it without pulling the
 * server-only Better Auth instance (and `pg`) into the browser bundle.
 *
 * Each app federates to the shared **auth broker** (`GROK_AUTH_ISSUER`), which
 * holds the real Google/X secrets. The app never sees them — it only knows its
 * own per-app client id/secret and which upstream to ask the broker for (`idp`).
 *
 * To add an upstream (e.g. GitHub) once the broker supports it: add one entry
 * here (`{ providerId: "grok-github", idp: "github", label: "GitHub" }`). The
 * `providerId` is this app's local id and the OAuth callback path segment
 * (`/api/auth/oauth2/callback/<providerId>`); `idp` is the hint the broker reads
 * to pick the upstream (Better Auth's id for X is still `twitter`).
 */
export type GrokProvider = {
  /** This app's local provider id; also the callback path segment. */
  providerId: string;
  /** Upstream hint the broker forwards to (Better Auth social id). */
  idp: string;
  /** Human label for the sign-in button. */
  label: string;
};

/**
 * Ordered by how most readers will sign in, because the first button is the one
 * a tired reader presses.
 *
 * Apple is listed because this app is used on iPhones, where "Sign in with
 * Apple" is what people expect and, for an app distributed through the App
 * Store, what Apple requires alongside other social sign-in. It only works once
 * the broker holds Apple credentials and accepts `idp: "apple"` — the secrets
 * live there, not here, so nothing in this repository can complete that. Until
 * it does, the button reaches the broker and the broker refuses; the entry is
 * kept so enabling it upstream is the only step left.
 */
export const GROK_PROVIDERS: readonly GrokProvider[] = [
  { providerId: "grok-google", idp: "google", label: "Google" },
  { providerId: "grok-apple", idp: "apple", label: "Apple" },
  { providerId: "grok-x", idp: "twitter", label: "X" },
];

/**
 * Response headers that make the browser defend the reader's data.
 *
 * Everything a person keeps in NeuroLens lives in their browser's storage, and
 * the realistic way for someone else to reach it is to get their own script
 * running on this origin — through a crafted document, a compromised
 * dependency, or a page that frames this one. These headers tell the browser to
 * refuse each of those, independently of whether the app's own escaping holds.
 *
 * Used in two places so they cannot drift: the deployed build (Nitro route
 * rules) and the dev server, so a policy that breaks something breaks it where
 * it can be seen before it ships.
 */

/**
 * Services the browser itself talks to.
 *
 * Kept deliberately short and explicit. Most remote calls already go through
 * this app's own /api routes; these are the few the client fetches directly.
 */
export const CONNECT_ORIGINS = [
  "https://api.dictionaryapi.dev",
  "https://api.datamuse.com",
  "https://bible-api.com",
  "https://bible.helloao.org",
  "https://poetrydb.org",
];

export const IMAGE_ORIGINS = ["https://covers.openlibrary.org", "https://www.gutenberg.org"];

/** Only an https origin may be added from the environment; anything else is ignored. */
export function originOf(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.origin : null;
  } catch {
    return null;
  }
}

/**
 * @param {{ dev?: boolean, extraConnect?: Array<string | undefined> }} [options]
 */
export function contentSecurityPolicy({ dev = false, extraConnect = [] } = {}) {
  const connect = [
    "'self'",
    ...CONNECT_ORIGINS,
    // Supabase and the analytics endpoint, once configured.
    ...extraConnect.map((url) => (url ? originOf(url) : null)).filter(Boolean),
    // Vite's hot reload socket.
    ...(dev ? ["ws:", "wss:"] : []),
  ];

  const directives = {
    "default-src": ["'self'"],
    // 'unsafe-inline' is required by server rendering, which inlines the data
    // the page hydrates from. What matters most is still refused: any script
    // file from anywhere other than this origin.
    "script-src": ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
    // data: for generated avatars, blob: for exported files and PDF pages.
    "img-src": ["'self'", "data:", "blob:", ...IMAGE_ORIGINS],
    "connect-src": connect,
    "worker-src": ["'self'", "blob:"],
    "media-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    // Framing is allowed only by this origin, and in development by the
    // builder's live preview, which shows the app inside an iframe. A deployed
    // site allows nobody: the preview host has no business framing a reader's
    // library, and letting it would leave the page overlayable by whoever holds
    // a subdomain there.
    "frame-ancestors": dev ? ["'self'", "https://*.grok-sandbox.com"] : ["'self'"],
  };

  const policy = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`);
  if (!dev) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}

/**
 * @param {{ dev?: boolean, extraConnect?: Array<string | undefined> }} [options]
 * @returns {Record<string, string>}
 */
export function securityHeaders({ dev = false, extraConnect = [] } = {}) {
  const headers = {
    "Content-Security-Policy": contentSecurityPolicy({ dev, extraConnect }),
    // Stop a response being reinterpreted as a different type — an uploaded
    // text file must never be run as a script.
    "X-Content-Type-Options": "nosniff",
    // Send only the origin to other sites, never the path a reader was on.
    "Referrer-Policy": "strict-origin-when-cross-origin",
    // Hardware the reader never needs this app to touch.
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
    // Keeps a window this app opens from reaching back into it — except
    // popups, which sign-in with Google and Apple needs.
    "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
  };
  if (!dev) {
    // HTTPS only, for two years, once a browser has seen it. Not in dev, where
    // it would pin localhost to HTTPS for every other project too.
    headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains";
  }
  return headers;
}

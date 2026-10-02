import { lookFromProfile, PENDING_TTL_MS, type Stored } from "./settings.ts";

/**
 * The extension's end of the conversation with the NeuroLens app.
 *
 * Runs only on the app's own site. The app says it is ready; the bridge says
 * hello; the app then sends the reader's settings whenever they change, and
 * the bridge hands over any page waiting to be read. Nothing crosses to a
 * server — it is two scripts on one page passing notes through `postMessage`,
 * which is why there is no second sign-in.
 *
 * Messages are only taken from this very window and this very origin. The
 * settings are checked and clamped before they are kept (lookFromProfile).
 */

const FROM_APP = "neurolens-app";
const FROM_EXTENSION = "neurolens-extension";

if (__APP_ORIGINS__.includes(location.origin)) {
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data as { source?: unknown; kind?: unknown; profile?: unknown; modeName?: unknown } | null;
    if (!data || data.source !== FROM_APP) return;
    // "Is it installed?" from the site's extension page and the app's notice.
    if (data.kind === "ping") hello();
    if (data.kind === "ready") {
      hello();
      void deliver();
    }
    if (data.kind === "profile") {
      const look = lookFromProfile(data.profile, data.modeName);
      if (look) void chrome.storage.local.set({ look });
    }
  });
  // In case the app was already listening before this arrived. Only a hello:
  // a page is handed over in answer to "ready", when something is there to take it.
  hello();
}

function hello(): void {
  post({ kind: "hello", version: __VERSION__ });
}

let delivering = false;

/** Hand over the page waiting to be read, once, if it is still fresh. */
async function deliver(): Promise<void> {
  if (delivering) return;
  delivering = true;
  try {
    const { pendingArticle } = (await chrome.storage.local.get("pendingArticle")) as Stored;
    if (!pendingArticle) return;
    await chrome.storage.local.remove("pendingArticle");
    if (Date.now() - pendingArticle.at > PENDING_TTL_MS) return;
    post({ kind: "article", title: pendingArticle.title, text: pendingArticle.text, url: pendingArticle.url });
  } finally {
    delivering = false;
  }
}

function post(message: Record<string, unknown>): void {
  window.postMessage({ source: FROM_EXTENSION, ...message }, location.origin);
}

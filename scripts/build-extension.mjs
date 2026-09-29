/**
 * Builds the browser extension for Chrome/Edge and for Firefox.
 *
 *   node scripts/build-extension.mjs          store builds + zips, for neurolens.space
 *   node scripts/build-extension.mjs --dev    talks to the app on localhost:8080
 *   node scripts/build-extension.mjs --test   --dev, plus access to 127.0.0.1 granted
 *                                             up front so the browser tests never
 *                                             meet a permission prompt
 *
 * Output, one folder per kind so no build clobbers another:
 *   extension/dist/store/{chrome,firefox}/                    the store build, unpacked
 *   extension/dist/neurolens-{chrome,firefox}-<version>.zip   what to upload
 *   extension/dist/dev/{chrome,firefox}/                      load this while developing
 *   extension/dist/test/{chrome,firefox}/                     what the browser tests load
 *
 * Every script is bundled on its own as a plain script (IIFE): content
 * scripts and Chrome's service worker cannot load modules, and the popup has
 * no need to.
 */
import { build } from "vite";
import { zipSync } from "fflate";
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const VERSION = "1.0.0";

const root = fileURLToPath(new URL("..", import.meta.url));
const ext = path.join(root, "extension");
const dist = path.join(ext, "dist");
const args = new Set(process.argv.slice(2));
const test = args.has("--test");
const dev = test || args.has("--dev");
const kind = test ? "test" : dev ? "dev" : "store";
const out = path.join(dist, kind);

// The tests drive the app at 127.0.0.1, as the rest of the browser suite does.
const APP_URL = test ? "http://127.0.0.1:8080" : dev ? "http://localhost:8080" : "https://neurolens.space";
const APP_ORIGINS = dev
  ? ["http://localhost:8080", "http://127.0.0.1:8080"]
  : ["https://neurolens.space", "https://www.neurolens.space"];
const BRIDGE_MATCHES = dev
  ? ["http://localhost/*", "http://127.0.0.1/*"]
  : ["https://neurolens.space/*", "https://www.neurolens.space/*"];

const ENTRIES = ["background", "bridge", "content", "extract", "popup"];

function manifest(browser) {
  const base = {
    manifest_version: 3,
    name: "NeuroLens: read any page your way",
    short_name: "NeuroLens",
    version: VERSION,
    description:
      "Your NeuroLens typeface, spacing, colours and bold word starts on the sites you choose, or any article in the NeuroLens reader.",
    homepage_url: "https://neurolens.space",
    icons: { 16: "icons/icon-16.png", 32: "icons/icon-32.png", 48: "icons/icon-48.png", 128: "icons/icon-128.png" },
    action: {
      default_title: "NeuroLens",
      default_popup: "popup.html",
      default_icon: { 16: "icons/icon-16.png", 32: "icons/icon-32.png" },
    },
    // storage: the settings and the sites list, in this browser only.
    // activeTab + scripting: act on the open tab only when the reader clicks.
    permissions: ["storage", "activeTab", "scripting"],
    // Asked for one site at a time, when the reader switches it on.
    optional_host_permissions: ["https://*/*", "http://*/*"],
    content_scripts: [{ matches: BRIDGE_MATCHES, js: ["bridge.js"], run_at: "document_start" }],
  };
  if (test) base.host_permissions = ["http://127.0.0.1/*"];
  if (browser === "chrome") {
    return { ...base, minimum_chrome_version: "110", background: { service_worker: "background.js" } };
  }
  return {
    ...base,
    background: { scripts: ["background.js"] },
    browser_specific_settings: {
      gecko: {
        id: "extension@neurolens.space",
        strict_min_version: "140.0",
        data_collection_permissions: { required: ["none"] },
      },
    },
  };
}

async function bundle(outDir) {
  for (const name of ENTRIES) {
    await build({
      configFile: false,
      root: ext,
      logLevel: "warn",
      define: {
        __APP_URL__: JSON.stringify(APP_URL),
        __APP_ORIGINS__: JSON.stringify(APP_ORIGINS),
        __VERSION__: JSON.stringify(VERSION),
      },
      build: {
        outDir,
        emptyOutDir: false,
        copyPublicDir: false,
        target: ["chrome110", "firefox140"],
        minify: !dev,
        sourcemap: dev ? "inline" : false,
        lib: {
          entry: path.join(ext, "src", `${name}.ts`),
          formats: ["iife"],
          name: `nl_${name}`,
          fileName: () => `${name}.js`,
        },
      },
    });
  }
}

function files(dir, base = dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? files(full, base) : [path.relative(base, full).split(path.sep).join("/")];
  });
}

// Retried: on Windows a virus scanner often holds a file it has just seen.
const retry = { recursive: true, force: true, maxRetries: 10, retryDelay: 100 };
rmSync(out, retry);
const scripts = path.join(out, ".scripts");
await bundle(scripts);

for (const browser of ["chrome", "firefox"]) {
  const target = path.join(out, browser);
  mkdirSync(target, { recursive: true });
  cpSync(scripts, target, { recursive: true });
  cpSync(path.join(ext, "fonts"), path.join(target, "fonts"), { recursive: true });
  mkdirSync(path.join(target, "icons"));
  for (const size of [16, 32, 48, 128]) {
    cpSync(path.join(ext, "icons", `icon-${size}.png`), path.join(target, "icons", `icon-${size}.png`));
  }
  cpSync(path.join(ext, "src", "popup.html"), path.join(target, "popup.html"));
  cpSync(path.join(ext, "src", "popup.css"), path.join(target, "popup.css"));
  writeFileSync(path.join(target, "manifest.json"), `${JSON.stringify(manifest(browser), null, 2)}\n`);

  if (!dev) {
    const entries = Object.fromEntries(files(target).map((file) => [file, readFileSync(path.join(target, file))]));
    writeFileSync(path.join(dist, `neurolens-${browser}-${VERSION}.zip`), zipSync(entries, { level: 9 }));
  }
}
rmSync(scripts, retry);

const size = (dir) => files(dir).reduce((sum, file) => sum + statSync(path.join(dir, file)).size, 0);
console.log(
  `extension ${VERSION} (${kind}) → ${path.relative(root, out)} ` +
    `[chrome ${Math.round(size(path.join(out, "chrome")) / 1024)} KB, app ${APP_URL}]`,
);

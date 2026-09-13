#!/usr/bin/env node
/**
 * Stamp the built service worker with a version derived from the build.
 *
 * The worker deletes every cache whose name does not match its current
 * VERSION, so VERSION is the only thing that can evict a stale shell. Left to
 * a human it stays put: it sat at "nl-v1" for the life of the app, meaning the
 * worker never once dropped a cache.
 *
 * That is worse than it sounds, because the two fetch strategies compound. A
 * navigation is network-first but falls back to the cached shell; that old
 * HTML names old hashed assets; and hashed assets are served cache-first,
 * without consulting the network. One failed navigation on a bad connection
 * therefore pins a device to that whole build until VERSION changes.
 *
 * So it is derived instead of remembered. The input is the set of emitted
 * asset filenames, which already carry Vite's content hashes: change any code
 * and the set changes, so the version changes and old caches are dropped;
 * rebuild without changing anything and it holds, so returning visitors keep
 * the cache they have.
 *
 *   node scripts/stamp-sw.mjs
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Where a build may land, most specific first. */
const OUTPUT_DIRS = [
  ".vercel/output/static",
  ".output/public",
  "dist/client",
  "dist",
];

/** The line the worker declares its cache generation on. */
const VERSION_LINE = /const VERSION = "[^"]*";/;

/**
 * A stable short digest of what this build emitted.
 *
 * Names only, not contents: Vite already put a content hash in each name, so
 * the names alone move exactly when the code does — and reading a few hundred
 * filenames is free where reading every bundle is not.
 */
export function swVersionFrom(assetNames) {
  const names = [...assetNames].sort();
  const digest = createHash("sha256").update(names.join("\n")).digest("hex");
  return `nl-${digest.slice(0, 12)}`;
}

/** Replace the worker's declared version. Returns null if the line is absent. */
export function stampSource(source, version) {
  if (!VERSION_LINE.test(source)) return null;
  return source.replace(VERSION_LINE, `const VERSION = "${version}";`);
}

/** Every emitted file under `dir`, relative to it, so nested assets count too. */
export function collectNames(dir, readdir = readdirSync) {
  const out = [];
  const walk = (current, prefix) => {
    for (const entry of readdir(current, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      // The worker is the file being stamped; including it would make the
      // version depend on itself.
      if (rel === "sw.js") continue;
      if (entry.isDirectory()) walk(join(current, entry.name), rel);
      else out.push(rel);
    }
  };
  walk(dir, "");
  return out;
}

function findOutput() {
  for (const candidate of OUTPUT_DIRS) {
    const dir = join(ROOT, candidate);
    if (existsSync(join(dir, "sw.js"))) return { dir, label: candidate };
  }
  return null;
}

function main() {
  const found = findOutput();
  if (!found) {
    // Failing loudly is the point: a silent skip ships a worker whose version
    // never moves, which is the exact bug this script exists to prevent.
    console.error(
      `[stamp-sw] no built sw.js found in: ${OUTPUT_DIRS.join(", ")}\n` +
        "[stamp-sw] run this after `vite build`.",
    );
    process.exit(1);
  }

  const swPath = join(found.dir, "sw.js");
  const names = collectNames(found.dir);
  const version = swVersionFrom(names);
  const source = readFileSync(swPath, "utf8");
  const stamped = stampSource(source, version);

  if (stamped === null) {
    console.error(`[stamp-sw] ${swPath} has no \`const VERSION = "…";\` line to stamp.`);
    process.exit(1);
  }

  writeFileSync(swPath, stamped);
  console.log(`[stamp-sw] ${found.label}/sw.js → ${version} (${names.length} files)`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();

#!/usr/bin/env node
/**
 * Copy the pdf.js worker out of the installed package into `public/`.
 *
 * The worker cannot be bundled — it is fetched by URL at runtime — so a copy
 * has to sit in `public/`. Hand-copying it is the problem: the copy and the
 * library drift, and a worker from one version talking to an API from another
 * fails in a way that looks like the PDF being unreadable rather than like a
 * mismatch. The copy in this repository had already drifted by twenty-eight
 * bytes, which was harmless only by luck.
 *
 * So it is copied from `node_modules` on every build, from the same package
 * the app imports, and the two cannot disagree.
 *
 * The legacy build is used deliberately. It is the one pdf.js publishes for
 * environments that are not the newest browsers, and the reader is opened on
 * phones several years old.
 *
 *   node scripts/sync-pdf-worker.mjs [--check]
 */
import { copyFileSync, existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export const SOURCE = "node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs";
export const TARGET = "public/pdf.worker.min.mjs";

/** The pdf.js version a build announces, so a mismatch can be named. */
export function versionOf(source) {
  return /"(\d+\.\d+\.\d{2,})"/.exec(source)?.[1] ?? null;
}

/** Whether two builds are the same bytes, ignoring how lines end. */
export function sameContent(a, b) {
  return a.replace(/\r\n/g, "\n") === b.replace(/\r\n/g, "\n");
}

function main() {
  const from = join(ROOT, SOURCE);
  const to = join(ROOT, TARGET);

  if (!existsSync(from)) {
    console.error(`[pdf-worker] ${SOURCE} is missing — run npm install.`);
    process.exit(1);
  }

  const check = process.argv.includes("--check");
  const source = readFileSync(from, "utf8");
  const current = existsSync(to) ? readFileSync(to, "utf8") : "";

  if (sameContent(source, current)) {
    console.log(`[pdf-worker] ${TARGET} matches pdf.js ${versionOf(source) ?? "?"}`);
    return;
  }

  if (check) {
    console.error(
      `[pdf-worker] ${TARGET} does not match the installed pdf.js ` +
        `(${versionOf(current) ?? "unknown"} vs ${versionOf(source) ?? "unknown"}). ` +
        "Run `node scripts/sync-pdf-worker.mjs`.",
    );
    process.exit(1);
  }

  copyFileSync(from, to);
  console.log(
    `[pdf-worker] copied pdf.js ${versionOf(source) ?? "?"} worker → ${TARGET} ` +
      `(${(statSync(to).size / 1024).toFixed(0)} KB)`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();

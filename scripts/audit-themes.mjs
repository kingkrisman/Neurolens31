#!/usr/bin/env node
/**
 * Check every theme's text colours against its own background.
 *
 * A browser accessibility test only ever measures the one theme that happened
 * to be selected, and this app ships fifteen palettes — it is a reading app
 * for people with low vision, where the choice of palette is much of the
 * point. So they are checked arithmetically instead, all of them, with no
 * browser involved and nothing to select.
 *
 * `--fix` rewrites the failures in place, darkening (or lightening, on a dark
 * palette) each failing colour by the smallest uniform factor that clears the
 * threshold, which keeps the hue the designer chose.
 *
 * Palettes are found by scanning forward from each `--color-bg`, not by
 * parsing blocks: these live at four levels of nesting (`@theme`, a media
 * query, `[data-scheme]`, `[data-tint]`), and a regex that tries to match
 * balanced braces silently found eight of the fifteen — which is the worst
 * possible outcome for an audit, because it reports success.
 */
import { readFile, writeFile } from "node:fs/promises";
import { ratioOf, meetRatio } from "./contrast.mjs";

const FILE = "src/styles.css";
/** 4.5:1 for body text, per WCAG 2.2 AA — what the accessibility page commits to. */
export const AA_TEXT = 4.5;
/** The tokens actually used for text. `--color-border` and friends are not. */
export const TEXT_TOKENS = ["--color-fg", "--color-muted", "--color-subtle"];

/**
 * Every palette in a stylesheet, as `{ bg, colours, label }`.
 *
 * Each `--color-bg` opens a palette, and it runs until the next one. Every
 * palette in this file declares its background first and its text colours
 * directly after, so the span between two backgrounds is exactly one palette.
 */
export function findPalettes(source) {
  const bgPattern = /--color-bg:\s*(#[0-9a-f]{3,8})\s*;/gi;
  const marks = [];
  let match;
  while ((match = bgPattern.exec(source)) !== null) {
    marks.push({ bg: match[1], at: match.index });
  }

  return marks.map((mark, index) => {
    const end = index + 1 < marks.length ? marks[index + 1].at : source.length;
    const body = source.slice(mark.at, end);
    // The nearest selector above the background, for a label a human can find.
    const before = source.slice(0, mark.at);
    const label =
      /([^{}\n]+)\{[^{}]*$/.exec(before)?.[1]?.trim().replace(/\s+/g, " ").slice(0, 70) ??
      `palette at offset ${mark.at}`;

    const colours = [];
    for (const token of TEXT_TOKENS) {
      const found = new RegExp(`${token}:\\s*(#[0-9a-f]{3,8})\\s*;`, "i").exec(body);
      if (found) colours.push({ token, colour: found[1], at: mark.at + found.index });
    }

    // The card colour, where the palette sets one. Not every palette does;
    // those inherit it, and the background is then the only ground to check.
    const surface = /--color-surface:\s*(#[0-9a-f]{3,8})\s*;/i.exec(body)?.[1] ?? null;

    return { bg: mark.bg, surface, label, colours, start: mark.at, end };
  });
}

/**
 * Every text colour that does not clear the threshold.
 *
 * Checked against the palette's background *and* its card surface, whichever
 * is worse. `--color-subtle` is used for the small print inside cards as often
 * as on the page itself, and a colour that passes on one and fails on the
 * other is still a colour somebody cannot read.
 */
export function findFailures(source, target = AA_TEXT) {
  const out = [];
  for (const palette of findPalettes(source)) {
    const grounds = [palette.bg, palette.surface].filter(Boolean);
    for (const { token, colour, at } of palette.colours) {
      const measured = grounds
        .map((ground) => ({ ground, ratio: ratioOf(colour, ground) }))
        .filter((entry) => entry.ratio !== null);
      if (measured.length === 0) continue;

      const worst = measured.reduce((a, b) => (a.ratio <= b.ratio ? a : b));
      if (worst.ratio >= target) continue;

      // Darkened against the worst ground, so the result clears both.
      out.push({
        label: palette.label,
        token,
        colour,
        bg: worst.ground,
        ratio: worst.ratio,
        at,
        suggestion: meetRatio(colour, worst.ground, target),
      });
    }
  }
  return out;
}

/* ── CLI ─────────────────────────────────────────────────────────────────── */

// Run as a script, not when imported by the test beside it. Compared by
// basename because the path arrives backslashed on Windows and as a file URL
// in `import.meta.url`, and normalising those two is more code than this.
if (process.argv[1]?.endsWith("audit-themes.mjs")) {
  const fix = process.argv.includes("--fix");
  const source = await readFile(FILE, "utf8");
  const palettes = findPalettes(source);
  const failures = findFailures(source);

  if (failures.length === 0) {
    console.log(
      `[themes] ${palettes.length} palettes checked; every text colour clears ${AA_TEXT}:1.`,
    );
    process.exit(0);
  }

  console.log(
    `\n  ${failures.length} of ${palettes.length} palettes have text below ${AA_TEXT}:1\n`,
  );
  for (const f of failures) {
    const better = f.suggestion ? ratioOf(f.suggestion, f.bg).toFixed(2) : "?";
    console.log(`  ${f.label}`);
    console.log(
      `    ${f.token}: ${f.colour} on ${f.bg} → ${f.ratio.toFixed(2)}:1` +
        (f.suggestion ? `   →  ${f.suggestion} (${better}:1)` : "  — no fix found"),
    );
  }

  if (!fix) {
    console.log(`\n  Run \`node scripts/audit-themes.mjs --fix\` to apply these.\n`);
    process.exit(1);
  }

  // Applied back to front, so an earlier replacement cannot move a later offset.
  let output = source;
  const applied = [...failures].filter((f) => f.suggestion).sort((a, b) => b.at - a.at);
  for (const f of applied) {
    const head = output.slice(0, f.at);
    const tail = output
      .slice(f.at)
      .replace(new RegExp(`(${f.token}:\\s*)${f.colour}`, "i"), `$1${f.suggestion}`);
    output = head + tail;
  }
  await writeFile(FILE, output, "utf8");
  console.log(`\n  Applied ${applied.length} fix(es) to ${FILE}.\n`);
}

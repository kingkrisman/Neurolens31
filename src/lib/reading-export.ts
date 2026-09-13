import { processBionicText } from "./bionic.ts";
import { COLOR_SCHEMES, DARK_SCHEMES, FONT_CHOICES, type ReadingProfile } from "./types.ts";

const FONT_STACK: Record<ReadingProfile["fontFamily"], string> = {
  sans: '"Segoe UI", ui-sans-serif, system-ui, sans-serif',
  serif: 'Newsreader, "Iowan Old Style", Palatino, Georgia, serif',
  lexend: "Lexend, ui-sans-serif, sans-serif",
  atkinson: '"Atkinson Hyperlegible", ui-sans-serif, sans-serif',
  inclusive: '"Inclusive Sans", ui-sans-serif, sans-serif',
  andika: "Andika, ui-sans-serif, sans-serif",
  opendyslexic: "OpenDyslexic, Lexend, ui-sans-serif, sans-serif",
  literata: "Literata, Georgia, serif",
  comicneue: '"Comic Neue", "Comic Sans MS", ui-sans-serif, sans-serif',
  sourcesans: '"Source Sans 3", ui-sans-serif, sans-serif',
};

export function profileSummary(profile: ReadingProfile, targetWpm: number): string {
  const font = FONT_CHOICES.find((item) => item.id === profile.fontFamily)?.label ?? profile.fontFamily;
  const scheme = COLOR_SCHEMES.find((item) => item.id === profile.theme)?.label ?? profile.theme;
  return [
    `Scheme ${scheme}`,
    `${font} ${profile.fontSize}px`,
    `line height ${profile.lineHeight.toFixed(1)}`,
    `letter ${profile.letterSpacing.toFixed(2)}`,
    `word ${profile.wordSpacing.toFixed(2)}`,
    `fixation ${Math.round(profile.bionicStrength * 100)}%`,
    profile.plainLanguage ? "plain words on" : "plain words off",
    `rhythm ${profile.rhythmCurve}`,
    `target ${targetWpm} WPM`,
  ].join(" · ");
}

export function exportPlainText(text: string, profile: ReadingProfile, targetWpm: number, title: string): string {
  return `${title}\nNeuroLens export · ${profileSummary(profile, targetWpm)}\n\n${text.trim()}\n`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "\u0026amp;")
    .replace(/</g, "\u0026lt;")
    .replace(/>/g, "\u0026gt;")
    .replace(/"/g, "\u0026quot;");
}

export function exportHtmlDocument(
  text: string,
  profile: ReadingProfile,
  targetWpm: number,
  title: string,
): string {
  const scheme = COLOR_SCHEMES.find((item) => item.id === profile.theme);
  const bg = scheme?.swatch ?? "#f0e8dc";
  const fg = scheme?.ink ?? "#1c1611";
  const body = processBionicText(text, profile.bionicStrength, profile.rhythmOptimization);
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => `<p>${chunk.replace(/\n/g, "<br>")}</p>`)
    .join("\n");
  const summary = profileSummary(profile, targetWpm);
  const colorScheme = scheme && DARK_SCHEMES.includes(scheme.id) ? "dark" : "light";
  const safeTitle = escapeHtml(title);
  const safeSummary = escapeHtml(summary);
  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    `  <title>${safeTitle} · NeuroLens</title>`,
    "  <style>",
    `    :root { color-scheme: ${colorScheme}; }`,
    "    body {",
    "      margin: 0 auto;",
    "      max-width: 40rem;",
    "      padding: 2.5rem 1.5rem 4rem;",
    `      background: ${bg};`,
    `      color: ${fg};`,
    `      font-family: ${FONT_STACK[profile.fontFamily]};`,
    `      font-size: ${profile.fontSize}px;`,
    `      line-height: ${profile.lineHeight};`,
    `      letter-spacing: ${profile.letterSpacing}em;`,
    `      word-spacing: ${profile.wordSpacing}em;`,
    "    }",
    "    header { margin-bottom: 2rem; }",
    "    .kicker { font-size: 0.75rem; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.62; }",
    "    h1 { font-size: 1.8em; line-height: 1.2; font-weight: 500; margin: 0.4rem 0 0.75rem; }",
    "    .meta { font-size: 0.85rem; opacity: 0.7; }",
    "    .fixation { font-weight: 700; letter-spacing: -0.02em; }",
    "    p { margin: 0 0 1.1em; }",
    "  </style>",
    "</head>",
    "<body>",
    "  <header>",
    '    <p class="kicker">NeuroLens export</p>',
    `    <h1>${safeTitle}</h1>`,
    `    <p class="meta">${safeSummary}</p>`,
    "  </header>",
    "  <article>",
    paragraphs,
    "  </article>",
    "</body>",
    "</html>",
  ].join("\n");
}

export async function copyReading(
  text: string,
  profile: ReadingProfile,
  targetWpm: number,
  title: string,
): Promise<void> {
  const plain = exportPlainText(text, profile, targetWpm, title);
  const html = exportHtmlDocument(text, profile, targetWpm, title);
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        }),
      ]);
      return;
    } catch {
      /* fall through */
    }
  }
  await navigator.clipboard.writeText(plain);
}

export function downloadReading(
  text: string,
  profile: ReadingProfile,
  targetWpm: number,
  title: string,
): void {
  const html = exportHtmlDocument(text, profile, targetWpm, title);
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "neurolens";
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${slug}.html`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Render marked passages as Markdown.
 *
 * Markdown rather than the styled HTML the reading export produces, because
 * these are going somewhere else — a notes app, an essay, a citation — and a
 * document carrying this app's type settings would be fighting whatever it
 * lands in. Notes are quoted under their passage so the pairing survives the
 * trip.
 */
/** Collapse a passage onto one line, so a blockquote stays a blockquote. */
function flatten(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function highlightsToMarkdown(
  groups: { title: string; marks: { text: string; note?: string; section: number }[] }[],
): string {
  const lines: string[] = ["# Highlights", ""];

  for (const group of groups) {
    if (!group.marks.length) continue;
    lines.push(`## ${group.title}`, "");
    for (const mark of group.marks) {
      lines.push(`> ${flatten(mark.text)}`);
      if (mark.note) lines.push("", flatten(mark.note));
      lines.push("");
    }
  }

  const total = groups.reduce((sum, group) => sum + group.marks.length, 0);
  lines.push("---", `${total} passage${total === 1 ? "" : "s"} from NeuroLens.`, "");
  return lines.join("\n");
}

/** Save the marked passages as a .md file. */
export function downloadHighlights(
  groups: { title: string; marks: { text: string; note?: string; section: number }[] }[],
): void {
  const markdown = highlightsToMarkdown(groups);
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "neurolens-highlights.md";
  link.click();
  URL.revokeObjectURL(url);
}

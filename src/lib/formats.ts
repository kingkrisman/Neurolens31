/**
 * Turning the other document formats into readable prose.
 *
 * Everything here is a pure string-to-string transform so it can be tested
 * without a browser or a zip. The unpacking lives in the document processor;
 * what a format *means* lives here.
 *
 * The shared problem is that every one of these carries its structure inline —
 * tags, control words, XML elements — and a reader wants the sentences, with
 * paragraph breaks kept because the reader paginates on them. So each of these
 * throws away the markup while preserving exactly one thing: where one
 * paragraph ends and the next begins.
 */

/** Collapse runs of blank lines, trim each line, and drop leading/trailing space. */
export function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function safeCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

/**
 * Named entities worth knowing.
 *
 * Not the full HTML set — that is two thousand names, nearly all of them
 * symbols no book uses. These are the ones that actually appear in prose:
 * the punctuation a typesetter reaches for, and the accented letters English
 * borrows. Anything else survives as written, which reads as a small blemish
 * rather than as damage.
 */
const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ", lt: "<", gt: ">", quot: '"', apos: "'",
  mdash: "—", ndash: "–", hellip: "…", bull: "•", middot: "·",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  laquo: "«", raquo: "»", sbquo: "‚", bdquo: "„",
  prime: "′", Prime: "″", dagger: "†", Dagger: "‡", para: "¶", sect: "§",
  copy: "©", reg: "®", trade: "™", deg: "°", plusmn: "±", times: "×", divide: "÷",
  frac12: "½", frac14: "¼", frac34: "¾", permil: "‰",
  euro: "€", pound: "£", yen: "¥", cent: "¢", curren: "¤",
  eacute: "é", egrave: "è", ecirc: "ê", euml: "ë",
  aacute: "á", agrave: "à", acirc: "â", auml: "ä", aring: "å", atilde: "ã", aelig: "æ",
  iacute: "í", igrave: "ì", icirc: "î", iuml: "ï",
  oacute: "ó", ograve: "ò", ocirc: "ô", ouml: "ö", otilde: "õ", oslash: "ø",
  uacute: "ú", ugrave: "ù", ucirc: "û", uuml: "ü",
  ccedil: "ç", ntilde: "ñ", szlig: "ß", yacute: "ý", yuml: "ÿ", thorn: "þ", eth: "ð",
  Eacute: "É", Aacute: "Á", Iacute: "Í", Oacute: "Ó", Uacute: "Ú",
  Ccedil: "Ç", Ntilde: "Ñ", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", AElig: "Æ", Oslash: "Ø",
  larr: "←", rarr: "→", harr: "↔", uarr: "↑", darr: "↓",
  ne: "≠", le: "≤", ge: "≥", minus: "−", infin: "∞", radic: "√", asymp: "≈",
  shy: "", zwj: "", zwnj: "", ensp: " ", emsp: " ", thinsp: " ",
};

/** Undo numeric escapes and the named entities that turn up in prose. */
export function decodeEntities(text: string): string {
  return (
    text
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeCodePoint(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, dec) => safeCodePoint(parseInt(dec, 10)))
      // Case-sensitive: &Auml; and &auml; are different letters, and folding
      // them together would quietly change the word.
      .replace(/&([a-zA-Z][a-zA-Z0-9]{1,31});/g, (whole, name: string) => {
        const exact = NAMED_ENTITIES[name];
        if (exact !== undefined) return exact;
        // Entity names are conventionally lower-case; only the accented pairs
        // above are deliberately cased, and those matched exactly.
        const lower = NAMED_ENTITIES[name.toLowerCase()];
        return lower !== undefined && name.toLowerCase() === name ? lower : whole;
      })
      // Ampersand last, or it would re-open the escapes decoded above.
      .replace(/&amp;/gi, "&")
  );
}

/**
 * Readable text from HTML — also the body of every EPUB chapter.
 *
 * Done without DOMParser on purpose: this runs over EPUB chapters too, and
 * those arrive as XHTML strings from a zip rather than as a document. One
 * implementation that never touches the DOM is both testable and safe to run
 * on a file the reader did not write — nothing here can execute a script,
 * because nothing here ever builds a node.
 */
export function textFromHtml(html: string): string {
  const withoutDeadWeight = html
    // Anything whose text is not prose for the reader.
    .replace(/<(script|style|head|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    // Removed outright rather than spaced: a comment can sit mid-word, so
    // "A<!-- x -->B" is "AB".
    .replace(/<!--[\s\S]*?-->/g, "");

  const spaced = withoutDeadWeight
    // Blocks that end a paragraph.
    .replace(/<\/(p|div|section|article|h[1-6]|li|tr|blockquote|pre|figcaption)\s*>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<hr\s*\/?>/gi, "\n\n")
    // Everything else is inline: drop the tag and keep the words either side
    // adjacent, because <em>word</em>s is one word.
    .replace(/<[^>]+>/g, "");

  return tidy(decodeEntities(spaced));
}

/**
 * Readable text from a Word document's `word/document.xml`.
 *
 * Word splits a sentence across many `<w:t>` runs — one per formatting change,
 * sometimes one per corrected typo — so the runs are concatenated with nothing
 * between them. `<w:p>` is the paragraph, and `<w:br>`/`<w:tab>` are the breaks
 * inside one.
 */
export function textFromDocxXml(xml: string): string {
  const paragraphs: string[] = [];
  for (const match of xml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)) {
    const body = match[1] ?? "";
    let out = "";
    for (const piece of body.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:(br|tab|cr)\b[^>]*\/?>/g)) {
      if (piece[1] !== undefined) out += piece[1];
      else if (piece[2] === "tab") out += " ";
      else out += "\n";
    }
    paragraphs.push(decodeEntities(out));
  }
  return tidy(paragraphs.join("\n\n"));
}

/** Groups whose contents are machinery rather than the document's words. */
const RTF_SKIPPED = new Set([
  "fonttbl",
  "colortbl",
  "stylesheet",
  "info",
  "pict",
  "object",
  "themedata",
  "colorschememapping",
  "latentstyles",
  "datastore",
  "generator",
  "xmlnstbl",
  "listtable",
  "listoverridetable",
  "rsidtbl",
]);

/**
 * Readable text from RTF.
 *
 * Scanned rather than pattern-matched, because the two things that go wrong
 * both need position to fix. The metadata groups nest, so `{\fonttbl{\f0
 * Times;}}` ends at the *second* brace and a non-greedy match stops at the
 * first, spilling the rest of the table into the prose. And unescaping `\{`
 * before stripping structural braces means the literal brace just restored is
 * stripped along with them. A single pass that knows where it is avoids both.
 *
 * Only enough of the format to recover prose is implemented: the control words
 * that mean a break, the escapes that mean a character, and the groups to skip.
 */
export function textFromRtf(rtf: string): string {
  let out = "";
  let depth = 0;
  /** Brace depth of the group being skipped, or null while emitting. */
  let skipDepth: number | null = null;
  /** A Unicode escape is followed by a fallback character to discard. */
  let skipChars = 0;

  for (let i = 0; i < rtf.length; i += 1) {
    const ch = rtf[i]!;

    if (ch === "{") {
      depth += 1;
      continue;
    }
    if (ch === "}") {
      if (skipDepth !== null && depth === skipDepth) skipDepth = null;
      depth -= 1;
      continue;
    }

    if (ch === "\\") {
      const next = rtf[i + 1];

      // An escaped literal.
      if (next === "{" || next === "}" || next === "\\") {
        if (skipDepth === null) out += next;
        i += 1;
        continue;
      }

      // A group marked skippable; the control word naming it follows.
      if (next === "*") {
        i += 1;
        continue;
      }

      // \'hh is one byte in the document's codepage; Latin-1 is the common case.
      if (next === "'" && /^[0-9a-f]{2}$/i.test(rtf.slice(i + 2, i + 4))) {
        if (skipDepth === null) {
          if (skipChars > 0) skipChars -= 1;
          else out += safeCodePoint(parseInt(rtf.slice(i + 2, i + 4), 16));
        }
        i += 3;
        continue;
      }

      const word = /^\\([a-zA-Z]+)(-?\d+)?[ ]?/.exec(rtf.slice(i));
      if (!word) continue;
      const name = word[1]!;
      const arg = word[2] ? Number(word[2]) : null;
      i += word[0].length - 1;

      if (name === "u" && arg !== null) {
        if (skipDepth === null) out += safeCodePoint(arg < 0 ? arg + 65536 : arg);
        skipChars = 1;
        continue;
      }
      if (skipDepth !== null) continue;
      if (name === "par" || name === "pard") {
        out += "\n\n";
        continue;
      }
      if (name === "line") {
        out += "\n";
        continue;
      }
      if (name === "tab") {
        out += " ";
        continue;
      }
      if (RTF_SKIPPED.has(name)) skipDepth = depth;
      continue;
    }

    // Literal newlines in the source are formatting, not content; RTF says so
    // with \par.
    if (ch === "\n" || ch === "\r") continue;

    if (skipDepth === null) {
      if (skipChars > 0) skipChars -= 1;
      else out += ch;
    }
  }

  return tidy(out);
}

/**
 * The reading order of an EPUB, from its package document.
 *
 * The spine is the only thing that says what order the chapters go in; the zip
 * lists them however it happens to. Falling back to zip order produces a book
 * whose chapters are shuffled, which is worse than obvious breakage because it
 * still looks like the book.
 */
export function spineOrder(opfXml: string): string[] {
  const manifest = new Map<string, string>();
  for (const item of opfXml.matchAll(/<item\b[^>]*>/gi)) {
    const tag = item[0];
    const id = /\bid\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (id && href) manifest.set(id, decodeEntities(href));
  }

  const order: string[] = [];
  for (const ref of opfXml.matchAll(/<itemref\b[^>]*>/gi)) {
    const idref = /\bidref\s*=\s*["']([^"']+)["']/i.exec(ref[0])?.[1];
    const href = idref ? manifest.get(idref) : undefined;
    if (href) order.push(href);
  }
  return order;
}

/** Resolve an OPF-relative href against the OPF's own folder inside the zip. */
export function resolveHref(opfPath: string, href: string): string {
  const base = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";
  const joined = `${base}${href}`.split("#")[0]!;
  const parts: string[] = [];
  for (const segment of joined.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") parts.pop();
    else parts.push(segment);
  }
  return parts.join("/");
}

/** Where the package document lives, from `META-INF/container.xml`. */
export function opfPathFrom(containerXml: string): string | null {
  const match = /<rootfile\b[^>]*\bfull-path\s*=\s*["']([^"']+)["']/i.exec(containerXml);
  return match ? decodeEntities(match[1]!) : null;
}

/** A title from the package document, when it names one. */
export function epubTitle(opfXml: string): string | null {
  const match =
    /<dc:title\b[^>]*>([\s\S]*?)<\/dc:title>/i.exec(opfXml) ??
    /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(opfXml);
  const title = match ? tidy(decodeEntities(match[1] ?? "")) : "";
  return title || null;
}

import { parseBlocks } from "./blocks.ts";
import { splitSentenceSpans } from "./sentences.ts";

export interface SearchHit {
  /** Chapter, Part, or PDF page the match sits in. */
  section: number;
  /** Line index within that section. */
  lineIdx: number;
  /** The whole sentence, for context in the results list. */
  text: string;
  /** Where the match starts inside `text`, for highlighting it. */
  start: number;
  end: number;
}

/**
 * Line identity, kept in step with the reader.
 *
 * The reader derives every line's id the same way when it renders a section,
 * and the ids are what search results are steered by — a hit is only reachable
 * if the number here is the number the DOM ends up using. The two must not
 * drift apart, so this is the one place the formula is written down.
 */
export function lineIdOf(blockIndex: number, itemIndex: number, spanIndex: number): number {
  return blockIndex * 1000 + itemIndex * 40 + spanIndex;
}

/** Case- and diacritic-insensitive, so "cafe" finds "café". */
function fold(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/**
 * Fold a haystack while remembering where each folded character came from.
 *
 * Folding is not length-preserving — stripping the accent from "é" turns one
 * character into one, but decomposing "ﬁ" or a combining sequence does not —
 * so an offset found in the folded string does not address the same character
 * in the original. Highlighting the match needs original coordinates, so the
 * mapping is kept as the fold is built rather than guessed at afterwards.
 */
function foldWithMap(value: string): { folded: string; map: number[] } {
  let folded = "";
  const map: number[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const piece = fold(value[i]!);
    for (let j = 0; j < piece.length; j += 1) {
      folded += piece[j];
      map.push(i);
    }
  }
  // One past the end, so a match ending on the last character can be sliced.
  map.push(value.length);
  return { folded, map };
}

/**
 * Find a phrase across a whole book.
 *
 * Searches sentence by sentence rather than over the raw string, because a
 * result is only useful if it can be *gone to*: the reader navigates by section
 * and line, so a match has to be reported in those terms. Matching the folded
 * text but slicing the original keeps accents and capitalisation intact in what
 * the reader is shown.
 *
 * `sections` is the book already divided the way the reader divides it —
 * chapters, auto-paginated Parts, or PDF pages. A single-section book passes one
 * entry and gets `section: 0`, which is what the reader uses for unpaged text.
 */
export function searchBook(
  sections: string[],
  query: string,
  options: { limit?: number; sectionOffset?: number } = {},
): SearchHit[] {
  const needle = fold(query.trim());
  if (needle.length < 2) return [];

  const limit = options.limit ?? 200;
  // Chapters and Parts are numbered from 1; unpaged text is section 0.
  const offset = options.sectionOffset ?? (sections.length > 1 ? 1 : 0);
  const hits: SearchHit[] = [];

  for (let s = 0; s < sections.length; s += 1) {
    const blocks = parseBlocks(sections[s] ?? "");

    blocks.forEach((block, blockIndex) => {
      const sources = block.items?.map((item) => item.text) ?? (block.text ? [block.text] : []);
      sources.forEach((source, itemIndex) => {
        splitSentenceSpans(source).forEach((span, spanIndex) => {
          if (hits.length >= limit) return;
          const text = span.trim();
          if (!text) return;
          const { folded, map } = foldWithMap(text);
          const at = folded.indexOf(needle);
          if (at === -1) return;
          hits.push({
            section: s + offset,
            lineIdx: lineIdOf(blockIndex, itemIndex, spanIndex),
            text,
            // Mapped back to the original string, so the slice lands on the
            // characters the reader actually sees.
            start: map[at] ?? 0,
            end: map[at + needle.length] ?? text.length,
          });
        });
      });
    });

    if (hits.length >= limit) break;
  }

  return hits;
}

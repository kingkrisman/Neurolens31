import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildBundle, highlightsAsMarkdown } from "./data-export.ts";
import type { Highlight } from "./types.ts";

const mark = (over: Partial<Highlight> = {}): Highlight => ({
  lineIdx: 0,
  section: 1,
  start: 0,
  end: 10,
  text: "a passage",
  at: 1,
  ...over,
});

describe("highlightsAsMarkdown", () => {
  it("groups by book under its title", () => {
    const out = highlightsAsMarkdown({ k1: [mark()] }, () => "Moby Dick");
    assert.match(out, /## Moby Dick/);
    assert.match(out, /> a passage/);
  });

  it("keeps a note with the passage it belongs to", () => {
    const out = highlightsAsMarkdown({ k1: [mark({ note: "why this matters" })] }, () => "Book");
    const quoted = out.indexOf("> a passage");
    const note = out.indexOf("why this matters");
    assert.ok(quoted !== -1 && note > quoted, "the note follows its passage");
  });

  it("orders passages as they appear in the book", () => {
    const out = highlightsAsMarkdown(
      {
        k1: [
          mark({ section: 2, text: "later" }),
          mark({ section: 1, text: "earlier" }),
        ],
      },
      () => "Book",
    );
    assert.ok(out.indexOf("earlier") < out.indexOf("later"));
  });

  it("flattens line breaks so a quote stays one block", () => {
    const out = highlightsAsMarkdown({ k1: [mark({ text: "one\n\ntwo" })] }, () => "Book");
    assert.match(out, /> one two/);
    assert.doesNotMatch(out, /> one\n\n> two/);
  });

  it("says so plainly when there is nothing to export", () => {
    assert.match(highlightsAsMarkdown({}, () => "x"), /Nothing marked yet/);
    // A book whose marks were all removed should not leave an empty heading.
    assert.doesNotMatch(highlightsAsMarkdown({ k1: [] }, () => "Ghost"), /Ghost/);
  });
});

describe("buildBundle", () => {
  it("stamps what it is, so an importer can check before trusting it", () => {
    const bundle = buildBundle({
      sessions: [],
      highlights: {},
      bookmarks: [],
      savedProfiles: [],
      profile: {},
      targetWpm: 220,
    });
    assert.equal(bundle.app, "NeuroLens");
    assert.equal(bundle.version, 1);
    assert.ok(Date.parse(bundle.exportedAt) > 0);
  });

  it("carries every store that would otherwise be lost with the browser", () => {
    const bundle = buildBundle({
      sessions: [],
      highlights: { a: [mark()] },
      bookmarks: [],
      savedProfiles: [],
      profile: { fontSize: 18 },
      targetWpm: 240,
    });
    for (const key of ["sessions", "highlights", "bookmarks", "savedProfiles", "profile", "targetWpm"]) {
      assert.ok(key in bundle, `missing ${key}`);
    }
    assert.equal(bundle.targetWpm, 240);
  });
});

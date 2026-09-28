import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EMPTY_GARDEN,
  describeGrowth,
  normalizeGarden,
  plantIdFor,
  speciesOf,
  stageOf,
  withBloom,
  withChapterFinished,
  syncedGarden,
  normalizeSynced,
  mergeSynced,
  knowsMore,
} from "./garden.ts";

const id = plantIdFor("It was the best of times, it was the worst of times");
const growth = (section: number, at = 1000 + section) => ({ id, title: "Two Cities", section, at });

test("finishing a first chapter plants a sprout", () => {
  const garden = withChapterFinished(EMPTY_GARDEN, growth(1));
  assert.equal(garden.plants.length, 1);
  assert.equal(stageOf(garden.plants[0]!), 1);
  assert.equal(
    describeGrowth(EMPTY_GARDEN, garden, id),
    "A new sprout for Two Cities in your garden.",
  );
});

test("re-reading a chapter does not count twice", () => {
  const once = withChapterFinished(EMPTY_GARDEN, growth(1));
  const twice = withChapterFinished(once, growth(1, 5000));
  assert.equal(twice, once);
});

test("growth is front-loaded, then takes more", () => {
  let garden = EMPTY_GARDEN;
  const stages: number[] = [];
  for (let section = 1; section <= 9; section += 1) {
    garden = withChapterFinished(garden, growth(section));
    stages.push(stageOf(garden.plants[0]!));
  }
  assert.deepEqual(stages, [1, 2, 2, 3, 3, 3, 3, 4, 4]);
});

test("a recall card opens one flower per chapter, and counts the chapter as read", () => {
  const bloomed = withBloom(EMPTY_GARDEN, growth(3));
  assert.deepEqual(bloomed.plants[0]!.blooms, [3]);
  assert.deepEqual(bloomed.plants[0]!.chapters, [3]);
  assert.equal(withBloom(bloomed, growth(3, 9000)), bloomed);
  const grown = withChapterFinished(EMPTY_GARDEN, growth(3));
  assert.equal(
    describeGrowth(grown, withBloom(grown, growth(3)), id),
    "A flower opened on Two Cities.",
  );
});

test("nothing ever wilts: there is no operation that removes growth", () => {
  // The garden's whole promise. Time passing is not an input to anything.
  let garden = withChapterFinished(EMPTY_GARDEN, growth(1));
  garden = withBloom(garden, growth(1));
  const later = normalizeGarden(JSON.parse(JSON.stringify(garden)));
  assert.deepEqual(later, garden);
});

test("a book always grows into the same kind of plant", () => {
  assert.equal(speciesOf(id), speciesOf(id));
  const kinds = new Set(Array.from({ length: 40 }, (_, i) => speciesOf(plantIdFor(`book ${i}`))));
  assert.ok(kinds.size >= 3, "species vary across books");
});

test("storage garbage becomes an empty garden, not a crash", () => {
  assert.deepEqual(normalizeGarden(null), EMPTY_GARDEN);
  assert.deepEqual(normalizeGarden({ plants: "no" }), EMPTY_GARDEN);
  assert.deepEqual(normalizeGarden({ plants: [{ id: "" }, { nope: 1 }] }), { plants: [] });
});

/* â”€â”€ Across devices â”€â”€ */

test("only plants for books in the account are sent, and never a title", () => {
  let garden = withChapterFinished(EMPTY_GARDEN, { ...growth(1), book: "uuid-1" });
  garden = withChapterFinished(garden, {
    id: plantIdFor("A diary kept on this device"),
    title: "My Private Diary",
    section: 1,
    at: 2000,
  });
  const sent = syncedGarden(garden, () => null);
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.book, "uuid-1");
  assert.ok(!JSON.stringify(sent).includes("Diary"));
  assert.ok(!JSON.stringify(sent).includes("Two Cities"));
});

test("a plant can learn its book later, from the device's own pairing", () => {
  const garden = withChapterFinished(EMPTY_GARDEN, growth(1));
  const sent = syncedGarden(garden, (plant) => (plant.id === id ? "uuid-9" : null));
  assert.deepEqual(sent.map((plant) => plant.book), ["uuid-9"]);
});

test("the account's plants are folded in, and growth only ever adds", () => {
  const ours = withChapterFinished(EMPTY_GARDEN, { ...growth(1), book: "uuid-1" });
  const theirs = normalizeSynced([
    { book: "uuid-1", plantedAt: 500, grewAt: 9000, chapters: [2, 3], blooms: [3] },
    { book: "uuid-2", plantedAt: 700, grewAt: 800, chapters: [1], blooms: [] },
    { book: "gone", plantedAt: 1, grewAt: 1, chapters: [1], blooms: [] },
  ]);
  const merged = mergeSynced(ours, theirs, (book) =>
    book === "uuid-2" ? { id: "b-uuid-2", title: "Middlemarch" } : book === "uuid-1" ? { id, title: "Two Cities" } : null,
  );
  const one = merged.plants.find((plant) => plant.book === "uuid-1")!;
  assert.deepEqual([...one.chapters].sort(), [1, 2, 3]);
  assert.deepEqual(one.blooms, [3]);
  assert.equal(one.plantedAt, 500);
  assert.equal(one.grewAt, 9000);
  const two = merged.plants.find((plant) => plant.book === "uuid-2")!;
  assert.equal(two.title, "Middlemarch", "the title comes from this device's copy of the book");
  assert.equal(merged.plants.length, 2, "a book this device does not list is skipped");
  assert.equal(mergeSynced(merged, theirs, () => null), merged, "nothing new, nothing written");
});

test("a plant that arrived before the book's text is found again when it grows", () => {
  const arrived = mergeSynced(
    EMPTY_GARDEN,
    normalizeSynced([{ book: "uuid-2", plantedAt: 1, grewAt: 1, chapters: [1], blooms: [] }]),
    () => ({ id: "b-uuid-2", title: "Middlemarch" }),
  );
  const grown = withChapterFinished(arrived, {
    id: plantIdFor("Miss Brooke had that kind of beauty"),
    title: "Middlemarch",
    section: 2,
    at: 50,
    book: "uuid-2",
  });
  assert.equal(grown.plants.length, 1, "one plant, not two");
  assert.deepEqual(grown.plants[0]!.chapters, [1, 2]);
});

test("a device that grew something the account lacks says so", () => {
  const remote = normalizeSynced([{ book: "uuid-1", plantedAt: 1, grewAt: 5, chapters: [1], blooms: [] }]);
  assert.equal(knowsMore(remote, remote), false);
  const local = [{ ...remote[0]!, chapters: [1, 2], grewAt: 6 }];
  assert.equal(knowsMore(local, remote), true);
  assert.equal(knowsMore([{ ...remote[0]!, book: "uuid-3" }], remote), true);
});

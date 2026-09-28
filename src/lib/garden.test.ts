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

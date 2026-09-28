import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRecallCard, recallVerdict, seedOf, usableSentences } from "./recall.ts";

const chapter = (name: string, count: number) =>
  Array.from(
    { length: count },
    (_, i) =>
      `${name} walked along the ${["river", "hill", "road", "field", "shore", "wall"][i % 6]} for the ${i + 1}th time that morning, counting the steps as she went.`,
  ).join(" ");

const ONE = chapter("Ada", 12);
const TWO = chapter("Beth", 12);
const THREE = chapter("Cora", 12);

test("every question has exactly one answer the text proves", () => {
  const card = buildRecallCard(TWO, [ONE, THREE]);
  assert.equal(card.length, 2);
  const [wasHere, cameFirst] = card;

  // Was it here: the right option is in this chapter, the others are not.
  const flat = TWO.replace(/\s+/g, " ");
  const inChapter = wasHere!.options.map((option) => flat.includes(option.replace(/…$/, "")));
  assert.deepEqual(
    inChapter.map((yes, i) => (yes ? i : -1)).filter((i) => i >= 0),
    [wasHere!.answerIndex],
  );

  // Which came first: the answer really does come earlier.
  const positions = cameFirst!.options.map((option) => flat.indexOf(option.replace(/…$/, "")));
  const earliest = positions.indexOf(Math.min(...positions));
  assert.equal(cameFirst!.answerIndex, earliest);
});

test("the same chapter always asks the same card", () => {
  assert.deepEqual(buildRecallCard(TWO, [ONE, THREE]), buildRecallCard(TWO, [ONE, THREE]));
});

test("a line that repeats in this chapter is never offered as a wrong answer", () => {
  const repeated = "The bell rang twice over the quiet harbour before the ferry left.";
  const here = `${chapter("Dee", 10)} ${repeated}`;
  const there = `${chapter("Eve", 10)} ${repeated}`;
  const card = buildRecallCard(here, [there]);
  const wasHere = card.find((question) => question.kind === "was-here");
  if (wasHere) {
    const wrong = wasHere.options.filter((_, i) => i !== wasHere.answerIndex);
    assert.ok(!wrong.includes(repeated));
  }
});

test("a short or empty section gets no card rather than a bad one", () => {
  assert.deepEqual(buildRecallCard("Chapter One.", [ONE]), []);
  assert.deepEqual(buildRecallCard("", [ONE]), []);
});

test("with no other chapters, only the order question is asked", () => {
  const card = buildRecallCard(ONE, []);
  assert.deepEqual(
    card.map((question) => question.kind),
    ["came-first"],
  );
});

test("fragments and walls of text are not options", () => {
  // ("No." is avoided here: the splitter rightly reads it as an abbreviation,
  // as in "No. 5", and joins it to what follows.)
  const text =
    "Yes. Right away. " +
    "This sentence has enough words in it to be a fair option for a reader. " +
    "Then " +
    Array.from({ length: 60 }, () => "word").join(" ") +
    ".";
  const usable = usableSentences(text);
  assert.deepEqual(usable, [
    "This sentence has enough words in it to be a fair option for a reader.",
  ]);
});

test("the verdict is kind whatever happened", () => {
  assert.equal(recallVerdict(2, 2), "Held on to both.");
  assert.match(recallVerdict(1, 2), /still on the page/);
  assert.match(recallVerdict(0, 2), /that happens/);
  assert.equal(recallVerdict(0, 0), "");
});

test("the seed is stable", () => {
  assert.equal(seedOf("abc"), seedOf("abc"));
  assert.notEqual(seedOf("abc"), seedOf("abd"));
});

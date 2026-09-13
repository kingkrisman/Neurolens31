import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BIBLE_BOOKS, BIBLE_PLANS, FEATURED_PASSAGES, findPassage } from "./bible.ts";

describe("bible library", () => {
  it("lists the 66-book canon with chapter counts", () => {
    assert.equal(BIBLE_BOOKS.length, 66);
    assert.equal(BIBLE_BOOKS.filter((book) => book.testament === "OT").length, 39);
    assert.equal(BIBLE_BOOKS.filter((book) => book.testament === "NT").length, 27);
    assert.equal(BIBLE_BOOKS.find((book) => book.name === "Psalms")?.chapters, 150);
    assert.equal(BIBLE_BOOKS.find((book) => book.name === "John")?.chapters, 21);
  });

  it("keeps featured passages and plans aligned", () => {
    assert.ok(BIBLE_PLANS.some((plan) => plan.id === "gospels"));
    for (const plan of BIBLE_PLANS) {
      for (const id of plan.chapters) {
        assert.ok(findPassage(id), `plan ${plan.id} missing ${id}`);
      }
    }
    assert.ok(FEATURED_PASSAGES.some((item) => item.id === "john-3-16"));
  });
});

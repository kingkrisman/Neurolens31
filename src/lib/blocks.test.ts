import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isTitlePage, parseBlocks } from "./blocks.ts";

describe("parseBlocks", () => {
  it("marks the first long paragraph as a lead", () => {
    const blocks = parseBlocks(
      "A Study in Scarlet\n\nIn the year 1878 I took my degree of Doctor of Medicine of the University of London, and proceeded to Netley to go through the course prescribed for surgeons in the army.",
    );
    assert.equal(blocks[0].kind, "title");
    assert.equal(blocks[1].kind, "lead");
  });

  it("groups bullet lists instead of flattening them", () => {
    const blocks = parseBlocks(`Bring the following:

- A quiet lamp
- A softer page
- Room to pause

Then begin.`);
    const list = blocks.find((block) => block.kind === "list");
    assert.ok(list);
    assert.equal(list?.ordered, false);
    assert.equal(list?.items?.length, 3);
    assert.equal(blocks.at(-1)?.kind, "body");
  });

  it("groups numbered steps", () => {
    const blocks = parseBlocks(`1. Open the passage.
2. Mark the landing zone.
3. Read through once without stopping.`);
    assert.equal(blocks[0].kind, "list");
    assert.equal(blocks[0].ordered, true);
    assert.equal(blocks[0].items?.length, 3);
  });

  it("pulls numbered items out of a single PDF blob", () => {
    const blocks = parseBlocks(
      "Start here. 1. Measure the contrast. 2. Check the type size. 3. Confirm the line length before you continue.",
    );
    const list = blocks.find((block) => block.kind === "list");
    assert.equal(list?.items?.length, 3);
    assert.match(list?.items?.[0].text ?? "", /Measure/);
  });

  it("treats a short opening as a title page", () => {
    const blocks = parseBlocks(`PRIDE AND PREJUDICE

A Novel

By Jane Austen

London`);
    assert.equal(isTitlePage(blocks), true);
    assert.equal(blocks[0].kind, "title");
  });

  it("does not treat ordinary prose as a list", () => {
    const blocks = parseBlocks(
      "Dr. Chen measured 3.14 ms of lag in the U.S. lab. The next trial confirmed it.",
    );
    assert.ok(blocks.every((block) => block.kind !== "list"));
  });
});

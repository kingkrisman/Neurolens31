import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { joinPdfPages, splitPdfPages, isPdfPagedContent } from "./pdf-pages.ts";

describe("pdf page markers", () => {
  it("round-trips pages including blank image-only leaves", () => {
    const joined = joinPdfPages(["First page", "", "Third page"]);
    assert.equal(isPdfPagedContent(joined), true);
    assert.deepEqual(splitPdfPages(joined), ["First page", "", "Third page"]);
  });

  it("leaves a single page unsplit", () => {
    assert.deepEqual(splitPdfPages("Only page"), ["Only page"]);
    assert.equal(isPdfPagedContent("Only page"), false);
  });

  it("survives String.trim on an image-only document", () => {
    const joined = joinPdfPages(["", ""]).trim();
    assert.equal(isPdfPagedContent(joined), true);
    assert.equal(splitPdfPages(joined).length, 2);
  });
});

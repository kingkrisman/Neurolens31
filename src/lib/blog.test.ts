import assert from "node:assert/strict";
import { test } from "node:test";
import { readingMinutes, slugify } from "./blog-text.ts";

test("titles become clean web addresses", () => {
  assert.equal(slugify("Reading with ADHD, part 2"), "reading-with-adhd-part-2");
  assert.equal(slugify("  Café & crème: a guide!  "), "cafe-and-creme-a-guide");
  assert.equal(slugify("---"), "");
  assert.match(slugify("x".repeat(200)), /^x{80}$/);
});

test("reading time ignores pictures and never says zero", () => {
  assert.equal(readingMinutes(""), 1);
  assert.equal(readingMinutes("word ".repeat(400)), 2);
  assert.equal(readingMinutes(`![${"alt ".repeat(500)}](https://x.supabase.co/a.png) short`), 1);
});

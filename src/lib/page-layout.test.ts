import assert from "node:assert/strict";
import { test } from "node:test";
import {
  countPages,
  isSinglePageTurn,
  pageReadingAllowanceMs,
  pageMetrics,
  pageLayoutSetting,
  pageOf,
  resolvePageLayout,
  scrollProgress,
  swipeTarget,
} from "./page-layout.ts";

test("everything scrolls unless pages are turned on", () => {
  // Pages shipped as the default for books and were reported as stressful.
  // Nothing turns pages unless a reader asked for it.
  assert.equal(resolvePageLayout(undefined), "scroll");
  assert.equal(resolvePageLayout("scroll"), "scroll");
  assert.equal(resolvePageLayout("pages"), "pages");
});

test("a profile saved while 'auto' was the default reads as scrolling", () => {
  // "auto" was never a choice anyone made — it was the old default.
  assert.equal(pageLayoutSetting("auto"), "scroll");
  assert.equal(pageLayoutSetting(42), "scroll");
});

test("one book's flip wins over the setting, either way", () => {
  assert.equal(resolvePageLayout("scroll", "pages"), "pages");
  assert.equal(resolvePageLayout("pages", "scroll"), "scroll");
});

test("one column plus one gap is exactly one screen, so pages never peek", () => {
  for (const width of [360, 390, 768, 1280, 1920]) {
    const m = pageMetrics(width, 672, 20);
    assert.ok(Math.abs(m.column + m.gap - width) < 1e-9, `width ${width}`);
    assert.equal(m.step, width);
    assert.ok(m.column <= 672);
    assert.ok(m.pad >= 20 - 1e-9);
  }
});

test("a phone gets the full width minus its margins; a desktop keeps a readable measure", () => {
  assert.equal(pageMetrics(390, 672, 20).column, 350);
  assert.equal(pageMetrics(1440, 672, 20).column, 672);
});

test("page counting forgives sub-pixel overflow instead of inventing a blank page", () => {
  assert.equal(countPages(3 * 390 + 0.4, 390), 3);
  assert.equal(countPages(0, 390), 1);
  assert.equal(countPages(1000, 0), 1);
});

test("a line starting exactly on a page boundary belongs to the page it starts", () => {
  assert.equal(pageOf(0, 390), 0);
  assert.equal(pageOf(389, 390), 0);
  assert.equal(pageOf(390, 390), 1);
  assert.equal(pageOf(389.5, 390), 1);
});

test("a short flick turns the page; a small drag springs back", () => {
  assert.equal(swipeTarget(2, -30, 0.8, 390), 3);
  assert.equal(swipeTarget(2, 30, 0.8, 390), 1);
  assert.equal(swipeTarget(2, -30, 0.1, 390), 2);
  assert.equal(swipeTarget(2, -120, 0.1, 390), 3);
  // A tremor with speed but no distance is not a swipe.
  assert.equal(swipeTarget(2, -6, 2, 390), 2);
});

test("turning one page of a short chapter is a step, not a skip", () => {
  // Six pages: one turn moves progress by 0.2 at once, which the tracker's
  // skip rule would otherwise count as skipping ahead.
  assert.equal(isSinglePageTurn(0.2, 0.4, 6), true);
  assert.equal(isSinglePageTurn(0.2, 0.8, 6), false);
  assert.equal(isSinglePageTurn(0, 1, 1), false);
});

test("progress reads across in pages and down when scrolling", () => {
  const base = { scrollTop: 0, scrollHeight: 1000, clientHeight: 500, clientWidth: 400 };
  assert.equal(
    scrollProgress({ ...base, scrollLeft: 800, scrollWidth: 2000, dataset: { layout: "pages" } }),
    0.5,
  );
  assert.equal(
    scrollProgress({ ...base, scrollTop: 250, scrollLeft: 0, scrollWidth: 400, dataset: {} }),
    0.5,
  );
});

test("a page gets the time it should take before stillness counts as a pause", () => {
  // 250 words a page at 200 wpm is 75s; half as much again is 112.5s.
  assert.equal(pageReadingAllowanceMs(2500, 10, 200), 112_500);
  // Never under 15s, even for a title page; never over 4 minutes.
  assert.equal(pageReadingAllowanceMs(10, 1, 220), 15_000);
  assert.equal(pageReadingAllowanceMs(100_000, 1, 100), 240_000);
  // A missing pace falls back to an ordinary one rather than dividing by zero.
  assert.ok(Number.isFinite(pageReadingAllowanceMs(2500, 10, 0)));
});

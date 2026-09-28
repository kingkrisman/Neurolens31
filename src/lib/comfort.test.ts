import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  noteModeSwitch,
  onSettleSuggestion,
  resetComfort,
  SETTLE,
  shouldSuggestSettling,
} from "./comfort.ts";

beforeEach(() => resetComfort());

const MIN = 60_000;

test("two switches are exploring; the third close together earns a suggestion", () => {
  assert.equal(shouldSuggestSettling([0, MIN], MIN), false);
  assert.equal(shouldSuggestSettling([0, MIN, 2 * MIN], 2 * MIN), true);
});

test("switches spread out over a long session do not count together", () => {
  const spread = [0, SETTLE.windowMs + MIN, 2 * SETTLE.windowMs + 2 * MIN];
  assert.equal(shouldSuggestSettling(spread, spread[2]!), false);
});

test("the suggestion is made once per visit, not on every switch after", () => {
  let heard = 0;
  const stop = onSettleSuggestion(() => (heard += 1));
  for (let i = 0; i < 6; i += 1) noteModeSwitch(i * MIN);
  stop();
  assert.equal(heard, 1);
});

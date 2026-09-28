import assert from "node:assert/strict";
import { test } from "node:test";
import { predatesSurvey, SURVEY_REACHED_READERS_AT } from "./launch.ts";

test("accounts from before the survey worked are not new, and are not asked", () => {
  assert.equal(predatesSurvey(Date.parse("2026-09-14T09:00:00Z")), true);
  assert.equal(predatesSurvey(SURVEY_REACHED_READERS_AT - 1), true);
});

test("accounts made since are new, and are asked", () => {
  assert.equal(predatesSurvey(SURVEY_REACHED_READERS_AT), false);
  assert.equal(predatesSurvey(Date.parse("2026-09-28T12:00:00Z")), false);
});

test("an unknown creation time is treated as new rather than guessed at", () => {
  assert.equal(predatesSurvey(undefined), false);
  assert.equal(predatesSurvey(null), false);
  assert.equal(predatesSurvey(Number.NaN), false);
  assert.equal(predatesSurvey(0), false);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeMeta, metaFromLegacyProfile, normalizeMeta, sameMeta } from "./account-meta.ts";

/**
 * The rules that stop the survey coming back.
 *
 * It reappeared on every refresh because a pull replaced the local profile with
 * the server's, and the server's lacked the flag. These tests pin down that a
 * merge can never make an asked account look unasked again.
 */

const avatar = (style: string, at: number) => ({ style, shuffle: 0, background: "", at });

test("being asked is sticky when only this device knows", () => {
  // The exact failure: answered here, pull arrives without it.
  assert.equal(mergeMeta({ onboardedAt: 100 }, {}).onboardedAt, 100);
  assert.equal(mergeMeta({ onboardedAt: 100 }, undefined).onboardedAt, 100);
});

test("being asked is sticky when only the account knows", () => {
  // Signing in on a second device: nothing local yet.
  assert.equal(mergeMeta({}, { onboardedAt: 200 }).onboardedAt, 200);
});

test("when both know, the earlier answer is the one kept", () => {
  assert.equal(mergeMeta({ onboardedAt: 300 }, { onboardedAt: 200 }).onboardedAt, 200);
});

test("absence never wins", () => {
  // A missing value is a copy that has not caught up, not a statement.
  assert.equal(mergeMeta({}, {}).onboardedAt, undefined);
  assert.equal(mergeMeta({ onboardedAt: 100 }, { onboardedAt: undefined }).onboardedAt, 100);
});

test("the newer avatar wins, whichever side has it", () => {
  assert.equal(mergeMeta({ avatar: avatar("new", 20) }, { avatar: avatar("old", 10) }).avatar?.style, "new");
  assert.equal(mergeMeta({ avatar: avatar("old", 10) }, { avatar: avatar("new", 20) }).avatar?.style, "new");
});

test("a pull carrying a stale avatar cannot undo a choice just made", () => {
  // Sync pulls before it pushes, so the server's old face can arrive while the
  // new one is still queued here.
  const justChosen = { avatar: avatar("just-now", Date.now()) };
  const stalePull = { avatar: avatar("last-week", Date.now() - 7 * 86_400_000) };
  assert.equal(mergeMeta(justChosen, stalePull).avatar?.style, "just-now");
});

test("an avatar from before timestamps loses to one with a time", () => {
  const legacy = { avatar: { style: "legacy", shuffle: 0, background: "" } };
  assert.equal(mergeMeta({ avatar: avatar("timed", 5) }, legacy as never).avatar?.style, "timed");
});

test("garbage from storage or the network becomes nothing, not a crash", () => {
  for (const junk of [null, undefined, 7, "x", [], { onboardedAt: "yesterday" }, { onboardedAt: -1 }, { avatar: 3 }]) {
    assert.doesNotThrow(() => normalizeMeta(junk));
    assert.equal(normalizeMeta(junk).onboardedAt, undefined);
  }
  assert.doesNotThrow(() => mergeMeta(normalizeMeta(null), { avatar: { style: "" } } as never));
});

test("an avatar with no style is dropped rather than rendered blank", () => {
  assert.equal(normalizeMeta({ avatar: { style: "", shuffle: 1 } }).avatar, undefined);
});

test("a profile saved the old way gives up its account facts", () => {
  const lifted = metaFromLegacyProfile({
    fontSize: 20,
    onboardedAt: 1_790_000_000_000,
    avatar: { style: "micah", shuffle: 2, background: "e3e3e3" },
  });
  assert.equal(lifted.onboardedAt, 1_790_000_000_000);
  assert.equal(lifted.avatar?.style, "micah");
  assert.equal(lifted.avatar?.shuffle, 2);
});

test("a profile with nothing to lift gives up nothing", () => {
  assert.deepEqual(metaFromLegacyProfile({ fontSize: 20 }), {});
  assert.deepEqual(metaFromLegacyProfile(null), {});
});

test("identical metas compare equal, so a no-op merge writes nothing", () => {
  assert.equal(sameMeta({ onboardedAt: 5 }, { onboardedAt: 5 }), true);
  assert.equal(sameMeta({ onboardedAt: 5 }, { onboardedAt: 6 }), false);
  assert.equal(sameMeta({}, {}), true);
});

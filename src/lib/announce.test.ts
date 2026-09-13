import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { announce, subscribeAnnounce } from "./announce.ts";

describe("announce", () => {
  it("delivers a trimmed message to subscribers", () => {
    const received: string[] = [];
    const stop = subscribeAnnounce((message) => received.push(message));
    announce("  Reading aloud  ");
    announce("");
    announce("   ");
    stop();
    announce("after unsubscribe");
    assert.deepEqual(received, ["Reading aloud"]);
  });
});

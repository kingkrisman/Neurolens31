import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { asArea, buildReport, resetReporting, scrubMessage, scrubStack } from "./errors.ts";

/**
 * These tests are the privacy claim.
 *
 * Everything else in this module is plumbing: if the scrubbing is right, the
 * worst a crash report can do is be unhelpful. If it is wrong, the app quietly
 * uploads what somebody was reading — which is the one thing it promises never
 * to do. So the cases below are mostly hostile messages rather than realistic
 * ones.
 */

/**
 * `analyticsChoice` and `privacySignal` both read globals; give them some.
 *
 * `defineProperty` rather than plain assignment: Node ships a real `navigator`
 * with only a getter, so `globalThis.navigator = {}` throws.
 */
function allowReporting(navigatorStub: Record<string, unknown> = {}) {
  const map = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => void map.set(key, value),
      removeItem: (key: string) => void map.delete(key),
      clear: () => map.clear(),
      key: () => null,
      length: 0,
    },
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    writable: true,
    value: navigatorStub,
  });
  return map;
}

beforeEach(() => {
  resetReporting();
  allowReporting();
});

test("a quoted fragment of a book does not survive", () => {
  const leak = `Unexpected token 'Call me Ishmael. Some years ago' in JSON at position 41`;
  const out = scrubMessage(leak);
  assert.ok(!out.includes("Ishmael"), out);
  assert.equal(out, "Unexpected token <q> in JSON at position <n>");
});

test("double and back quotes are scrubbed too, not just single", () => {
  assert.ok(!scrubMessage(`Cannot parse "a whole paragraph here"`).includes("paragraph"));
  assert.ok(!scrubMessage("Cannot parse `a whole paragraph here`").includes("paragraph"));
});

test("a data URL — an entire inlined file — is removed", () => {
  const out = scrubMessage("Failed to fetch data:application/pdf;base64,JVBERi0xLjQKJ");
  assert.ok(!out.includes("JVBERi"), out);
  assert.equal(out, "Failed to fetch <url>");
});

test("blob and https URLs are removed", () => {
  assert.equal(scrubMessage("open blob:https://x.test/abc-123 failed"), "open <url> failed");
  assert.equal(scrubMessage("GET https://neurolens.space/private/path 404"), "GET <url> <n>");
});

test("an email address cannot ride along in a message", () => {
  const out = scrubMessage("No account for reader.name+tag@example.com found");
  assert.ok(!out.includes("@example.com"), out);
  assert.equal(out, "No account for <email> found");
});

test("numbers go, so one bug is one row rather than one row per offset", () => {
  assert.equal(
    scrubMessage("Invalid array length at index 9471"),
    scrubMessage("Invalid array length at index 22"),
  );
});

test("the useful part of a real error is kept", () => {
  assert.equal(
    scrubMessage("Cannot read properties of undefined (reading 'sessions')"),
    "Cannot read properties of undefined (reading <q>)",
  );
});

test("a message is capped, so a stack pasted into one cannot be a payload", () => {
  assert.ok(scrubMessage("x".repeat(5000)).length <= 300);
});

test("stack frames keep the file name and lose the origin", () => {
  const stack = [
    "Error: boom",
    "    at openBook (https://www.neurolens.space/assets/reader-a1b2c3.js:9:1417)",
    "    at onClick (https://www.neurolens.space/assets/app-d4e5.js:1:88)",
  ].join("\n");
  const out = scrubStack(stack) ?? "";
  assert.ok(!out.includes("neurolens.space"), out);
  assert.ok(out.includes("openBook"));
  assert.ok(!out.includes("Error: boom"), "the message line is not a frame");
});

test("a React component stack is kept, not discarded", () => {
  // React writes `in Name`, not `at Name`. Filtering on `at` alone threw these
  // away entirely — and for a render fault it is the only stack there is.
  const out = scrubStack("\n    in Reader (created by App)\n    in TabErrorBoundary\n") ?? "";
  assert.ok(out.includes("in Reader"), out);
  assert.ok(out.includes("in TabErrorBoundary"), out);
});

test("a stack with no frames reports as absent rather than empty", () => {
  assert.equal(scrubStack("just a sentence"), undefined);
  assert.equal(scrubStack(undefined), undefined);
});

test("an unknown area becomes 'unknown' instead of being trusted", () => {
  assert.equal(asArea("reader"), "reader");
  assert.equal(asArea("insights"), "insights");
  assert.equal(asArea("'; drop table --"), "unknown");
  assert.equal(asArea(undefined), "unknown");
});

test("the same crash is reported once, not once per render", () => {
  const first = buildReport(new Error("boom"), "reader");
  const second = buildReport(new Error("boom"), "reader");
  assert.ok(first);
  assert.equal(second, null);
});

test("the same message in a different area is a different crash", () => {
  assert.ok(buildReport(new Error("boom"), "reader"));
  assert.ok(buildReport(new Error("boom"), "library"));
});

test("a session is capped, so a throwing render loop cannot flood the table", () => {
  for (let i = 0; i < 10; i += 1) {
    assert.ok(buildReport(new Error(`distinct ${String.fromCharCode(97 + i)}`), "reader"));
  }
  assert.equal(buildReport(new Error("one too many z"), "reader"), null);
});

test("nothing is reported when the reader switched analytics off", () => {
  const storage = allowReporting();
  storage.set("neurolens-analytics", "off");
  assert.equal(buildReport(new Error("boom"), "reader"), null);
});

test("nothing is reported when the browser sends Do Not Track", () => {
  allowReporting({ doNotTrack: "1" });
  assert.equal(buildReport(new Error("boom"), "reader"), null);
});

test("nothing is reported when the browser sends Global Privacy Control", () => {
  allowReporting({ globalPrivacyControl: true });
  assert.equal(buildReport(new Error("boom"), "reader"), null);
});

test("not having answered yet still reports — that is where the bugs are", () => {
  allowReporting();
  assert.ok(buildReport(new Error("boom"), "reader"));
});

test("a thrown non-error still produces a report", () => {
  const report = buildReport({ weird: true }, "reader");
  assert.equal(report?.message, "Non-error thrown");
});

test("a thrown string is scrubbed like any other message", () => {
  const report = buildReport("failed on 'a line of the book'", "reader");
  assert.ok(!report?.message.includes("line of the book"));
});

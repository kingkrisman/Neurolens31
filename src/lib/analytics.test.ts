import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => (map.has(key) ? map.get(key)! : null),
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => void map.delete(key),
    setItem: (key, value) => void map.set(key, String(value)),
  };
}

const g = globalThis as unknown as Record<string, unknown>;
g.localStorage = memoryStorage();
g.sessionStorage = memoryStorage();

const {
  sanitize,
  track,
  queuedEvents,
  setAnalyticsEnabled,
  analyticsEnabled,
  bucketCount,
  bucketSize,
  formatOf,
  SCHEMA,
} = await import("./analytics.ts");

beforeEach(() => {
  g.localStorage = memoryStorage();
  g.sessionStorage = memoryStorage();
  // Most tests describe behaviour after someone has said yes.
  (g.localStorage as Storage).setItem("neurolens-analytics", "on");
});

describe("sanitize", () => {
  it("refuses an event that is not in the schema", () => {
    assert.equal(sanitize("book_contents", { text: "anything" }), null);
  });

  it("drops fields the schema does not name", () => {
    const clean = sanitize("highlight_added", { color: "sky", text: "the sentence they marked" });
    assert.deepEqual(clean, { color: "sky" });
  });

  it("drops a value outside the closed list", () => {
    assert.deepEqual(sanitize("file_opened", { format: "Hoax_-_Madeline_Pelling.pdf" }), {});
  });

  it("only accepts real booleans for boolean fields", () => {
    assert.deepEqual(sanitize("file_opened", { skipped_pages: "yes" }), {});
    assert.deepEqual(sanitize("file_opened", { skipped_pages: true }), { skipped_pages: true });
  });

  it("has no field anywhere that accepts free text", () => {
    // The guarantee is structural: every field is a closed list or a boolean.
    for (const [event, fields] of Object.entries(SCHEMA)) {
      for (const [field, rule] of Object.entries(fields as Record<string, unknown>)) {
        assert.ok(rule === "bool" || Array.isArray(rule), `${event}.${field} must be a closed list`);
      }
    }
  });
});

describe("consent", () => {
  it("records nothing until the person opts in", () => {
    (g.localStorage as Storage).removeItem("neurolens-analytics");
    track("tab_view", { tab: "library" });
    assert.equal(queuedEvents().length, 0);
    assert.equal(analyticsEnabled(), false);
  });

  it("records once they say yes", () => {
    (g.localStorage as Storage).removeItem("neurolens-analytics");
    setAnalyticsEnabled(true);
    track("tab_view", { tab: "library" });
    assert.ok(queuedEvents().some((event) => event.e === "tab_view"));
  });
});

describe("track", () => {
  it("records a clean event with an hour-rounded time", () => {
    track("ink_stroke", { tool: "pen", secret: "x" }, Date.UTC(2026, 8, 15, 10, 42, 17));
    const events = queuedEvents().filter((event) => event.e === "ink_stroke");
    assert.equal(events.length, 1);
    assert.deepEqual(events[0]!.p, { tool: "pen" });
    assert.equal(events[0]!.t, Date.UTC(2026, 8, 15, 10, 0, 0));
  });

  it("adds one app_open per session, without being asked", () => {
    track("tab_view", { tab: "library" });
    track("tab_view", { tab: "read" });
    assert.equal(queuedEvents().filter((event) => event.e === "app_open").length, 1);
  });

  it("records nothing when switched off, and forgets what was queued", () => {
    track("tab_view", { tab: "library" });
    setAnalyticsEnabled(false);
    assert.equal(queuedEvents().length, 0);
    track("tab_view", { tab: "read" });
    assert.equal(queuedEvents().length, 0);
    assert.equal(analyticsEnabled(), false);
  });

  it("caps the queue so it can never crowd out a book", () => {
    for (let i = 0; i < 700; i += 1) track("ink_stroke", { tool: "pen" });
    assert.ok(queuedEvents().length <= 500);
  });
});

describe("buckets", () => {
  it("never records an exact count", () => {
    assert.equal(bucketCount(275), "200-999");
    assert.equal(bucketCount(0), "0");
  });

  it("never records an exact size", () => {
    assert.equal(bucketSize(8_318_851), "5-20MB");
  });

  it("reduces a file name to its type alone", () => {
    assert.equal(formatOf("_OceanofPDF.com_Hoax_-_Madeline_Pelling.pdf"), "pdf");
    assert.equal(formatOf("notes.weird"), "other");
  });
});

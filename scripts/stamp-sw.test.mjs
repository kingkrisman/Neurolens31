import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { collectNames, stampSource, swVersionFrom } from "./stamp-sw.mjs";

describe("swVersionFrom", () => {
  it("changes when the build changes", () => {
    // Vite puts a content hash in each name, so a code change renames a bundle.
    const before = swVersionFrom(["assets/index-AAAA.js", "assets/app-BBBB.css"]);
    const after = swVersionFrom(["assets/index-CCCC.js", "assets/app-BBBB.css"]);
    assert.notEqual(before, after);
  });

  it("holds steady when nothing changed", () => {
    // A rebuild that emits the same files must not evict anyone's cache.
    const names = ["assets/index-AAAA.js", "assets/app-BBBB.css"];
    assert.equal(swVersionFrom(names), swVersionFrom([...names]));
  });

  it("does not depend on the order files were listed in", () => {
    // Directory order is not guaranteed; the version must not follow it.
    assert.equal(
      swVersionFrom(["b.js", "a.js", "c.css"]),
      swVersionFrom(["c.css", "a.js", "b.js"]),
    );
  });

  it("is short enough to read in a cache name", () => {
    const version = swVersionFrom(["a.js"]);
    assert.match(version, /^nl-[0-9a-f]{12}$/);
  });
});

describe("stampSource", () => {
  it("replaces the declared version", () => {
    const out = stampSource('const VERSION = "nl-v2";\nconst SHELL = 1;', "nl-abc123");
    assert.equal(out, 'const VERSION = "nl-abc123";\nconst SHELL = 1;');
  });

  it("leaves the rest of the worker alone", () => {
    const source = 'const A = "nl-v2";\nconst VERSION = "nl-v2";\n// nl-v2 in a comment';
    const out = stampSource(source, "nl-xyz");
    assert.ok(out.includes('const A = "nl-v2";'), "an unrelated literal is untouched");
    assert.ok(out.includes("// nl-v2 in a comment"), "a comment is untouched");
    assert.ok(out.includes('const VERSION = "nl-xyz";'));
  });

  it("reports rather than silently passing when the line is gone", () => {
    // A rename upstream must fail the build, not ship an unstamped worker.
    assert.equal(stampSource("const OTHER = 1;", "nl-abc"), null);
  });
});

describe("collectNames", () => {
  const tree = {
    "/out": [
      { name: "sw.js", isDirectory: () => false },
      { name: "index.html", isDirectory: () => false },
      { name: "assets", isDirectory: () => true },
    ],
    "/out/assets": [
      { name: "index-AAAA.js", isDirectory: () => false },
      { name: "app-BBBB.css", isDirectory: () => false },
    ],
  };
  const readdir = (dir) => tree[dir.split("\\").join("/")] ?? [];

  it("walks nested asset directories", () => {
    const names = collectNames("/out", readdir);
    assert.ok(names.includes("assets/index-AAAA.js"));
    assert.ok(names.includes("index.html"));
  });

  it("excludes the worker itself", () => {
    // Including it would make the version depend on its own contents.
    assert.ok(!collectNames("/out", readdir).includes("sw.js"));
  });
});

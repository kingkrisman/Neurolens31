import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { READING_PROFILES } from "./types.ts";
import { exportHtmlDocument, exportPlainText } from "./reading-export.ts";

describe("reading export", () => {
  const profile = { ...READING_PROFILES.dyslexia, bionicStrength: 0.6, theme: "night" as const };

  it("writes settings into the plain-text copy", () => {
    const plain = exportPlainText("Hello world.", profile, 220, "A short page");
    assert.match(plain, /A short page/);
    assert.match(plain, /Night/);
    assert.match(plain, /fixation 60%/);
    assert.match(plain, /plain words on/);
    assert.match(plain, /Hello world/);
  });

  it("keeps bionic marks and settings in the HTML download", () => {
    const html = exportHtmlDocument("Reading becomes easier with practice.", profile, 180, "Practice");
    assert.match(html, /class="fixation"/);
    assert.match(html, /fixation 60%/);
    assert.match(html, /#1a1612/);
    assert.match(html, /Practice/);
  });
});

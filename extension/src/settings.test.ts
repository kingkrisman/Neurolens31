import assert from "node:assert/strict";
import { test } from "node:test";
import { READING_PROFILES } from "../../src/lib/types.ts";
import { DEFAULT_OPTIONS, describeLook, lookFromProfile, patternFor, readOptions, siteOf } from "./settings.ts";

test("every reading mode the app ships comes across unchanged", () => {
  for (const profile of Object.values(READING_PROFILES)) {
    const look = lookFromProfile(profile, profile.name, 1);
    assert.ok(look);
    assert.deepEqual(look, {
      fontFamily: profile.fontFamily,
      fontSize: profile.fontSize,
      lineHeight: profile.lineHeight,
      letterSpacing: profile.letterSpacing,
      wordSpacing: profile.wordSpacing,
      bionicStrength: profile.bionicStrength,
      theme: profile.theme,
      modeName: profile.name,
      at: 1,
    });
  }
});

test("a malformed profile is refused or made safe, never passed through", () => {
  assert.equal(lookFromProfile(null, ""), null);
  assert.equal(lookFromProfile("ADHD", ""), null);
  const look = lookFromProfile(
    { fontFamily: "Papyrus", fontSize: 400, lineHeight: -3, letterSpacing: Number.NaN, theme: "neon", bionicStrength: "max" },
    "x".repeat(200),
  );
  assert.ok(look);
  assert.equal(look.fontFamily, "sans");
  assert.equal(look.fontSize, 32);
  assert.equal(look.lineHeight, 1);
  assert.equal(look.letterSpacing, 0);
  assert.equal(look.bionicStrength, 0);
  assert.equal(look.theme, "paper");
  assert.equal(look.modeName, "");
});

test("options default to everything on and ignore anything that is not a yes or no", () => {
  assert.deepEqual(readOptions(undefined), DEFAULT_OPTIONS);
  assert.deepEqual(readOptions({ bold: false, colours: "no" as unknown as boolean }), { ...DEFAULT_OPTIONS, bold: false });
});

test("a site is its origin, and only ordinary web pages count", () => {
  assert.equal(siteOf("https://www.bbc.co.uk/news/articles/abc?x=1#top"), "https://www.bbc.co.uk");
  assert.equal(siteOf("http://127.0.0.1:4321/article.html"), "http://127.0.0.1:4321");
  for (const url of [
    undefined,
    "",
    "chrome://settings",
    "about:blank",
    "file:///C:/notes.html",
    "chrome-extension://abc/popup.html",
    "https://chromewebstore.google.com/detail/x",
    "https://addons.mozilla.org/en-GB/firefox/",
    "not a url",
  ]) {
    assert.equal(siteOf(url), null, String(url));
  }
});

test("the permission asked for covers the site's host, whatever the port", () => {
  assert.equal(patternFor("https://www.bbc.co.uk"), "https://www.bbc.co.uk/*");
  assert.equal(patternFor("http://127.0.0.1:4321"), "http://127.0.0.1/*");
});

test("the popup line reads as the reader would say it", () => {
  const look = lookFromProfile(READING_PROFILES.dyslexia, "Dyslexia", 1)!;
  assert.match(describeLook(look, "OpenDyslexic", "Cream"), /^Dyslexia · OpenDyslexic \d+ · Cream$/);
});

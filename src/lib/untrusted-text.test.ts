import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, plainTextFromBionic, processBionicText } from "./bionic.ts";
import { decorateWord } from "./word-markup.ts";

/**
 * Text from an uploaded file is attacker-controlled.
 *
 * These payloads are chosen to dodge accidental protection: an ordinary
 * `<img src=x>` happened to be broken by the fixation span landing inside the
 * tag name, which made the renderer look safe while `<img/src=x/…>` — one
 * token, no spaces — passed straight through to innerHTML and ran.
 */
const PAYLOADS = [
  "<img/src=x/onerror=alert(1)>",
  "<svg/onload=alert(1)>",
  "<iframe/src=javascript:alert(1)>",
  "<a/href=javascript:alert(1)>x</a>",
  "</span><img/src=x/onerror=alert(1)>",
  "<script>steal(localStorage)</script>",
  'x" onmouseover="alert(1)',
  "<img src=x onerror=alert(1)>",
];

/** Any real element other than the spans this code writes itself. */
function liveMarkup(html: string): boolean {
  const withoutOwnSpans = html
    .replace(/<span class="fixation">/g, "")
    .replace(/<span class="syl-dot" aria-hidden="true">/g, "")
    .replace(/<\/span>/g, "");
  return /<[a-z!/]/i.test(withoutOwnSpans);
}

describe("untrusted text", () => {
  for (const payload of PAYLOADS) {
    it(`bionic output carries no live markup for ${payload}`, () => {
      for (const strength of [0, 0.3, 0.5, 1]) {
        const html = processBionicText(`Read this ${payload} carefully`, strength);
        assert.equal(liveMarkup(html), false, `strength ${strength}: ${html}`);
      }
    });

    it(`word decoration carries no live markup for ${payload}`, () => {
      const html = decorateWord(payload, { bionic: 0.5, syllables: true, letterGuide: true });
      assert.equal(liveMarkup(html), false, html);
    });
  }

  it("still bolds ordinary words", () => {
    assert.match(processBionicText("reading", 0.5), /<span class="fixation">/);
  });

  it("keeps the text readable after escaping", () => {
    const source = 'Tom & Jerry said "<no>" it\'s fine';
    assert.equal(plainTextFromBionic(processBionicText(source, 0.5)), source);
    assert.equal(plainTextFromBionic(processBionicText(source, 0)), source);
  });

  it("escapes every character that can open or break out of markup", () => {
    assert.equal(escapeHtml(`<>&"'`), "&lt;&gt;&amp;&quot;&#39;");
  });
});

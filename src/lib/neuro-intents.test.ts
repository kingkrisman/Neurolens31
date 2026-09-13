import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { askNeuro } from "./neuro-intents.ts";

describe("askNeuro", () => {
  it("softens the fixation when asked to reduce it", () => {
    const r = askNeuro("reduce the fixation");
    assert.equal(r.action.kind, "adjustBionic");
    assert.ok(r.action.kind === "adjustBionic" && r.action.delta < 0);
  });

  it("separates more from less on the same setting", () => {
    const less = askNeuro("less fixation");
    const more = askNeuro("more fixation");
    assert.ok(less.action.kind === "adjustBionic" && less.action.delta < 0);
    assert.ok(more.action.kind === "adjustBionic" && more.action.delta > 0);
  });

  it("turns fixation off rather than merely lowering it", () => {
    const r = askNeuro("turn off bionic");
    assert.deepEqual(r.action, { kind: "setBionic", value: 0 });
  });

  it("explains a feature without changing anything", () => {
    const r = askNeuro("what is bionic reading");
    assert.equal(r.action.kind, "none");
    assert.match(r.text, /bolds the first part/i);
  });

  it("does not confuse line spacing with type size", () => {
    const spacing = askNeuro("more line spacing");
    const size = askNeuro("bigger text");
    assert.equal(spacing.action.kind, "adjustLineHeight");
    assert.equal(size.action.kind, "adjustFontSize");
  });

  it("reads motion sickness as a request for motion cues", () => {
    for (const phrase of ["the motion makes me dizzy", "this makes me nauseous", "too much movement"]) {
      const r = askNeuro(phrase);
      assert.deepEqual(r.action, { kind: "toggle", setting: "motionCues" }, phrase);
    }
  });

  it("slows the pace when asked", () => {
    const r = askNeuro("read slower");
    assert.ok(r.action.kind === "adjustWpm" && r.action.delta < 0);
  });

  it("prefers the reader panel over the settings tab for 'reading options'", () => {
    assert.deepEqual(askNeuro("open reading options").action, { kind: "openPanel", panel: "options" });
    assert.deepEqual(askNeuro("open settings").action, { kind: "goTab", tab: "settings" });
  });

  it("answers how to highlight with the actual gesture", () => {
    const r = askNeuro("how do I highlight");
    assert.equal(r.action.kind, "none");
    assert.match(r.text, /click the same line again/i);
  });

  it("takes a dismissal", () => {
    assert.deepEqual(askNeuro("go away").action, { kind: "hide" });
  });

  it("says so when it does not understand, instead of guessing", () => {
    const r = askNeuro("what is the capital of France");
    assert.equal(r.unmatched, true);
    assert.equal(r.action.kind, "none");
    assert.match(r.text, /did not follow/i);
  });

  it("handles an empty question without throwing", () => {
    assert.equal(askNeuro("   ").unmatched, true);
  });

  it("is case-insensitive", () => {
    assert.equal(askNeuro("REDUCE THE FIXATION").action.kind, "adjustBionic");
  });
});

describe("askNeuro understands natural phrasing", () => {
  const cases: Array<[string, string]> = [
    ["can you make the bold bit less please", "adjustBionic"],
    ["the words are too small", "adjustFontSize"],
    ["everything feels cramped", "adjustLineHeight"],
    ["this is going too fast for me", "adjustWpm"],
    ["the text looks washed out", "setTheme"],
    ["i feel a bit queasy scrolling this", "toggle"],
    ["could you simplify the wording", "toggle"],
    ["take me to the catalog", "goTab"],
    ["show me my stats", "goTab"],
    ["i keep losing my place", "toggle"],
  ];

  for (const [phrase, kind] of cases) {
    it(`handles “${phrase}”`, () => {
      const r = askNeuro(phrase);
      assert.equal(r.action.kind, kind, `${phrase} -> ${JSON.stringify(r.action)}`);
    });
  }

  it("survives a typo", () => {
    assert.equal(askNeuro("reduce the fixaton").action.kind, "adjustBionic");
    assert.equal(askNeuro("bigger fnot").action.kind, "adjustFontSize");
  });

  it("still refuses what it genuinely cannot do", () => {
    assert.equal(askNeuro("book me a flight to Lagos").unmatched, true);
    assert.equal(askNeuro("what is the capital of France").unmatched, true);
  });
});

describe("askNeuro reads symptoms, not just setting names", () => {
  const cases: Array<[string, string]> = [
    // Colour complaints are contrast complaints. Almost nobody says "contrast".
    ["darker color", "setTheme"],
    ["the colors are too light", "setTheme"],
    ["make the text sharper", "setTheme"],
    ["my eyes hurt", "setTheme"],
    // Spacing, described as a feeling rather than a measurement.
    ["everything is squished", "adjustLineHeight"],
    ["give it room to breathe", "adjustLineHeight"],
    // Losing your place is what the word guide answers.
    ["i keep rereading", "toggle"],
    ["i keep losing my place", "toggle"],
    // Motion, described by what it looks like.
    ["stop the bouncing", "toggle"],
    ["too much motion", "toggle"],
  ];

  for (const [phrase, kind] of cases) {
    it(`understands “${phrase}”`, () => {
      const r = askNeuro(phrase);
      assert.equal(r.action.kind, kind, `${phrase} -> ${JSON.stringify(r.action)}`);
    });
  }
});

describe("askNeuro does not invert the request", () => {
  it("slows down when the reader cannot keep up", () => {
    // The words say "up"; the sentence means down. Reading it word by word is
    // the worst failure available — doing the reverse while looking correct.
    for (const phrase of ["i cant keep up", "i can't keep up", "im falling behind"]) {
      const r = askNeuro(phrase);
      assert.ok(r.action.kind === "adjustWpm" && r.action.delta < 0, phrase);
    }
  });

  it("still speeds up when that is what was asked", () => {
    const r = askNeuro("speed it up");
    assert.ok(r.action.kind === "adjustWpm" && r.action.delta > 0);
  });

  it("reads 'too bright' as wanting a darker scheme", () => {
    const r = askNeuro("too bright");
    assert.ok(r.action.kind === "setTheme" && r.action.value === "night");
  });
});

describe("askNeuro answers questions made entirely of filler", () => {
  it("treats 'what can you do' as a request for help", () => {
    // Every word here is a stop word, so it tokenises to nothing. Answering
    // "ask me something" is a small insult to the most reasonable opening
    // question there is.
    const r = askNeuro("what can you do");
    assert.notEqual(r.unmatched, true);
    assert.match(r.text, /soften|larger|spacing|library/i);
  });

  it("offers guidance for tiredness rather than picking a lever", () => {
    const r = askNeuro("this is exhausting");
    assert.notEqual(r.unmatched, true);
    assert.equal(r.action.kind, "none");
    assert.match(r.text, /larger type|spacing|contrast/i);
  });
});

describe("askNeuro answers questions about words", () => {
  const shapes: Array<[string, string]> = [
    ["hey neuro what does effort mean", "effort"],
    ["what does effort means", "effort"],
    ["define saccade", "saccade"],
    ["meaning of cognition", "cognition"],
    ["what is the meaning of perseverance", "perseverance"],
    ["what is a saccade", "saccade"],
    ["what's the definition of fatigue", "fatigue"],
  ];

  for (const [phrase, word] of shapes) {
    it(`pulls “${word}” out of “${phrase}”`, () => {
      const r = askNeuro(phrase);
      assert.equal(r.action.kind, "define", phrase);
      assert.ok(r.action.kind === "define" && r.action.word === word, `${phrase} -> ${JSON.stringify(r.action)}`);
    });
  }

  it("answers a question about an app word instead of acting on it", () => {
    // The dangerous case: asking what contrast *means* used to raise the
    // contrast, which answers a question nobody asked and changes the page
    // while doing it.
    const r = askNeuro("what does contrast mean");
    assert.equal(r.action.kind, "define");
  });

  it("still treats a command about the same word as a command", () => {
    const r = askNeuro("make the contrast higher");
    assert.equal(r.action.kind, "setTheme");
  });

  it("leaves place names in the app alone", () => {
    assert.equal(askNeuro("open the library").action.kind, "goTab");
  });
});

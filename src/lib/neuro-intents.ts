import { readDirection, scoreTopics, tokenize, type Direction, type Topic } from "./neuro-match.ts";

/**
 * What Neuro can be asked, and what it does about it.
 *
 * Topics are scored rather than pattern-matched, so phrasing, word order,
 * filler and small typos are all tolerated — "can you make the bold bit less
 * please" lands on the same topic as "reduce fixation". The first version of
 * this matched fixed patterns and failed in the annoying way: it worked on the
 * phrasings it was written for and fell over on the first real sentence.
 * `neuro-match` holds the scoring.
 *
 * Matching stays local and deterministic. There is no model behind this and it
 * does not pretend there is: the app reads books on devices that may have no
 * network and keeps reading history on the device, and sending questions about
 * how someone reads to a server would trade both away. The trade is only honest
 * if failure is honest too, so a sentence that clears no topic says it did not
 * understand instead of guessing at the nearest one.
 */

export type NeuroAction =
  | { kind: "none" }
  | { kind: "setBionic"; value: number }
  | { kind: "adjustBionic"; delta: number }
  | { kind: "adjustFontSize"; delta: number }
  | { kind: "adjustLineHeight"; delta: number }
  | { kind: "adjustWpm"; delta: number }
  | { kind: "setTheme"; value: "paper" | "contrast" | "night" | "ink" }
  | { kind: "toggle"; setting: "plainLanguage" | "wordGuide" | "syllables" | "letterGuide" | "motionCues" | "dimChrome" }
  | { kind: "goTab"; tab: "explore" | "read" | "library" | "insights" | "settings" }
  | { kind: "openPanel"; panel: "options" | "find" | "highlights" }
  | { kind: "setMode"; mode: "adaptive" | "default" }
  | { kind: "hide" }
  | { kind: "define"; word: string };

export interface NeuroReply {
  text: string;
  action: NeuroAction;
  /** True when nothing scored high enough, so the caller can offer help. */
  unmatched?: boolean;
}

type TopicId =
  | "fixation" | "size" | "spacing" | "pace" | "contrast" | "theme-dark" | "theme-light"
  | "motion" | "plain" | "guide" | "syllables" | "library" | "insights" | "settings"
  | "options" | "find" | "highlights" | "adaptive" | "help" | "howto-highlight"
  | "howto-read" | "dismiss" | "fatigue";

/**
 * Weights say how strongly a word implies its topic. A word belonging to one
 * feature and nothing else ("fixation", "parallax") can carry the topic alone;
 * a word several features share ("text", "line") only nudges.
 */
/**
 * Weights say how strongly a word implies its topic. A word belonging to one
 * feature and nothing else ("fixation", "parallax") can carry the topic alone;
 * a word several features share ("text", "line") only nudges.
 *
 * Most of this vocabulary is symptoms rather than setting names, because that
 * is how people ask. Almost nobody says "increase the line height" — they say
 * the page feels cramped, or that they keep losing their place. The engine
 * already knows which lever answers which complaint; this is the same mapping,
 * reached through the words someone would actually reach for.
 */
const TOPICS: Topic<TopicId>[] = [
  {
    id: "fixation",
    terms: [["fixation", 3], ["bionic", 3], ["bold", 2.5], ["emphasis", 2], ["heavy", 1.5], ["thick", 1.5]],
  },
  {
    id: "size",
    terms: [
      ["size", 2.5], ["font", 2.5], ["text", 1.5], ["type", 1.5], ["letter", 1.5], ["word", 1.5],
      ["zoom", 2.5], ["big", 2], ["small", 2], ["tiny", 2.5], ["huge", 2], ["blurry", 2.5],
      ["squint", 3], ["magnify", 3],
    ],
    blocks: ["spacing", "leading", "pace", "speed", "wpm", "contrast", "fixation", "bionic", "cramped", "squished"],
  },
  {
    id: "spacing",
    terms: [
      ["spacing", 3], ["leading", 2.5], ["space", 2.5], ["line", 2], ["gap", 2],
      ["cramped", 3], ["crowded", 3], ["squished", 3], ["squashed", 3], ["tight", 2.5],
      ["airy", 2], ["breathe", 2.5], ["room", 2], ["dense", 2],
    ],
    blocks: ["pace", "speed", "wpm", "fixation", "bionic"],
  },
  {
    id: "pace",
    terms: [
      ["pace", 3], ["speed", 3], ["wpm", 3], ["fast", 2.5], ["slow", 2.5], ["quick", 2],
      ["rush", 2.5], ["hurry", 2.5], ["keep", 1.5], ["behind", 2],
    ],
    blocks: ["fixation", "bionic", "spacing", "leading", "font", "size", "contrast"],
  },
  {
    // The single most common way of describing a contrast problem is a comment
    // about colour, not about contrast — "the colours are too light", "make it
    // darker". Those belong here, not on a theme switch.
    id: "contrast",
    terms: [
      ["contrast", 3.5], ["faint", 3], ["washed", 3], ["pale", 3], ["legible", 2],
      ["dull", 2.5], ["colour", 2], ["color", 2], ["grey", 2.5], ["gray", 2.5],
      ["blurry", 1.5], ["strain", 2.5], ["hurt", 2.5], ["eyes", 1.5], ["sharp", 2],
    ],
  },
  {
    id: "theme-dark",
    terms: [["night", 3.5], ["dark", 2], ["black", 2.5], ["bright", 3], ["glare", 3], ["blinding", 3]],
    blocks: ["contrast", "colour", "color"],
  },
  {
    id: "theme-light",
    terms: [["paper", 3.5], ["daylight", 3], ["white", 2.5], ["lighter", 2]],
    blocks: ["contrast", "colour", "color", "bright", "glare"],
  },
  {
    id: "motion",
    terms: [
      ["motion", 3], ["movement", 3], ["parallax", 3.5], ["dizzy", 3.5], ["nausea", 3.5],
      ["nauseous", 3.5], ["sick", 3], ["vertigo", 3.5], ["queasy", 3.5], ["moving", 2.5],
      ["animation", 2.5], ["bouncing", 3], ["jumpy", 3], ["shaking", 3], ["still", 2],
    ],
  },
  {
    id: "plain",
    terms: [["plain", 3], ["simple", 3], ["simplify", 3], ["jargon", 3], ["vocabulary", 2.5], ["complicated", 2.5], ["wordy", 2.5]],
  },
  {
    // Losing your place and rereading are the complaints the word guide answers.
    id: "guide",
    terms: [["guide", 3], ["track", 2.5], ["place", 2.5], ["lost", 3], ["losing", 3], ["reread", 3], ["again", 1.5]],
  },
  { id: "syllables", terms: [["syllable", 4], ["chunk", 2.5]] },
  { id: "library", terms: [["library", 4], ["catalog", 3], ["gutenberg", 3], ["shelf", 2.5], ["browse", 2.5]] },
  { id: "insights", terms: [["insight", 4], ["stats", 3], ["statistics", 3], ["progress", 2.5]] },
  { id: "settings", terms: [["setting", 3], ["preference", 3], ["configure", 2.5]], blocks: ["reading"] },
  { id: "options", terms: [["options", 3], ["controls", 2.5], ["adjust", 2]] },
  { id: "find", terms: [["find", 3], ["search", 3], ["locate", 2.5], ["passage", 2.5]] },
  { id: "highlights", terms: [["highlight", 3], ["marked", 2.5], ["saved", 2]], blocks: ["how"] },
  { id: "adaptive", terms: [["adaptive", 4], ["automatic", 2.5]] },
  { id: "howto-highlight", terms: [["highlight", 2.5], ["mark", 2.5], ["annotate", 2.5]] },
  { id: "howto-read", terms: [["upload", 3], ["paste", 3], ["pdf", 3], ["begin", 2.5]] },
  {
    id: "help",
    terms: [["help", 3.5], ["commands", 3], ["capable", 2.5], ["confused", 2.5], ["stuck", 2.5]],
  },
  {
    id: "dismiss",
    terms: [["away", 2.5], ["hide", 3], ["dismiss", 3], ["leave", 2.5], ["quiet", 2.5], ["yourself", 2.5], ["disappear", 3]],
  },
  {
    // Tiredness is its own complaint, and the honest answer is not a single
    // lever — it is to say what usually helps and let the reader choose.
    id: "fatigue",
    terms: [
      ["exhausting", 3], ["exhausted", 3], ["tired", 3], ["tiring", 3], ["draining", 3],
      ["fatigue", 3.5], ["headache", 3], ["hard", 2.5], ["difficult", 2.5], ["struggling", 3],
      ["struggle", 3], ["overwhelming", 3],
    ],
  },
];

/** Below this, the best guess is not good enough to act on. */
const FLOOR = 1.5;

function resolve(id: TopicId, direction: Direction): NeuroReply {
  const down = direction === "less";
  switch (id) {
    case "fixation":
      if (direction === "off") return { text: "Fixation off — plain type from here.", action: { kind: "setBionic", value: 0 } };
      return down
        ? { text: "Softening the fixation. The bolded lead of each word gets lighter.", action: { kind: "adjustBionic", delta: -0.15 } }
        : { text: "Strengthening the fixation, so more of each word leads in bold.", action: { kind: "adjustBionic", delta: 0.15 } };
    case "size":
      return down
        ? { text: "Making the type a little smaller.", action: { kind: "adjustFontSize", delta: -1 } }
        : { text: "Making the type a little larger.", action: { kind: "adjustFontSize", delta: 1 } };
    case "spacing":
      return down
        ? { text: "Tightening the line spacing.", action: { kind: "adjustLineHeight", delta: -0.1 } }
        : { text: "Opening up the line spacing.", action: { kind: "adjustLineHeight", delta: 0.1 } };
    case "pace":
      return down
        ? { text: "Lowering the target pace.", action: { kind: "adjustWpm", delta: -20 } }
        : { text: "Raising the target pace.", action: { kind: "adjustWpm", delta: 20 } };
    case "contrast":
      return { text: "Switching to the high-contrast scheme.", action: { kind: "setTheme", value: "contrast" } };
    case "theme-dark":
      return { text: "Night scheme on.", action: { kind: "setTheme", value: "night" } };
    case "theme-light":
      return { text: "Back to the paper scheme.", action: { kind: "setTheme", value: "paper" } };
    case "motion":
      return {
        text: "Turning on motion cues: the page stops drifting, and steady markers along the edges give your eyes something fixed to hold on to.",
        action: { kind: "toggle", setting: "motionCues" },
      };
    case "plain":
      return { text: "Plain words on — longer words get simpler stand-ins.", action: { kind: "toggle", setting: "plainLanguage" } };
    case "guide":
      return { text: "Word guide on — the line you are reading stays marked.", action: { kind: "toggle", setting: "wordGuide" } };
    case "syllables":
      return { text: "Syllable breaks on.", action: { kind: "toggle", setting: "syllables" } };
    case "library":
      return { text: "Opening the library.", action: { kind: "goTab", tab: "library" } };
    case "insights":
      return { text: "Here are your insights.", action: { kind: "goTab", tab: "insights" } };
    case "settings":
      return { text: "Opening settings.", action: { kind: "goTab", tab: "settings" } };
    case "options":
      return { text: "Reading options, coming up.", action: { kind: "openPanel", panel: "options" } };
    case "find":
      return { text: "Opening find in book.", action: { kind: "openPanel", panel: "find" } };
    case "highlights":
      return { text: "Here is what you have marked.", action: { kind: "openPanel", panel: "highlights" } };
    case "adaptive":
      return direction === "off"
        ? { text: "Adaptive off. I will stop suggesting changes.", action: { kind: "setMode", mode: "default" } }
        : { text: "Adaptive on. I will watch how this sitting goes and suggest changes.", action: { kind: "setMode", mode: "adaptive" } };
    case "howto-highlight":
      return {
        text: "Click a line once to focus it, then click the same line again to mark it. Marked passages get a marker stroke, and the highlighter button in the reader bar lists them all.",
        action: { kind: "none" },
      };
    case "howto-read":
      return {
        text: "Paste text on the Explore page, upload a PDF, or pick something from the Library. Anything you open lands in the reader.",
        action: { kind: "none" },
      };
    case "dismiss":
      return { text: "I will get out of the way. Bring me back from Settings, or say my name.", action: { kind: "hide" } };
    case "fatigue":
      return {
        text: "Reading tires people for different reasons, so I will not guess. Larger type, more line spacing, and higher contrast are the three that help most — tell me which to try, or say “adaptive” and I will watch this sitting and suggest one.",
        action: { kind: "none" },
      };
    case "help":
    default:
      return {
        text: "Ask me to change how the page reads — softer fixation, larger type, more line spacing, slower pace, higher contrast — or ask how a feature works. I can also take you to the library, your insights, or your highlights.",
        action: { kind: "none" },
      };
  }
}

/**
 * Pull the word out of a definition question.
 *
 * These questions are asked in a handful of shapes — "what does effort mean",
 * "define effort", "meaning of effort", "what is a saccade" — and the target is
 * whatever sits in the slot. Matching the shape rather than scoring the words
 * matters here: the sentence is *about* a word, so scoring it against topic
 * vocabularies would answer the wrong question entirely. "What does contrast
 * mean" is a request for a definition, not a request to raise the contrast.
 */
const DEFINE_SHAPES: RegExp[] = [
  /\bwhat\s+(?:does|do)\s+(?:the\s+word\s+)?["“']?([a-z][a-z'’-]{1,30})["”']?\s+means?\b/i,
  /\bwhat(?:'|’)?s?\s+(?:the\s+)?(?:meaning|definition)\s+of\s+["“']?([a-z][a-z'’-]{1,30})["”']?/i,
  /\b(?:define|definition\s+of|meaning\s+of)\s+["“']?([a-z][a-z'’-]{1,30})["”']?/i,
  /\bwhat\s+is\s+(?:a|an|the)\s+["“']?([a-z][a-z'’-]{1,30})["”']?\s*\??$/i,
];

export function definitionTarget(input: string): string | null {
  const text = input.trim();
  for (const shape of DEFINE_SHAPES) {
    const found = shape.exec(text);
    const word = found?.[1]?.toLowerCase();
    if (word && !RESERVED.has(word)) return word;
  }
  return null;
}

/**
 * Words a definition question should *not* be sent to the dictionary for.
 *
 * Deliberately short. The first version listed every piece of app vocabulary,
 * on the theory that a question about "contrast" was a question about the
 * setting — which meant asking what contrast *means* silently changed the
 * colour scheme instead of answering. The lookup already opens with an
 * on-device glossary written in this app's own terms, so "contrast" and
 * "bionic" get an answer about reading rather than a generic one. Only words
 * that name a place in the app, where a dictionary entry would be irrelevant,
 * are held back.
 */
const RESERVED = new Set(["neuro", "neurolens", "library", "insights", "settings"]);

export function askNeuro(input: string): NeuroReply {
  const raw = input.toLowerCase();
  const tokens = tokenize(input);
  if (!tokens.length) {
    // "what can you do" is made entirely of filler words, so it tokenises to
    // nothing — and answering it with "ask me something" was a small insult to
    // someone who had just asked the most reasonable opening question there is.
    if (/\b(what|who|help|can|do)\b/.test(raw)) return resolve("help", "none");
    return { text: "Ask me to change something about the page, or how a feature works.", action: { kind: "none" }, unmatched: true };
  }

  // Ahead of scoring: a definition question is *about* a word, so scoring its
  // words against feature vocabularies would answer something else.
  const target = definitionTarget(input);
  if (target) {
    return { text: `Looking up “${target}”…`, action: { kind: "define", word: target } };
  }

  const direction = readDirection(tokens, raw);
  const ranked = scoreTopics(tokens, TOPICS);
  const best = ranked[0];

  // "how" is filtered out as filler before scoring, so the question form is
  // read from the raw text — a how-to and the panel that shows the same thing
  // share their strongest word, and only the phrasing separates them.
  const asksHow = /\b(how|explain|what is|what are|works?)\b/.test(raw);
  if (asksHow) {
    if (/\b(highlight|mark|annotat)/.test(raw)) return resolve("howto-highlight", direction);
    if (/\b(fixation|bionic)\b/.test(raw)) {
      return {
        text: "Bionic fixation bolds the first part of each word, so your eye lands in one place per word instead of scanning for it. Reading options, on the left of the reader bar, has the strength slider.",
        action: { kind: "none" },
      };
    }
    if (/\b(read|start|open|book|upload|paste|pdf)\b/.test(raw)) return resolve("howto-read", direction);
  }

  if (!best || best.score < FLOOR) {
    return {
      text: "I did not follow that. Try “soften the fixation”, “larger type”, “more line spacing”, “slower pace”, or “how do I highlight”.",
      action: { kind: "none" },
      unmatched: true,
    };
  }

  return resolve(best.id, direction);
}

export const NEURO_SUGGESTIONS = [
  "Soften the fixation",
  "More line spacing",
  "Larger type",
  "Higher contrast",
  "Motion makes me dizzy",
  "How do I highlight?",
  // Worth advertising: nothing else in the panel suggests it will answer a
  // question about a word rather than about the app.
  "What does saccade mean?",
] as const;

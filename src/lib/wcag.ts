import { type ContrastLevel, isLargeText, textContrastLevel, uiContrastPass } from "./contrast.ts";
import { type CvdKind, hueDistinctionLost, simulatedContrast } from "./color-vision.ts";

/**
 * WCAG 2.2 success criteria that matter on a reading surface.
 * Contrast math (1.4.3 / 1.4.6 / 1.4.11) lives in contrast.ts.
 * 2.2 added 2.4.11, 2.4.12, 2.4.13, 2.5.7, 2.5.8, 3.2.6, 3.3.7, 3.3.8, 3.3.9.
 */
export type WcagLevel = "A" | "AA" | "AAA";
export type CriterionStatus = "pass" | "fail" | "info";

export interface WcagCriterion {
  id: string;
  level: WcagLevel;
  name: string;
  addedIn: "2.0" | "2.1" | "2.2";
  summary: string;
}

export const WCAG_22_READER: WcagCriterion[] = [
  {
    id: "1.3.1",
    level: "A",
    name: "Info and Relationships",
    addedIn: "2.0",
    summary: "Headings, landmarks, lists, and labels carry structure. Screen readers must not have to guess what a region is from visual layout.",
  },
  {
    id: "1.4.1",
    level: "A",
    name: "Use of Color",
    addedIn: "2.0",
    summary: "Color is not the only way to tell things apart. Hue-only emphasis fails when reds and greens collapse.",
  },
  {
    id: "1.4.3",
    level: "AA",
    name: "Contrast (Minimum)",
    addedIn: "2.0",
    summary: "Normal text 4.5:1. Large text (24px, or 18.67px bold) 3:1.",
  },
  {
    id: "1.4.4",
    level: "AA",
    name: "Resize Text",
    addedIn: "2.0",
    summary: "Text can grow to 200% without clipping or losing meaning.",
  },
  {
    id: "1.4.6",
    level: "AAA",
    name: "Contrast (Enhanced)",
    addedIn: "2.0",
    summary: "Normal text 7:1. Large text 4.5:1.",
  },
  {
    id: "1.4.10",
    level: "AA",
    name: "Reflow",
    addedIn: "2.1",
    summary: "At 320 CSS pixels wide, reading does not require horizontal scrolling.",
  },
  {
    id: "1.4.11",
    level: "AA",
    name: "Non-text Contrast",
    addedIn: "2.1",
    summary: "UI controls and meaningful graphics 3:1 against adjacent colors.",
  },
  {
    id: "1.4.12",
    level: "AA",
    name: "Text Spacing",
    addedIn: "2.1",
    summary: "Content still works when line-height is 1.5, letter-spacing 0.12em, word-spacing 0.16em, paragraph 2em.",
  },
  {
    id: "2.1.1",
    level: "A",
    name: "Keyboard",
    addedIn: "2.0",
    summary: "Everything you can do with a pointer is reachable from the keyboard.",
  },
  {
    id: "2.4.1",
    level: "A",
    name: "Bypass Blocks",
    addedIn: "2.0",
    summary: "A skip link jumps past repeating chrome (header, primary nav) to the main region.",
  },
  {
    id: "2.4.3",
    level: "A",
    name: "Focus Order",
    addedIn: "2.0",
    summary: "Tab order follows reading order. Sentences in the reader are not a field of buttons.",
  },
  {
    id: "2.4.6",
    level: "AA",
    name: "Headings and Labels",
    addedIn: "2.0",
    summary: "Each view has a heading. Icon-only controls have an accessible name.",
  },
  {
    id: "2.4.7",
    level: "AA",
    name: "Focus Visible",
    addedIn: "2.0",
    summary: "Keyboard focus has a visible indicator.",
  },
  {
    id: "2.4.11",
    level: "AA",
    name: "Focus Not Obscured (Minimum)",
    addedIn: "2.2",
    summary: "The focused item is at least partly visible — not fully hidden under sticky chrome.",
  },
  {
    id: "2.4.13",
    level: "AAA",
    name: "Focus Appearance",
    addedIn: "2.2",
    summary: "Focus indicator is at least 2 CSS px, 3:1 contrast, and encloses the component (or equivalent area).",
  },
  {
    id: "2.5.7",
    level: "AA",
    name: "Dragging Movements",
    addedIn: "2.2",
    summary: "Anything that uses a drag also has a single-pointer alternative. File drop is paired with Upload.",
  },
  {
    id: "2.5.8",
    level: "AA",
    name: "Target Size (Minimum)",
    addedIn: "2.2",
    summary: "Pointer targets are at least 24×24 CSS pixels, unless spaced or text-only.",
  },
  {
    id: "3.2.6",
    level: "A",
    name: "Consistent Help",
    addedIn: "2.2",
    summary: "Help, if offered, sits in the same relative place across pages.",
  },
  {
    id: "3.3.7",
    level: "A",
    name: "Redundant Entry",
    addedIn: "2.2",
    summary: "Do not ask for the same information twice in a process. NeuroLens has no multi-step forms.",
  },
  {
    id: "3.3.8",
    level: "AA",
    name: "Accessible Authentication (Minimum)",
    addedIn: "2.2",
    summary: "Sign-in cannot require recalling a password from memory. NeuroLens has no accounts.",
  },
  {
    id: "4.1.2",
    level: "A",
    name: "Name, Role, Value",
    addedIn: "2.0",
    summary: "Controls expose a name, a role, and their state (pressed, current page, progress). Bionic markup is hidden from the accessibility tree.",
  },
  {
    id: "4.1.3",
    level: "AA",
    name: "Status Messages",
    addedIn: "2.1",
    summary: "Recommendations, listen, and auto-scroll announce through a live region. Focus does not move.",
  },
];

/** Overrides a page must still survive under SC 1.4.12. */
export const TEXT_SPACING_1_4_12 = {
  lineHeight: 1.5,
  letterSpacingEm: 0.12,
  wordSpacingEm: 0.16,
  paragraphEm: 2,
} as const;

export const TARGET_SIZE_2_5_8_PX = 24;
export const TARGET_SIZE_2_5_5_PX = 44;

export interface TextSpacingReport {
  lineHeight: number;
  letterSpacingEm: number;
  wordSpacingEm: number;
  lineMeets: boolean;
  letterMeets: boolean;
  wordMeets: boolean;
}

export function evaluateTextSpacing(input: {
  lineHeight: number;
  letterSpacing: number;
  wordSpacing: number;
}): TextSpacingReport {
  return {
    lineHeight: input.lineHeight,
    letterSpacingEm: input.letterSpacing,
    wordSpacingEm: input.wordSpacing,
    lineMeets: input.lineHeight >= TEXT_SPACING_1_4_12.lineHeight,
    letterMeets: input.letterSpacing >= TEXT_SPACING_1_4_12.letterSpacingEm,
    wordMeets: input.wordSpacing >= TEXT_SPACING_1_4_12.wordSpacingEm,
  };
}

export interface PairCriterion {
  id: string;
  status: CriterionStatus;
  detail: string;
}

export function evaluatePairCriteria(input: {
  ratio: number;
  fontSizePx: number;
  cvd: CvdKind;
  fg: string;
  bg: string;
}): PairCriterion[] {
  const large = isLargeText(input.fontSizePx);
  const level: ContrastLevel = textContrastLevel(input.ratio, input.fontSizePx);
  const simulated = simulatedContrast(input.fg, input.bg, input.cvd);
  const hueLost = hueDistinctionLost(input.fg, input.bg, input.cvd);

  return [
    {
      id: "1.4.1",
      status: input.cvd === "none" ? "info" : hueLost ? "fail" : "pass",
      detail: hueLost
        ? `Under ${input.cvd} these two colors pull together. Hue was doing the work.`
        : input.cvd === "none"
          ? "Run a color-vision view to see if the pair still holds without hue."
          : `Still separable under ${input.cvd} (${simulated.toFixed(1)}:1 as seen).`,
    },
    {
      id: "1.4.3",
      status: level === "fail" ? "fail" : "pass",
      detail: large
        ? `${input.ratio.toFixed(1)}:1 at ${input.fontSizePx}px (large text, AA is 3:1).`
        : `${input.ratio.toFixed(1)}:1 at ${input.fontSizePx}px (AA is 4.5:1).`,
    },
    {
      id: "1.4.6",
      status: level === "AAA" ? "pass" : "fail",
      detail: large ? `AAA large text needs 4.5:1.` : `AAA normal text needs 7:1.`,
    },
    {
      id: "1.4.11",
      status: uiContrastPass(input.ratio) ? "pass" : "fail",
      detail: `${input.ratio.toFixed(1)}:1 against adjacent paper. Controls need 3:1.`,
    },
  ];
}

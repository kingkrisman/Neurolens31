import type { ReadingMode, ReadingProfile } from "../types.ts";

/**
 * Five questions, asked once, so the first book is not the calibration.
 *
 * The adaptive engine learns how somebody reads — but only by watching them
 * read, which means the first book is spent getting it wrong. This is the
 * shortcut: a handful of things a reader already knows about themselves, asked
 * before they open anything, so the page they meet first is close enough to be
 * worth staying on.
 *
 * ## What this deliberately does not ask
 *
 * Not one question mentions dyslexia, ADHD, or any diagnosis. That is not
 * squeamishness — it is the difference between a preference and a medical
 * record. Under the NDPR and the GDPR a stated condition is special-category
 * data: it needs a separate lawful basis, explicit consent, and it is exactly
 * the sort of thing this app promises not to hold. "I lose my place on the
 * page" gets to the same setting as "I have dyslexia" and is nobody's
 * diagnosis.
 *
 * It also asks nothing in free text. Every answer is one of a fixed list, the
 * same discipline the analytics schema uses, so there is nowhere for a name, a
 * condition or a sentence about somebody's life to be typed in.
 *
 * ## What is stored
 *
 * The answers are not. `profileFromAnswers` turns them into settings, the
 * settings are saved, and the answers are discarded with the component. So the
 * account holds "font size 20, line height 1.9, mask on" — which is what it
 * held before this existed — and never "this reader said words blur".
 */

export type QuestionId = "reading" | "trouble" | "size" | "page" | "pace";

export interface Choice {
  id: string;
  label: string;
  hint?: string;
}

export interface Question {
  id: QuestionId;
  /** Asked in the second person, because it is a question, not a form field. */
  title: string;
  lead?: string;
  /** Several answers allowed. `trouble` is the only one — the rest are a pick. */
  multiple?: boolean;
  choices: Choice[];
}

export const QUESTIONS: Question[] = [
  {
    id: "reading",
    title: "What do you mostly read?",
    lead: "It only decides where we start.",
    choices: [
      { id: "study", label: "Study material", hint: "Papers, textbooks, notes" },
      { id: "work", label: "Work documents", hint: "Reports, specs, email threads" },
      { id: "books", label: "Books", hint: "Novels and long-form" },
      { id: "articles", label: "Articles", hint: "News and shorter pieces" },
      { id: "scripture", label: "Scripture", hint: "Verse by verse" },
    ],
  },
  {
    id: "trouble",
    title: "What makes reading hard?",
    lead: "Pick as many as are true. Or none — you can skip.",
    multiple: true,
    choices: [
      { id: "place", label: "I lose my place", hint: "Skipping lines, or reading one twice" },
      { id: "blur", label: "Letters move or blur", hint: "Words feel unstable on the page" },
      {
        id: "wander",
        label: "My mind wanders off",
        hint: "I finish a page having read none of it",
      },
      { id: "tired", label: "My eyes get tired", hint: "Reading is fine, then it is not" },
      { id: "dense", label: "Long sentences lose me", hint: "I have to go back to the start" },
    ],
  },
  {
    id: "size",
    title: "How big should the words be?",
    choices: [
      { id: "s", label: "Smaller", hint: "More on the page at once" },
      { id: "m", label: "Comfortable" },
      { id: "l", label: "Larger" },
      { id: "xl", label: "Largest", hint: "Fewer words, easier to hold" },
    ],
  },
  {
    id: "page",
    title: "How should the page look?",
    choices: [
      { id: "paper", label: "Paper", hint: "Warm and light" },
      { id: "cream", label: "Cream", hint: "Softer than white" },
      { id: "mist", label: "Cool grey", hint: "Quieter, less yellow" },
      { id: "night", label: "Dark", hint: "Light text on a dark page" },
    ],
  },
  {
    id: "pace",
    title: "How do you like to read?",
    choices: [
      { id: "slow", label: "Slowly", hint: "I take my time and take it in" },
      { id: "steady", label: "Steadily" },
      { id: "quick", label: "Quickly", hint: "I want to get through it" },
    ],
  },
];

/** What a completed survey looks like. Absent keys mean skipped. */
export type Answers = Partial<Record<QuestionId, string[]>>;

export interface SurveyOutcome {
  /** Applied over the mode's preset, not over the reader's current settings. */
  profile: Partial<ReadingProfile>;
  mode: ReadingMode;
  targetWpm: number;
}

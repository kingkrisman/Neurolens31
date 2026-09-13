import { splitSentences as splitAllSentences } from "./sentences.ts";

export type CheckpointKind = "main" | "detail" | "recall";

export interface CheckpointQuestion {
  id: string;
  at: number;
  kind: CheckpointKind;
  prompt: string;
  options: string[];
  answerIndex: number;
}

function splitSentences(text: string): string[] {
  return splitAllSentences(text).filter((sentence) => sentence.split(/\s+/).length >= 6);
}

function clip(sentence: string, max = 140): string {
  if (sentence.length <= max) return sentence;
  return `${sentence.slice(0, max).trim()}…`;
}

function mulberry(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], seed: number): T[] {
  const copy = [...items];
  const rand = mulberry(seed);
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function choice(kind: CheckpointKind, at: number, prompt: string, correct: string, wrong: string[], seed: number): CheckpointQuestion {
  const uniqueWrong = [...new Set(wrong.filter((item) => item && item !== correct))].slice(0, 2);
  const options = shuffle([correct, ...uniqueWrong], seed);
  return {
    id: `${kind}-${at}`,
    at,
    kind,
    prompt,
    options,
    answerIndex: options.indexOf(correct),
  };
}

export function buildCheckpoints(text: string): CheckpointQuestion[] {
  const sentences = splitSentences(text);
  if (sentences.length < 3) return [];

  const first = clip(sentences[0]!);
  const mid = clip(sentences[Math.floor(sentences.length * 0.45)]!);
  const last = clip(sentences[sentences.length - 1]!);
  const extra = sentences.map(clip).filter((item) => item !== first && item !== mid && item !== last);

  const questions = [
    choice(
      "main",
      0.34,
      "Which sentence best captures the opening claim of this passage?",
      first,
      [mid, last, extra[0] ?? "The passage is mainly a list of unrelated facts."],
      text.length + 11,
    ),
    choice(
      "detail",
      0.67,
      "Which of these was actually stated in the passage?",
      mid,
      [first, last, extra[1] ?? extra[0] ?? "None of these ideas appear in the text."],
      text.length + 29,
    ),
    choice(
      "recall",
      0.92,
      "How does this passage land?",
      last,
      [first, mid, extra[2] ?? extra[0] ?? "It ends without a concluding thought."],
      text.length + 47,
    ),
  ];

  return questions.filter((question) => question.answerIndex >= 0 && question.options.length >= 2);
}

export function scoreComprehension(results: boolean[]): number | null {
  if (results.length === 0) return null;
  return results.filter(Boolean).length / results.length;
}

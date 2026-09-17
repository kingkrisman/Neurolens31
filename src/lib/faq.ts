/**
 * The questions the landing page answers, in one place.
 *
 * Shared rather than inlined because these are rendered twice: once as the
 * accordion a visitor reads, and once as FAQ structured data for search
 * results. Those two must say the same thing — a search engine shown an answer
 * that is not on the page treats it as a misrepresentation, and the fix for
 * that is a single source rather than a promise to keep two copies in step.
 */
export const FAQ = [
  {
    question: "Does it watch my eyes?",
    answer:
      "No camera. NeuroLens infers fixations and saccades from which line sits in the reading band, how long it is held, and how the page moves. That log stays in this browser.",
  },
  {
    question: "Who is NeuroLens for?",
    answer:
      "Anyone who finds dense pages tiring — ADHD, dyslexia, cognitive fatigue, or a preference for calmer text.",
  },
  {
    question: "Can I use my own documents?",
    answer:
      "Paste text, or upload a PDF or text file. PDFs open one page at a time, including figures, then you can format the words on that page.",
  },
  {
    question: "How quickly will I see a result?",
    answer:
      "Typical passages open in an adapted view in under 30 seconds. Short text is ready immediately.",
  },
  {
    question: "Is my text used to train a model?",
    answer:
      "Reading preferences and recent sessions stay in your browser. You can clear them from Settings at any time.",
  },
] as const;

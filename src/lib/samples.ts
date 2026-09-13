export const SAMPLE_TEXTS = [
  {
    title: "Academic abstract",
    image: "/images/reading-room.jpg",
    alt: "A sunlit university reading room",
    text: `The phenomenon of cognitive friction in digital reading environments has significant implications for neurodivergent learners. This study investigates how adaptive formatting reduces visual entropy and enhances focus retention in ADHD populations.

When a page presents too many competing cues at once, the reader spends energy on orientation rather than meaning. Dense blocks of even type, low contrast, and a missing sense of place on the line all raise the cost of entry. That cost is not evenly distributed. Readers who already work harder to hold attention, decode letterforms, or recover after a pause pay it more often, and they pay it in shorter sessions.

Adaptive formatting does not rewrite the argument. It changes the conditions under which the argument can be seen. Emphasis on the first letters of a word, slightly more space between lines, and a calmer background are small interventions. In combination they reduce the number of times the eye has to relocate before a sentence becomes available. The hypothesis is straightforward: if visual entropy falls, fixation lasts longer, and the first pass through a difficult paragraph becomes less exhausting.

The present paper reports on a within-subjects design. Participants read matched passages in a conventional layout and in an adapted layout, then answered comprehension items that were written to probe gist rather than trivia. Time on task, backward navigation, and self-reported fatigue were recorded alongside accuracy. We did not assume that faster was better. A reader who finishes quickly but cannot recall the claim has not been helped.

Results are discussed in terms of first-pass fluency rather than speed records. For many participants, the adapted view did not make the prose simpler. It made the prose easier to stay with. That distinction matters for any tool that claims to support attention. A calmer page is not a shorter one. It is a page that asks less of the systems already under load.

Limitations are stated plainly. The sample was small, the passages were academic rather than literary, and the study cannot speak to long-form reading over days. What it can speak to is the first thirty seconds of a hard paragraph — the window in which many readers decide whether to continue. If that window is kinder, more of the argument gets a chance.`,
  },
  {
    title: "Complex documentation",
    image: "/images/hands.jpg",
    alt: "Hands turning a paperback on a walnut table",
    text: `NeuroLens utilizes a recursive word-weighting algorithm to transform static strings into fixation-aware content. By dynamically adjusting the contrast ratio of initial graphemes, we optimize the saccadic rhythm of the human eye.

The pipeline is intentionally local. Text is split into paragraphs, then into sentences, then into tokens. Dr. Chen measured 3.14 ms of lag in the U.S. lab. The next trial confirmed it. Each token receives a weight based on length and a profile-selected strength. The first portion of the token is marked for emphasis; the remainder is left to ordinary weight. Nothing is sent to a remote model. The transformation is a deterministic function of the current profile.

Rhythm optimization is a second pass. After weights are assigned, the renderer can insert a slightly stronger break after commas and clause boundaries so the line has a pulse. This is not decoration. It is a way of giving the eye a place to land when a sentence runs long. Profiles that prefer a quieter page can disable it.

Auto-scroll is paced by a target words-per-minute value. That value is a setting, not a measurement. The application also records how far the reader has actually moved through the document and how much active time has elapsed. Actual pace is computed from those two numbers. The two figures are never mixed. A reader may set a target of 220 and currently be reading at 160; both numbers are shown, both are labeled.

When a reader stops progressing for several seconds, the session records a pause. Tiny pointer noise is ignored. When a reader moves a meaningful distance backward — for example from seventy percent of the page to fifty-five — the session records a reread. These events are the inputs to Adaptive Mode. Adaptive Mode does not silently rewrite the profile. It proposes a change, explains why, and waits.

The recommendation engine is a separate module. It receives metrics and current settings and returns a structured suggestion: which setting, which value, and a reason written in ordinary language. Apply, dismiss, and undo remain in the reader’s hands. Adaptive watches pace, pauses, rereads, and how the page felt. It recommends. It does not quiz.

This documentation is meant to be read in the product it describes. Paste it into the source field, open the reader, and switch to Adaptive. Scroll, pause, and move back through a section. The interface should stay out of the way until it has something useful to say.

Before you start, gather:

- A quieter room
- A calmer page
- Time to pause without apology

1. Paste the passage.
2. Open the reader.
3. Let Adaptive watch one sitting.`,
  },
  {
    title: "Neurological focus",
    image: "/images/nook.jpg",
    alt: "A reader in a sunlit armchair",
    text: `Saccadic movements represent rapid eye relocations between fixations. By anchoring initial phonemes with weighted typography, readers process vocabulary prior to full visual scanning, reducing cognitive fatigue by up to 40%.

A fixation is not a still camera. It is a brief window in which the visual system gathers enough of a word to proceed. Between those windows the eye jumps. If the landing zone is poorly marked, the jump undershoots or overshoots, and the reader pays for a correction. Those corrections are cheap one at a time and expensive in aggregate. Over a chapter they become the difference between finishing and stopping.

Bionic emphasis is one way of marking the landing zone. It does not claim to change how language is understood. It claims to make the next word easier to acquire. Some readers find it immediately helpful. Some find it noisy. The strength is therefore a slider, not a mandate, and it can be turned to zero.

Line height and word spacing work on a different problem: crowding. When letters sit too close, the periphery of one word interferes with the next. Extra space is not an aesthetic preference for every reader, but it is a practical one for many. Adaptive Mode may recommend a modest increase when rereading becomes frequent, because moving backward often is a sign that the line was hard to hold.

A bookmark on the current sentence is one way back in after a pause. Tap a line to mark it. Adaptive Mode may suggest more spacing after several long pauses. It will not rewrite the page on its own.

None of these techniques replace rest, medication, or a quieter room. They are environmental. They sit in the same family as a better lamp. The aim is not to optimize a person. The aim is to stop the page from adding work that was never part of the text.

If you are reading this in NeuroLens, you can feel the difference between profiles in a few lines. Switch to ADHD or Dyslexia, then back to Adaptive. Notice what your eyes do at the start of each sentence. That noticing is the whole product.`,
  },
  {
    title: "Three short chapters",
    image: "/images/feature-books.jpg",
    alt: "Clothbound books on a linen table",
    text: `CHAPTER I.

It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife. However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered the rightful property of some one or other of their daughters.

CHAPTER II.

Mr. Bennet was among the earliest of those who waited on Mr. Bingley. He had always intended to visit him, though to the last always assuring his wife that he should not go; and till the evening after the visit was paid she had no knowledge of it. It was then disclosed in the following manner.

CHAPTER III.

Not all that Mrs. Bennet, however, with the assistance of her five daughters, could ask on the subject, was sufficient to draw from her husband any satisfactory description of Mr. Bingley. They attacked him in various ways—with barefaced questions, ingenious suppositions, and distant surmises—but he eluded the skill of them all.`,
  },
] as const;

export const DEMO_SENTENCE =
  "NeuroLens transforms dense paragraphs into effortless visual rhythms tailored for your brain.";

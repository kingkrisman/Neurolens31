export interface WordSense {
  word: string;
  phonetic: string;
  definition: string;
  partOfSpeech: string;
  audio: string | null;
  example?: string;
  source: "local" | "remote";
}

const cache = new Map<string, WordSense | null>();

/** Compact on-device glossary so tap-to-define still works when the network is quiet. */
const LOCAL: Record<string, Omit<WordSense, "word" | "audio" | "source">> = {
  adaptive: { phonetic: "/əˈdæptɪv/", definition: "Able to change to suit new conditions or needs.", partOfSpeech: "adjective" },
  attention: { phonetic: "/əˈtɛnʃən/", definition: "The act of focusing the mind on something.", partOfSpeech: "noun" },
  bionic: { phonetic: "/baɪˈɒnɪk/", definition: "Here: marking the first letters of a word so the eye can skip the rest.", partOfSpeech: "adjective" },
  cognitive: { phonetic: "/ˈkɒɡnɪtɪv/", definition: "Relating to thinking, knowing, and remembering.", partOfSpeech: "adjective" },
  contrast: { phonetic: "/ˈkɒntrɑːst/", definition: "The difference in brightness or colour that makes type readable.", partOfSpeech: "noun" },
  dyslexia: { phonetic: "/dɪsˈlɛksiə/", definition: "A difference in reading that can make decoding letters slower or less automatic.", partOfSpeech: "noun" },
  entropy: { phonetic: "/ˈɛntrəpi/", definition: "Here: visual disorder on a page that costs attention.", partOfSpeech: "noun" },
  fixation: { phonetic: "/fɪkˈseɪʃən/", definition: "A pause of the eye on a word, or the bolded landing letters that invite that pause.", partOfSpeech: "noun" },
  fluency: { phonetic: "/ˈfluːənsi/", definition: "Ease and continuity in reading without frequent stumbles.", partOfSpeech: "noun" },
  friction: { phonetic: "/ˈfrɪkʃən/", definition: "Resistance. Cognitive friction is extra effort spent on the page instead of the meaning.", partOfSpeech: "noun" },
  grapheme: { phonetic: "/ˈɡræfiːm/", definition: "A letter or letter group that stands for a sound.", partOfSpeech: "noun" },
  hypothesis: { phonetic: "/haɪˈpɒθɪsɪs/", definition: "A proposed explanation waiting to be tested.", partOfSpeech: "noun" },
  neurodivergent: { phonetic: "/ˌnjʊərəʊdaɪˈvɜːdʒənt/", definition: "Having a mind that works differently from what schools and offices treat as typical, including ADHD and dyslexia.", partOfSpeech: "adjective" },
  opendyslexic: { phonetic: "", definition: "A free typeface with heavier bases. Trials have not shown it improves reading speed or accuracy; some readers still prefer the shapes.", partOfSpeech: "noun" },
  paragraph: { phonetic: "/ˈpærəɡrɑːf/", definition: "A block of related sentences.", partOfSpeech: "noun" },
  phenomenon: { phonetic: "/fɪˈnɒmɪnən/", definition: "Something observed that invites explanation.", partOfSpeech: "noun" },
  saccade: { phonetic: "/səˈkɑːd/", definition: "A rapid jump of the eye from one landing point to the next while reading.", partOfSpeech: "noun" },
  saccadic: { phonetic: "/səˈkædɪk/", definition: "Relating to those rapid eye jumps between words.", partOfSpeech: "adjective" },
  syllable: { phonetic: "/ˈsɪləbəl/", definition: "A beat of a word, usually built around a vowel.", partOfSpeech: "noun" },
  typeface: { phonetic: "/ˈtaɪpfeɪs/", definition: "A designed family of letters, such as Lexend or OpenDyslexic.", partOfSpeech: "noun" },
  wcag: { phonetic: "", definition: "Web Content Accessibility Guidelines — the contrast and readability rules used here.", partOfSpeech: "noun" },
  reading: { phonetic: "/ˈriːdɪŋ/", definition: "The act of taking meaning from written words.", partOfSpeech: "noun" },
  reader: { phonetic: "/ˈriːdə/", definition: "A person who reads, or the view that shows a passage.", partOfSpeech: "noun" },
  focus: { phonetic: "/ˈfəʊkəs/", definition: "The point of attention; here, the line or window kept bright on the page.", partOfSpeech: "noun" },
  highlight: { phonetic: "/ˈhaɪlaɪt/", definition: "To mark a line or word so it stands apart from the rest.", partOfSpeech: "verb" },
  bookmark: { phonetic: "/ˈbʊkmɑːk/", definition: "A saved place in a passage so you can return to it.", partOfSpeech: "noun" },
  definition: { phonetic: "/ˌdɛfɪˈnɪʃən/", definition: "A statement of what a word means.", partOfSpeech: "noun" },
  sentence: { phonetic: "/ˈsɛntəns/", definition: "A complete thought, usually ending with a stop, question, or exclamation.", partOfSpeech: "noun" },
  rhythm: { phonetic: "/ˈrɪðəm/", definition: "A pattern of rest and motion — here, where the eye is invited to pause.", partOfSpeech: "noun" },
  contrastive: { phonetic: "", definition: "Marked by contrast; standing apart from what is around it.", partOfSpeech: "adjective" },
  comprehension: { phonetic: "/ˌkɒmprɪˈhɛnʃən/", definition: "Understanding of what has been read, not merely decoding it.", partOfSpeech: "noun" },
  lexend: { phonetic: "", definition: "A sans typeface designed to reduce visual crowding between letters.", partOfSpeech: "noun" },
  atkinson: { phonetic: "", definition: "Atkinson Hyperlegible — a typeface that makes similar letters easier to tell apart.", partOfSpeech: "noun" },
  academic: { phonetic: "/ˌækəˈdɛmɪk/", definition: "Related to study, research, or scholarly writing.", partOfSpeech: "adjective" },
  documentation: { phonetic: "/ˌdɒkjʊmɛnˈteɪʃən/", definition: "Written explanation of how something works.", partOfSpeech: "noun" },
  algorithm: { phonetic: "/ˈælɡərɪðəm/", definition: "A set of steps a program follows to get a result.", partOfSpeech: "noun" },
  environment: { phonetic: "/ɪnˈvaɪrənmənt/", definition: "The conditions around an activity — here, the page and its tools.", partOfSpeech: "noun" },
  significant: { phonetic: "/sɪɡˈnɪfɪkənt/", definition: "Large enough, or important enough, to matter.", partOfSpeech: "adjective" },
  implication: { phonetic: "/ˌɪmplɪˈkeɪʃən/", definition: "A likely consequence or meaning that follows from something.", partOfSpeech: "noun" },
  investigate: { phonetic: "/ɪnˈvɛstɪɡeɪt/", definition: "To look into something carefully in order to understand it.", partOfSpeech: "verb" },
  formatting: { phonetic: "/ˈfɔːmætɪŋ/", definition: "The visual arrangement of type, space, and emphasis on a page.", partOfSpeech: "noun" },
  enhances: { phonetic: "", definition: "Improves or strengthens.", partOfSpeech: "verb" },
  retention: { phonetic: "/rɪˈtɛnʃən/", definition: "The ability to keep something in mind after reading it.", partOfSpeech: "noun" },
  populations: { phonetic: "", definition: "Groups of people considered together.", partOfSpeech: "noun" },
  presents: { phonetic: "", definition: "Shows or offers to view.", partOfSpeech: "verb" },
  competing: { phonetic: "", definition: "Drawing attention in different directions at once.", partOfSpeech: "adjective" },
  orientation: { phonetic: "/ˌɔːriənˈteɪʃən/", definition: "Finding one’s place — where you are on a page or in an argument.", partOfSpeech: "noun" },
  conventional: { phonetic: "/kənˈvɛnʃənəl/", definition: "Following the usual way of doing something.", partOfSpeech: "adjective" },
  participants: { phonetic: "", definition: "People taking part in a study or activity.", partOfSpeech: "noun" },
  limitations: { phonetic: "", definition: "The bounds of what a claim or study can honestly say.", partOfSpeech: "noun" },
};

export function normalizeLookupWord(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z']/g, "");
}

function fromLocal(word: string): WordSense | null {
  const entry = LOCAL[word];
  if (!entry) return null;
  return { word, audio: null, source: "local", ...entry };
}

interface RemoteEntry {
  word?: string;
  phonetic?: string;
  phonetics?: { text?: string; audio?: string }[];
  meanings?: { partOfSpeech?: string; definitions?: { definition?: string; example?: string }[] }[];
}

function senseFromRemote(word: string, data: RemoteEntry[]): WordSense | null {
  const entry = data[0];
  const meaning = entry?.meanings?.[0];
  const definition = meaning?.definitions?.[0];
  if (!definition?.definition) return null;
  return {
    word: entry?.word ?? word,
    phonetic: entry?.phonetic || entry?.phonetics?.find((item) => item.text)?.text || "",
    definition: definition.definition,
    partOfSpeech: meaning?.partOfSpeech ?? "",
    audio: entry?.phonetics?.find((item) => item.audio)?.audio || null,
    example: definition.example,
    source: "remote",
  };
}

function senseFromDatamuse(word: string, rows: { word?: string; defs?: string[] }[]): WordSense | null {
  const row = rows.find((item) => item.defs && item.defs.length > 0) ?? rows[0];
  const raw = row?.defs?.[0];
  if (!raw) return null;
  const split = raw.split("\t");
  const tag = split.length > 1 ? split[0] : "";
  const definition = (split.length > 1 ? split.slice(1).join("\t") : raw).trim();
  if (!definition) return null;
  const part =
    tag === "n" ? "noun" : tag === "v" ? "verb" : tag === "adj" ? "adjective" : tag === "adv" ? "adverb" : tag;
  return {
    word: row?.word ?? word,
    phonetic: "",
    definition,
    partOfSpeech: part,
    audio: null,
    source: "remote",
  };
}

/**
 * @param attempts Retries are worth it for a flaky connection and expensive for
 * a dead one — every extra pass multiplies the wait before a fallback is even
 * tried. Callers racing several sources pass 1.
 */
async function fetchJson(url: string, timeout = 7000, attempts = 2): Promise<unknown | null> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (response.ok) return await response.json();
      if (response.status < 500 && response.status !== 429) return null;
    } catch {
      /* retry once */
    } finally {
      clearTimeout(timer);
    }
    if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 220));
  }
  return null;
}

/**
 * Free Dictionary first, Datamuse as the fallback.
 *
 * The order used to be the other way round, and Datamuse almost always answers,
 * so Free Dictionary was effectively never reached. That matters because the
 * two return different amounts: Free Dictionary carries a phonetic spelling,
 * pronunciation audio and a usage example, and Datamuse carries a bare gloss.
 * The card here renders all three, so with Datamuse winning every race, two
 * thirds of it stayed empty for no reason.
 *
 * The same-origin proxy is tried ahead of the public host so the request works
 * where a strict CSP would block a third-party origin.
 */
/** How long to hold a usable answer back, hoping for the richer one. */
const RICHER_GRACE = 1_200;

/** Whole-lookup deadline. Past this, say so rather than keep spinning. */
const DEADLINE = 5_000;

/**
 * Whether Free Dictionary is answering at all right now.
 *
 * It is unreachable on some networks — blocked, or simply down — and when it is,
 * every single lookup paid the grace period waiting for a reply that was never
 * coming, and every miss paid the full retry budget of both sources stacked.
 * A word with no entry took twelve seconds to report that, which reads as a
 * hang, not an answer.
 *
 * So its health is remembered. Two failures in a row and it stops being waited
 * for; a later success clears the mark, because a network that was down at
 * breakfast may be fine by lunch.
 */
let richerFailures = 0;
const RICHER_GIVE_UP = 2;

/**
 * Ask both dictionaries at once, and prefer the richer answer if it is prompt.
 *
 * The two sources are not equivalent. Free Dictionary returns a phonetic
 * spelling, pronunciation audio and a usage example; Datamuse returns a bare
 * gloss. The card renders all of that, so which one answers changes how much of
 * it is filled in.
 *
 * Trying them in sequence is wrong in both directions, and I had it wrong both
 * ways round before settling here. Datamuse first means it almost always wins
 * and the richer fields stay permanently empty. Free Dictionary first means
 * that when it is slow or unreachable — which happens, and `fetchJson` retries
 * each URL twice — the reader waits ten seconds for a definition Datamuse could
 * have given immediately.
 *
 * So they race. Free Dictionary is given a short grace period to arrive; past
 * that, whatever answered is served. Nobody waits on a source that is having a
 * bad day, and nobody gets a thinner entry than necessary when it is fine.
 */
async function fetchRemote(word: string): Promise<WordSense | null> {
  const richer = (async (): Promise<WordSense | null> => {
    for (const url of [
      // Same-origin proxy first: it works where a strict CSP would block a
      // third-party origin outright.
      `/api/dictionary?q=${encodeURIComponent(word)}`,
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
    ]) {
      const data = await fetchJson(url, 2_500, 1);
      if (!Array.isArray(data)) continue;
      const sense = senseFromRemote(word, data as RemoteEntry[]);
      if (sense) {
        richerFailures = 0;
        return sense;
      }
    }
    richerFailures += 1;
    return null;
  })();

  const plain = (async (): Promise<WordSense | null> => {
    const data = await fetchJson(`https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&md=d&max=5`, 3_000, 1);
    if (!Array.isArray(data)) return null;
    return senseFromDatamuse(word, data as { word?: string; defs?: string[] }[]);
  })();

  // Neither promise rejects, so a failure resolves to null rather than
  // collapsing the race.
  // No point holding an answer back for a source that has stopped replying.
  const grace = richerFailures >= RICHER_GIVE_UP ? 0 : RICHER_GRACE;

  const first = await Promise.race([
    richer,
    plain.then((sense) =>
      sense && grace
        ? new Promise<WordSense | null>((r) => setTimeout(() => r(sense), grace))
        : sense,
    ),
    // A hard stop on the whole lookup. Both sources retry internally, so their
    // worst cases stack into something far longer than anyone will wait.
    new Promise<null>((r) => setTimeout(() => r(null), DEADLINE)),
  ]);
  if (first) return first;

  // Whichever is still running may yet answer, but not past the deadline.
  const settled = await Promise.race([
    Promise.all([richer, plain]).then(([a, c]) => a ?? c),
    new Promise<null>((r) => setTimeout(() => r(null), 1_000)),
  ]);
  return settled;
}

export async function lookupWord(raw: string): Promise<WordSense | null> {
  const word = normalizeLookupWord(raw);
  if (word.length < 2) return null;
  if (cache.has(word)) return cache.get(word) ?? null;
  const local = fromLocal(word);
  if (local) {
    cache.set(word, local);
    return local;
  }
  const remote = await fetchRemote(word);
  if (remote) cache.set(word, remote);
  return remote;
}

export function speakWord(word: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.rate = 0.85;
  window.speechSynthesis.speak(utterance);
}

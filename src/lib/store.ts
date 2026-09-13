import { create } from "zustand";
import {
  measureReadingStrain,
  recommendAdaptations,
  calcCurrentWpm,
  type AdaptiveRecommendation,
  type AdaptiveRule,
  type PauseEvent,
  type RereadEvent,
} from "./adaptive/engine";
import {
  learnFromOutcome,
  learnFromPreference,
  noteApplied,
  type AdaptiveMemory,
} from "./adaptive/memory.ts";
import { PREFERENCE_WEIGHT, readPreference } from "./adaptive/preference.ts";
import type { SkipEvent } from "./reconnect";
import { classifyReading } from "./reading-patterns.ts";
import type { NeuralEvent } from "./neural.ts";
import { applyColorScheme, isThemeId } from "./scheme";
import { resolveRhythmCurve } from "./rhythm";
import { isCvdKind, type CvdKind } from "./color-vision";
import { splitPdfPages } from "./pdf-pages";
import { chapterAtPage, detectChapters, paginateLongText, splitTextChapters } from "./chapters";
import { forgetPdfDocument } from "./pdf-session";
import {
  READING_PROFILES,
  type Bookmark,
  type Highlight,
  type ContentKind,
  type FontId,
  type LockableSetting,
  type ReadingFeel,
  type ReadingMode,
  type ReadingProfile,
  type SavedProfile,
  type Session,
  type TabId,
} from "./types";

const SESSIONS_KEY = "neurolens-sessions";
const ADAPTIVE_MEMORY_KEY = "neurolens-adaptive-memory";
const PROFILE_KEY = "neurolens-profile";
const MODE_KEY = "neurolens-mode";
const TARGET_WPM_KEY = "neurolens-target-wpm";
const LOCKS_KEY = "neurolens-locks";
const SAVED_KEY = "neurolens-saved-profiles";
const BOOKMARKS_KEY = "neurolens-bookmarks";
const HIGHLIGHTS_KEY = "neurolens-highlights";
const CVD_KEY = "neurolens-cvd";
const LOOKUP_MIGRATION = "neurolens-lookup-v2";

export interface ReadingSnapshot {
  progress: number;
  wordCount: number;
  wordsRead: number;
  elapsedActiveMs: number;
  currentWpm: number | null;
  pauses: PauseEvent[];
  rereads: RereadEvent[];
  skips: SkipEvent[];
  pausedAt: number | null;
  startedAt: number | null;
  dwellCount: number;
  dwellMs: number;
  longDwellCount: number;
  forwardSteps: number;
  neuralEvents?: NeuralEvent[];
}

export interface AppliedAdaptiveChange {
  setting: AdaptiveRecommendation["setting"];
  previousValue: number | boolean | string;
  nextValue: number | boolean | string;
}

export interface StartReadingMeta {
  title?: string;
  kind?: ContentKind;
  sourceId?: string;
  pdfPage?: number;
  chapter?: number;
  progress?: number;
}

const EMPTY_READING: ReadingSnapshot = {
  progress: 0,
  wordCount: 0,
  wordsRead: 0,
  elapsedActiveMs: 0,
  currentWpm: null,
  pauses: [],
  rereads: [],
  skips: [],
  pausedAt: null,
  startedAt: null,
  dwellCount: 0,
  dwellMs: 0,
  longDwellCount: 0,
  forwardSteps: 0,
  neuralEvents: [],
};

interface AppState {
  hydrated: boolean;
  tab: TabId;
  direction: number;
  text: string;
  sourceKind: ContentKind;
  sourceId: string | null;
  mode: ReadingMode;
  profile: ReadingProfile;
  sessions: Session[];
  controlsOpen: boolean;
  autoScrolling: boolean;
  targetWpm: number;
  commandOpen: boolean;
  reading: ReadingSnapshot;
  recommendation: AdaptiveRecommendation | null;
  dismissedRules: AdaptiveRule[];
  /** What the engine has learned about which levers help this reader. */
  adaptiveMemory: AdaptiveMemory;
  lastAdaptiveChange: AppliedAdaptiveChange | null;
  lockedSettings: LockableSetting[];
  savedProfiles: SavedProfile[];
  bookmarks: Bookmark[];
  highlights: Record<string, Highlight[]>;
  readingFeel: ReadingFeel | null;
  cvdPreview: CvdKind;
  pdfPage: number;
  pdfPageCount: number;
  chapterIndex: number;
  chapterCount: number;
  /**
   * Where in the open section to place the reader, 0–1; 0 means the top.
   *
   * Separate from `reading.progress`, which looks like the same number but is
   * live telemetry: the tracker rewrites it from scroll within a frame or two
   * of a book opening, so a restore point parked there was reliably zeroed
   * before the reader could use it. This one is written once and consumed once.
   */
  restoreTo: number;
  /**
   * A place in the book something else has asked the reader to go to.
   *
   * The command palette can find a passage but cannot scroll to it — the line
   * only exists inside the reader, and only once its section is rendered. So the
   * request is left here and the reader picks it up on mount, which also means
   * the palette does not need to know whether the reader is even open yet.
   */
  pendingJump: { section: number; lineIdx: number } | null;
  requestJump: (section: number, lineIdx: number) => void;
  clearJump: () => void;
  hydrate: () => void;
  setTab: (tab: TabId) => void;
  startReading: (text: string, meta?: StartReadingMeta) => void;
  setPdfPage: (page: number) => void;
  setChapter: (chapter: number) => void;
  setMode: (mode: ReadingMode) => void;
  setProfile: (profile: ReadingProfile) => void;
  setControlsOpen: (open: boolean) => void;
  setAutoScrolling: (value: boolean) => void;
  setTargetWpm: (value: number) => void;
  setCommandOpen: (open: boolean) => void;
  reportReading: (patch: Partial<ReadingSnapshot>) => void;
  applyRecommendation: () => void;
  dismissRecommendation: () => void;
  undoAdaptiveChange: () => void;
  toggleLock: (setting: LockableSetting) => void;
  applySavedProfile: (saved: SavedProfile) => void;
  saveCurrentProfile: (name: string) => void;
  deleteSavedProfile: (id: string) => void;
  addHighlight: (mark: Omit<Highlight, "at">) => void;
  removeHighlight: (lineIdx: number, section: number, start: number) => void;
  annotateHighlight: (lineIdx: number, section: number, start: number, note: string) => void;
  toggleBookmark: () => void;
  removeBookmark: (id: string) => void;
  submitReadingFeel: (feel: ReadingFeel) => void;
  setCvdPreview: (kind: CvdKind) => void;
  clearData: () => void;
}

const TAB_ORDER: TabId[] = ["explore", "read", "library", "insights", "settings"];

function persistProfile(profile: ReadingProfile, mode: ReadingMode) {
  writeLocal(PROFILE_KEY, JSON.stringify(profile));
  writeLocal(MODE_KEY, mode);
}

const FONT_IDS: FontId[] = [
  "sans",
  "serif",
  "lexend",
  "atkinson",
  "inclusive",
  "andika",
  "opendyslexic",
  "literata",
  "comicneue",
  "sourcesans",
];

function normalizeProfile(profile: ReadingProfile): ReadingProfile {
  const rhythmCurve = resolveRhythmCurve(profile.rhythmCurve, profile.rhythmOptimization);
  return {
    ...profile,
    fontFamily: FONT_IDS.includes(profile.fontFamily) ? profile.fontFamily : "sans",
    theme: isThemeId(profile.theme) ? profile.theme : "paper",
    rhythmCurve,
    rhythmOptimization: rhythmCurve !== "steady",
    syllables: Boolean(profile.syllables),
    letterGuide: Boolean(profile.letterGuide),
    wordGuide: Boolean(profile.wordGuide),
    readingMask: false,
    focusHighlight: false,
    dimChrome: Boolean(profile.dimChrome),
    lookup: profile.lookup !== false,
    attentionFollow: profile.attentionFollow === "pointer" ? "pointer" : "line",
    focusBand: profile.focusBand === 2 || profile.focusBand === 3 ? profile.focusBand : 1,
    plainLanguage: Boolean(profile.plainLanguage),
    motionCues: Boolean(profile.motionCues),
    // Present unless the reader has turned it off, so an existing profile that
    // predates the companion still gets one.
    companion: profile.companion !== false,
  };
}

function persistAndApply(profile: ReadingProfile, mode: ReadingMode) {
  const next = normalizeProfile(profile);
  persistProfile(next, mode);
  applyColorScheme(next.theme);
  return next;
}

function writeLocal(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode or quota */
  }
}

function forgetLocal(keys: string[]) {
  try {
    for (const key of keys) localStorage.removeItem(key);
  } catch {
    /* private mode */
  }
}

/** Roughly the ceiling browsers put on one localStorage origin, minus headroom
 *  for the other keys this app writes. */
const SESSIONS_BUDGET = 3_500_000;

/**
 * Persist history, shedding the oldest entries until it fits.
 *
 * Sessions carry their full text so reading can resume, so a shelf of novels
 * runs into the storage quota. `writeLocal` swallows that failure, which meant
 * the real behaviour was worse than it looked: one oversized history and
 * *nothing* saved after it, newest included. Dropping whole old sessions keeps
 * recent books resumable, and keeps the invariant that a session either
 * restores completely or is not offered at all.
 */
function persistSessions(sessions: Session[]) {
  let kept = sessions;
  let payload = JSON.stringify(kept);
  while (payload.length > SESSIONS_BUDGET && kept.length > 1) {
    kept = kept.slice(0, -1);
    payload = JSON.stringify(kept);
  }
  writeLocal(SESSIONS_KEY, payload);
}

function persistAdaptiveMemory(memory: AdaptiveMemory) {
  writeLocal(ADAPTIVE_MEMORY_KEY, JSON.stringify(memory));
}

function persistTargetWpm(value: number) {
  writeLocal(TARGET_WPM_KEY, String(value));
}

/**
 * Read stored highlights, upgrading the old shape on the way in.
 *
 * Highlights used to be a bare `number[]` of line indices. Those indices are no
 * longer meaningful on their own — they were ambiguous across sections, which
 * is the bug this shape replaces — and the text they referred to was never
 * recorded, so there is nothing to recover them from. They are dropped rather
 * than guessed at: a highlight pointing at the wrong sentence is worse than one
 * that is gone, and silently relocating someone's marks would be its own bug.
 */
function readHighlights(raw: unknown): Record<string, Highlight[]> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, Highlight[]> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue;
    const kept = value
      .filter(
        (item): item is Highlight =>
          Boolean(item) && typeof item === "object" && typeof (item as Highlight).lineIdx === "number",
      )
      // Marks saved before highlighting had an extent covered a whole sentence,
      // so that is exactly what they are restored as: the range they always
      // meant, now written down.
      .map((item) =>
        typeof item.start === "number" && typeof item.end === "number"
          ? item
          : { ...item, start: 0, end: (item.text ?? "").length },
      );
    if (kept.length) out[key] = kept;
  }
  return out;
}

function textKey(text: string) {
  return text.trim().slice(0, 48) || "default";
}

function refreshRecommendation(
  reading: ReadingSnapshot,
  targetWpm: number,
  profile: ReadingProfile,
  mode: ReadingMode,
  dismissedRules: AdaptiveRule[],
  existing: AdaptiveRecommendation | null,
  feel: ReadingFeel | null,
  lockedSettings: LockableSetting[],
  memory: AdaptiveMemory = {},
): AdaptiveRecommendation | null {
  if (mode !== "adaptive") return null;
  if (existing) return existing;
  return recommendAdaptations(
    {
      wordCount: reading.wordCount,
      wordsRead: reading.wordsRead,
      progress: reading.progress,
      elapsedActiveMs: reading.elapsedActiveMs,
      currentWpm: reading.currentWpm,
      targetWpm,
      pauseCount: reading.pauses.length,
      pauses: reading.pauses,
      rereadCount: reading.rereads.length,
      rereads: reading.rereads,
      feel,
    },
    {
      targetWpm,
      lineHeight: profile.lineHeight,
      focusHighlight: profile.focusHighlight,
      theme: profile.theme,
      fontSize: profile.fontSize,
    },
    dismissedRules,
    lockedSettings,
    memory,
  );
}

function withSessionMetrics(sessions: Session[], text: string, reading: ReadingSnapshot, targetWpm: number, section: number): Session[] {
  if (!text) return sessions;
  const idleMs = reading.pausedAt ? Math.max(0, Date.now() - reading.pausedAt) : 0;
  const pattern = classifyReading({
    progress: reading.progress,
    elapsedActiveMs: reading.elapsedActiveMs,
    currentWpm: reading.currentWpm,
    targetWpm,
    pauses: reading.pauses,
    rereads: reading.rereads,
    skips: reading.skips ?? [],
    dwellCount: reading.dwellCount ?? 0,
    dwellMs: reading.dwellMs ?? 0,
    longDwellCount: reading.longDwellCount ?? 0,
    forwardSteps: reading.forwardSteps ?? 0,
    idleMs,
    neuralEvents: reading.neuralEvents ?? [],
  });
  return sessions.map((session) =>
    session.content === text
      ? {
          ...session,
          progress: reading.progress,
          section: section > 0 ? section : undefined,
          currentWpm: reading.currentWpm,
          pauseCount: reading.pauses.length,
          rereadCount: reading.rereads.length,
          elapsedMs: reading.elapsedActiveMs,
          pattern: pattern.gathering ? session.pattern : pattern.id,
        }
      : session,
  );
}

function previousFor(setting: AdaptiveRecommendation["setting"], profile: ReadingProfile, targetWpm: number) {
  if (setting === "targetWpm") return targetWpm;
  if (setting === "lineHeight") return profile.lineHeight;
  if (setting === "theme") return profile.theme;
  if (setting === "fontSize") return profile.fontSize;
  return profile.focusHighlight;
}

export const useAppStore = create<AppState>((set, get) => ({
  hydrated: false,
  tab: "explore",
  direction: 0,
  text: "",
  sourceKind: "text",
  sourceId: null,
  mode: "default",
  profile: READING_PROFILES.default,
  sessions: [],
  controlsOpen: false,
  autoScrolling: false,
  targetWpm: 220,
  commandOpen: false,
  reading: EMPTY_READING,
  recommendation: null,
  dismissedRules: [],
  adaptiveMemory: {},
  pendingJump: null,
  lastAdaptiveChange: null,
  lockedSettings: [],
  savedProfiles: [],
  bookmarks: [],
  highlights: {},
  readingFeel: null,
  cvdPreview: "none",
  pdfPage: 0,
  pdfPageCount: 0,
  chapterIndex: 0,
  chapterCount: 0,
  restoreTo: 0,

  hydrate: () => {
    if (get().hydrated || typeof window === "undefined") return;
    try {
      const sessions = JSON.parse(localStorage.getItem(SESSIONS_KEY) || "[]") as Session[];
      const adaptiveMemory = JSON.parse(
        localStorage.getItem(ADAPTIVE_MEMORY_KEY) || "{}",
      ) as AdaptiveMemory;
      const savedProfile = localStorage.getItem(PROFILE_KEY);
      const savedMode = (localStorage.getItem(MODE_KEY) as ReadingMode | null) ?? "default";
      const mode = READING_PROFILES[savedMode] ? savedMode : "default";
      const profile = normalizeProfile(
        savedProfile
          ? ({ ...READING_PROFILES[mode], ...JSON.parse(savedProfile) } as ReadingProfile)
          : READING_PROFILES[mode],
      );
      const savedWpm = Number(localStorage.getItem(TARGET_WPM_KEY));
      const savedCvd = localStorage.getItem(CVD_KEY);
      const cvdPreview = isCvdKind(savedCvd) ? savedCvd : "none";
      applyColorScheme(profile.theme, cvdPreview);
      const lockedSettings = JSON.parse(localStorage.getItem(LOCKS_KEY) || "[]") as LockableSetting[];
      const savedProfiles = JSON.parse(localStorage.getItem(SAVED_KEY) || "[]") as SavedProfile[];
      const bookmarks = JSON.parse(localStorage.getItem(BOOKMARKS_KEY) || "[]") as Bookmark[];
      const highlights = JSON.parse(localStorage.getItem(HIGHLIGHTS_KEY) || "{}") as Record<string, number[]>;
      if (!localStorage.getItem(LOOKUP_MIGRATION)) {
        profile.lookup = true;
        localStorage.setItem(LOOKUP_MIGRATION, "1");
        persistProfile(profile, mode);
      }
      set({
        sessions: Array.isArray(sessions) ? sessions : [],
        adaptiveMemory:
          adaptiveMemory && typeof adaptiveMemory === "object" ? adaptiveMemory : {},
        profile,
        mode,
        targetWpm: Number.isFinite(savedWpm) && savedWpm >= 120 ? savedWpm : 220,
        lockedSettings: Array.isArray(lockedSettings) ? lockedSettings : [],
        savedProfiles: Array.isArray(savedProfiles) ? savedProfiles : [],
        bookmarks: Array.isArray(bookmarks) ? bookmarks : [],
        highlights: readHighlights(highlights),
        cvdPreview,
        hydrated: true,
      });
    } catch {
      set({ hydrated: true });
    }
  },

  requestJump: (section, lineIdx) => set({ pendingJump: { section, lineIdx } }),
  clearJump: () => set({ pendingJump: null }),

  setTab: (tab) => {
    const current = get().tab;
    if (tab === "read" && !get().text) return;
    const direction = TAB_ORDER.indexOf(tab) >= TAB_ORDER.indexOf(current) ? 1 : -1;
    set({ tab, direction, autoScrolling: false, controlsOpen: tab === "read" ? get().controlsOpen : false });
  },

  startReading: (raw, meta) => {
    const kind = meta?.kind ?? "text";
    const pages = kind === "pdf" ? splitPdfPages(raw) : [];
    const text = kind === "pdf" ? raw : raw.trim();
    if (kind !== "pdf" && !text) return;
    try {
      localStorage.setItem("neurolens-started", "1");
    } catch {
      /* private mode */
    }
    if (kind === "pdf") {
      if (!pages.length) return;
    } else {
      forgetPdfDocument();
    }
    const title = meta?.title || text.split(/\n/).find((line) => line.trim())?.slice(0, 60) || "Untitled reading";
    const sessions = [
      { title, content: text, openedAt: Date.now(), progress: 0, kind, sourceId: meta?.sourceId },
      ...get().sessions.filter(
        (session) => session.content.length !== text.length || session.content !== text,
      ),
    ].slice(0, 12);
    persistSessions(sessions);
    const pdfChapters = kind === "pdf" ? detectChapters(pages) : [];
    // Same fallback the reader uses: a long book whose headings the parser
    // cannot see still gets divided, rather than arriving as one document that
    // lays out in a single pass. Both sides must agree or `chapterCount` says
    // zero while the reader is showing parts.
    const declaredChapters = kind === "text" ? splitTextChapters(text) : [];
    const textChapters =
      kind === "text" && declaredChapters.length === 0
        ? paginateLongText(text)
        : declaredChapters;
    const chapterCount = kind === "pdf" ? pdfChapters.length : textChapters.length > 1 ? textChapters.length : 0;
    const initialPage =
      kind === "pdf" ? Math.min(pages.length, Math.max(1, meta?.pdfPage ?? 1)) : 0;
    const chapterIndex =
      chapterCount > 1
        ? kind === "pdf"
          ? chapterAtPage(pdfChapters, initialPage)
          : Math.min(chapterCount, Math.max(1, meta?.chapter ?? 1))
        : 0;
    const current = get().tab;
    set({
      text,
      sourceKind: kind,
      sourceId: meta?.sourceId ?? null,
      sessions,
      tab: "read",
      direction: TAB_ORDER.indexOf("read") >= TAB_ORDER.indexOf(current) ? 1 : -1,
      autoScrolling: false,
      pdfPage: initialPage,
      pdfPageCount: kind === "pdf" ? pages.length : 0,
      chapterIndex,
      chapterCount,
      // Only an explicit resume asks for a position inside a section; opening a
      // book any other way starts at the top of it.
      restoreTo:
        typeof meta?.progress === "number" && Number.isFinite(meta.progress)
          ? Math.min(1, Math.max(0, meta.progress))
          : 0,
      reading: {
        ...EMPTY_READING,
        startedAt: Date.now(),
        progress:
          typeof meta?.progress === "number" && Number.isFinite(meta.progress)
            ? Math.min(1, Math.max(0, meta.progress))
            : kind === "pdf" && pages.length
              ? initialPage / pages.length
              : chapterCount
                ? chapterIndex / chapterCount
                : 0,
      },
      recommendation: null,
      dismissedRules: [],
      lastAdaptiveChange: null,
      readingFeel: null,
    });
  },

  setPdfPage: (page) => {
    const count = get().pdfPageCount;
    if (count < 1) return;
    const next = Math.min(count, Math.max(1, Math.round(page)));
    const reading = get().reading;
    const chapters = detectChapters(splitPdfPages(get().text));
    set({
      pdfPage: next,
      autoScrolling: false,
      chapterIndex: chapters.length > 1 ? chapterAtPage(chapters, next) : get().chapterIndex,
      chapterCount: chapters.length > 1 ? chapters.length : 0,
      reading: { ...reading, progress: next / count },
    });
  },

  setChapter: (chapter) => {
    const state = get();
    if (state.chapterCount < 1) return;
    const next = Math.min(state.chapterCount, Math.max(1, Math.round(chapter)));
    if (state.sourceKind === "pdf") {
      const chapters = detectChapters(splitPdfPages(state.text));
      const start = chapters[next - 1]?.startPage ?? state.pdfPage;
      const reading = state.reading;
      set({
        chapterIndex: next,
        pdfPage: start,
        autoScrolling: false,
        reading: { ...reading, progress: state.pdfPageCount ? start / state.pdfPageCount : next / state.chapterCount },
      });
      return;
    }
    const reading = state.reading;
    set({
      chapterIndex: next,
      autoScrolling: false,
      reading: { ...reading, progress: next / state.chapterCount },
    });
  },

  setMode: (mode) => {
    try {
      const base = READING_PROFILES[mode];
      if (!base) return;
      const current = get().profile;
      const next = persistAndApply(
        { ...base, theme: current.theme, align: current.align },
        mode,
      );
      const state = get();
      set({
        mode,
        profile: next,
        recommendation:
          mode === "adaptive"
            ? refreshRecommendation(
                state.reading,
                state.targetWpm,
                next,
                mode,
                state.dismissedRules,
                null,
                state.readingFeel,
                state.lockedSettings,
              )
            : null,
      });
    } catch (error) {
      console.error(error);
    }
  },

  setProfile: (profile) => {
    try {
      const before = get().profile;
      const next = persistAndApply(profile, get().mode);

      /**
       * A hand-made change is evidence, so the engine hears about it.
       *
       * This is the strongest signal the app has and it used to be discarded:
       * the engine learned only from the outcomes of its own suggestions, while
       * a reader reaching over and softening the fixation themselves — a direct
       * statement of preference — told it nothing at all.
       *
       * Direction decides the sign. Someone repeatedly *lowering* a setting is
       * saying the engine's instinct to raise it is wrong for them, and reading
       * only "they touched this lever" would take that as encouragement.
       */
      const stated = readPreference(before, next);
      let adaptiveMemory = get().adaptiveMemory;
      if (stated) {
        const agrees = stated.direction === "up";
        adaptiveMemory = learnFromPreference(
          adaptiveMemory,
          stated.rule,
          agrees ? PREFERENCE_WEIGHT.agrees : PREFERENCE_WEIGHT.disagrees,
        );
        persistAdaptiveMemory(adaptiveMemory);
      }

      set({ profile: next, adaptiveMemory });
    } catch (error) {
      console.error(error);
    }
  },

  setControlsOpen: (controlsOpen) => set({ controlsOpen }),
  setAutoScrolling: (autoScrolling) => set({ autoScrolling }),
  setTargetWpm: (targetWpm) => {
    persistTargetWpm(targetWpm);
    set({ targetWpm });
  },
  setCommandOpen: (commandOpen) => set({ commandOpen }),

  reportReading: (patch) => {
    const state = get();
    const reading: ReadingSnapshot = {
      ...state.reading,
      ...patch,
      pauses: patch.pauses ?? state.reading.pauses,
      rereads: patch.rereads ?? state.reading.rereads,
      skips: patch.skips ?? state.reading.skips ?? [],
      pausedAt: patch.pausedAt !== undefined ? patch.pausedAt : state.reading.pausedAt,
      startedAt: state.reading.startedAt ?? Date.now(),
      dwellCount: patch.dwellCount ?? state.reading.dwellCount ?? 0,
      dwellMs: patch.dwellMs ?? state.reading.dwellMs ?? 0,
      longDwellCount: patch.longDwellCount ?? state.reading.longDwellCount ?? 0,
      forwardSteps: patch.forwardSteps ?? state.reading.forwardSteps ?? 0,
      neuralEvents: patch.neuralEvents ?? state.reading.neuralEvents ?? [],
    };
    reading.currentWpm = calcCurrentWpm(reading.wordsRead, reading.elapsedActiveMs);
    const prev = state.reading;
    const sameProgress = Math.abs(reading.progress - prev.progress) < 0.0025;
    const sameWpm = reading.currentWpm === prev.currentWpm;
    const samePauses = reading.pauses.length === prev.pauses.length;
    const sameRereads = reading.rereads.length === prev.rereads.length;
    const sameSkips = reading.skips.length === (prev.skips?.length ?? 0);
    const samePaused = reading.pausedAt === prev.pausedAt;
    const sameWords = reading.wordsRead === prev.wordsRead;
    const sameDwell =
      reading.dwellCount === (prev.dwellCount ?? 0) &&
      reading.longDwellCount === (prev.longDwellCount ?? 0) &&
      reading.forwardSteps === (prev.forwardSteps ?? 0);
    const sameNeural = (reading.neuralEvents?.length ?? 0) === (prev.neuralEvents?.length ?? 0);
    if (sameProgress && sameWpm && samePauses && sameRereads && sameSkips && samePaused && sameWords && sameDwell && sameNeural) return;
    // A PDF is divided by page and a text by part, and the two are counted
    // separately — pass whichever one this book is actually using.
    const section = state.pdfPageCount > 1 ? state.pdfPage : state.chapterCount > 1 ? state.chapterIndex : 0;
    const sessions = withSessionMetrics(state.sessions, state.text, reading, state.targetWpm, section);

    // Close the loop before choosing again: score any change already made
    // against how reading has gone since, so a lever that did not help this
    // reader loses ground to the alternatives.
    const strain = measureReadingStrain({
      wordCount: reading.wordCount,
      wordsRead: reading.wordsRead,
      progress: reading.progress,
      elapsedActiveMs: reading.elapsedActiveMs,
      currentWpm: reading.currentWpm,
      targetWpm: state.targetWpm,
      pauseCount: reading.pauses.length,
      pauses: reading.pauses,
      rereadCount: reading.rereads.length,
      rereads: reading.rereads,
      feel: state.readingFeel,
    });
    const adaptiveMemory = learnFromOutcome(state.adaptiveMemory, strain.peak, reading.wordsRead);

    const recommendation = refreshRecommendation(
      reading,
      state.targetWpm,
      state.profile,
      state.mode,
      state.dismissedRules,
      state.recommendation,
      state.readingFeel,
      state.lockedSettings,
      adaptiveMemory,
    );
    set({ reading, sessions, recommendation, adaptiveMemory });
    if (adaptiveMemory !== state.adaptiveMemory) persistAdaptiveMemory(adaptiveMemory);
    // Length first: this runs on every progress tick, and comparing a 1MB
    // book against a dozen stored books character-by-character is the kind of
    // cost that only shows up once someone has actually used the app a while.
    const existing = state.sessions.find(
      (session) =>
        session.content.length === state.text.length && session.content === state.text,
    );
    const shouldPersist =
      !existing ||
      Math.abs((existing.progress ?? 0) - reading.progress) >= 0.05 ||
      (existing.pauseCount ?? 0) !== reading.pauses.length ||
      (existing.rereadCount ?? 0) !== reading.rereads.length;
    if (shouldPersist) persistSessions(sessions);
  },

  applyRecommendation: () => {
    const { recommendation, profile, targetWpm, lockedSettings } = get();
    if (!recommendation) return;
    if (lockedSettings.includes(recommendation.setting as LockableSetting)) {
      set({
        recommendation: null,
        dismissedRules: [...get().dismissedRules, recommendation.rule],
      });
      return;
    }
    const previousValue = previousFor(recommendation.setting, profile, targetWpm);
    if (recommendation.setting === "targetWpm" && typeof recommendation.recommendedValue === "number") {
      persistTargetWpm(recommendation.recommendedValue);
      set({ targetWpm: recommendation.recommendedValue });
    } else if (recommendation.setting === "lineHeight" && typeof recommendation.recommendedValue === "number") {
      const next = persistAndApply({ ...profile, lineHeight: recommendation.recommendedValue }, get().mode);
      set({ profile: next });
    } else if (recommendation.setting === "fontSize" && typeof recommendation.recommendedValue === "number") {
      const next = persistAndApply({ ...profile, fontSize: recommendation.recommendedValue }, get().mode);
      set({ profile: next });
    } else if (recommendation.setting === "focusHighlight" && typeof recommendation.recommendedValue === "boolean") {
      const next = persistAndApply({ ...profile, focusHighlight: recommendation.recommendedValue }, get().mode);
      set({ profile: next });
    } else if (recommendation.setting === "theme" && typeof recommendation.recommendedValue === "string" && isThemeId(recommendation.recommendedValue)) {
      const next = persistAndApply({ ...profile, theme: recommendation.recommendedValue }, get().mode);
      set({ profile: next });
    }
    // Remember the strain this lever was reaching for, so its effect can be
    // judged once the reader has had a few hundred words to feel it.
    const reading = get().reading;
    const strain = measureReadingStrain({
      wordCount: reading.wordCount,
      wordsRead: reading.wordsRead,
      progress: reading.progress,
      elapsedActiveMs: reading.elapsedActiveMs,
      currentWpm: reading.currentWpm,
      targetWpm: get().targetWpm,
      pauseCount: reading.pauses.length,
      pauses: reading.pauses,
      rereadCount: reading.rereads.length,
      rereads: reading.rereads,
      feel: get().readingFeel,
    });
    const adaptiveMemory = noteApplied(
      get().adaptiveMemory,
      recommendation.rule,
      strain.peak,
      reading.wordsRead,
    );
    persistAdaptiveMemory(adaptiveMemory);

    set({
      recommendation: null,
      adaptiveMemory,
      dismissedRules: [...get().dismissedRules, recommendation.rule],
      lastAdaptiveChange: {
        setting: recommendation.setting,
        previousValue,
        nextValue: recommendation.recommendedValue,
      },
    });
  },

  dismissRecommendation: () => {
    const { recommendation, dismissedRules } = get();
    if (!recommendation) return;
    set({
      recommendation: null,
      dismissedRules: [...dismissedRules, recommendation.rule],
    });
  },

  undoAdaptiveChange: () => {
    const change = get().lastAdaptiveChange;
    if (!change) return;
    const profile = get().profile;
    if (change.setting === "targetWpm" && typeof change.previousValue === "number") {
      persistTargetWpm(change.previousValue);
      set({ targetWpm: change.previousValue, lastAdaptiveChange: null });
      return;
    }
    if (change.setting === "lineHeight" && typeof change.previousValue === "number") {
      const next = persistAndApply({ ...profile, lineHeight: change.previousValue }, get().mode);
      set({ profile: next, lastAdaptiveChange: null });
      return;
    }
    if (change.setting === "fontSize" && typeof change.previousValue === "number") {
      const next = persistAndApply({ ...profile, fontSize: change.previousValue }, get().mode);
      set({ profile: next, lastAdaptiveChange: null });
      return;
    }
    if (change.setting === "focusHighlight" && typeof change.previousValue === "boolean") {
      const next = persistAndApply({ ...profile, focusHighlight: change.previousValue }, get().mode);
      set({ profile: next, lastAdaptiveChange: null });
      return;
    }
    if (change.setting === "theme" && typeof change.previousValue === "string" && isThemeId(change.previousValue)) {
      const next = persistAndApply({ ...profile, theme: change.previousValue }, get().mode);
      set({ profile: next, lastAdaptiveChange: null });
    }
  },

  toggleLock: (setting) => {
    const locked = get().lockedSettings;
    const next = locked.includes(setting) ? locked.filter((item) => item !== setting) : [...locked, setting];
    writeLocal(LOCKS_KEY, JSON.stringify(next));
    set({ lockedSettings: next });
  },

  applySavedProfile: (saved) => {
    try {
      const profile = persistAndApply(saved.profile, get().mode);
      persistTargetWpm(saved.targetWpm);
      set({ profile, targetWpm: saved.targetWpm });
    } catch (error) {
      console.error(error);
    }
  },

  saveCurrentProfile: (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const saved: SavedProfile = {
      id: `user-${Date.now()}`,
      name: trimmed,
      profile: get().profile,
      targetWpm: get().targetWpm,
    };
    const savedProfiles = [saved, ...get().savedProfiles].slice(0, 8);
    writeLocal(SAVED_KEY, JSON.stringify(savedProfiles));
    set({ savedProfiles });
  },

  deleteSavedProfile: (id) => {
    const savedProfiles = get().savedProfiles.filter((item) => item.id !== id);
    writeLocal(SAVED_KEY, JSON.stringify(savedProfiles));
    set({ savedProfiles });
  },

  /**
   * Mark a run of text.
   *
   * Overlapping marks are merged rather than stacked. Two highlights covering
   * the same words would draw the stroke twice — visibly darker where they meet
   * — and leave the reader with two entries in the list for one passage they
   * marked once, sometimes by dragging over the edge of an earlier one.
   */
  addHighlight: (mark) => {
    const key = textKey(get().text);
    const current = get().highlights[key] ?? [];

    const sameLine = (item: Highlight) =>
      item.lineIdx === mark.lineIdx && item.section === mark.section;
    const overlaps = (item: Highlight) =>
      sameLine(item) && item.start < mark.end && mark.start < item.end;

    const touching = current.filter(overlaps);
    const start = Math.min(mark.start, ...touching.map((item) => item.start));
    const end = Math.max(mark.end, ...touching.map((item) => item.end));
    // A note written against any of the merged marks is kept: it was a thought
    // about this passage, and the passage is still here.
    const note = touching.find((item) => item.note)?.note;

    const merged: Highlight = {
      lineIdx: mark.lineIdx,
      section: mark.section,
      start,
      end,
      text: mark.text.slice(0, 400),
      note,
      at: Date.now(),
    };

    const nextForKey = [...current.filter((item) => !overlaps(item)), merged];
    const highlights = { ...get().highlights, [key]: nextForKey };
    writeLocal(HIGHLIGHTS_KEY, JSON.stringify(highlights));
    set({ highlights });
  },

  removeHighlight: (lineIdx, section, start) => {
    const key = textKey(get().text);
    const current = get().highlights[key] ?? [];
    const nextForKey = current.filter(
      (item) => !(item.lineIdx === lineIdx && item.section === section && item.start === start),
    );
    if (nextForKey.length === current.length) return;
    const highlights = { ...get().highlights, [key]: nextForKey };
    writeLocal(HIGHLIGHTS_KEY, JSON.stringify(highlights));
    set({ highlights });
  },

  annotateHighlight: (lineIdx, section, start, note) => {
    const key = textKey(get().text);
    const current = get().highlights[key];
    if (!current) return;
    const highlights = {
      ...get().highlights,
      [key]: current.map((item) =>
        item.lineIdx === lineIdx && item.section === section && item.start === start
          ? { ...item, note: note.trim() ? note.trim().slice(0, 600) : undefined }
          : item,
      ),
    };
    writeLocal(HIGHLIGHTS_KEY, JSON.stringify(highlights));
    set({ highlights });
  },

  toggleBookmark: () => {
    const { text, reading, bookmarks, sourceKind, sourceId, pdfPage, chapterIndex, sessions } = get();
    if (!text) return;
    const match = (item: Bookmark) =>
      sourceId ? item.sourceId === sourceId : item.content === text;
    const existing = bookmarks.find(match);
    const title =
      sessions[0]?.title ||
      text.split(/\n/).find((line) => line.trim())?.slice(0, 60) ||
      "Bookmark";
    const start = Math.max(0, Math.floor(reading.progress * Math.max(0, text.length - 90)));
    const excerpt = text.replace(/\s+/g, " ").slice(start, start + 90).trim();
    const next = existing
      ? bookmarks.filter((item) => item.id !== existing.id)
      : [
          {
            id: `bm-${Date.now()}`,
            title,
            content: text,
            progress: reading.progress,
            savedAt: Date.now(),
            kind: sourceKind,
            sourceId: sourceId ?? undefined,
            pdfPage: sourceKind === "pdf" ? pdfPage : undefined,
            chapter: chapterIndex > 0 ? chapterIndex : undefined,
            excerpt,
          },
          ...bookmarks,
        ].slice(0, 24);
    writeLocal(BOOKMARKS_KEY, JSON.stringify(next));
    set({ bookmarks: next });
  },

  removeBookmark: (id) => {
    const next = get().bookmarks.filter((item) => item.id !== id);
    writeLocal(BOOKMARKS_KEY, JSON.stringify(next));
    set({ bookmarks: next });
  },

  submitReadingFeel: (feel) => {
    const state = get();
    const recommendation = refreshRecommendation(
      state.reading,
      state.targetWpm,
      state.profile,
      state.mode,
      state.dismissedRules,
      null,
      feel,
      state.lockedSettings,
    );
    set({ readingFeel: feel, recommendation });
  },

  setCvdPreview: (kind) => {
    writeLocal(CVD_KEY, kind);
    applyColorScheme(get().profile.theme, kind);
    set({ cvdPreview: kind });
  },

  clearData: () => {
    forgetLocal([
      SESSIONS_KEY,
      PROFILE_KEY,
      MODE_KEY,
      TARGET_WPM_KEY,
      LOCKS_KEY,
      SAVED_KEY,
      BOOKMARKS_KEY,
      HIGHLIGHTS_KEY,
      CVD_KEY,
      ADAPTIVE_MEMORY_KEY,
      "neurolens-coach",
      "neurolens-started",
      "neurolens-pointer-hint",
    ]);
    if (typeof document !== "undefined") delete document.documentElement.dataset.started;
    forgetPdfDocument();
    set({
      sessions: [],
      profile: READING_PROFILES.default,
      mode: "default",
      text: "",
      tab: "explore",
      autoScrolling: false,
      targetWpm: 220,
      reading: EMPTY_READING,
      recommendation: null,
      dismissedRules: [],
      adaptiveMemory: {},
      lastAdaptiveChange: null,
      lockedSettings: [],
      savedProfiles: [],
      bookmarks: [],
      highlights: {},
      pdfPage: 0,
      pdfPageCount: 0,
      chapterIndex: 0,
      chapterCount: 0,
      readingFeel: null,
      cvdPreview: "none",
      sourceKind: "text",
      sourceId: null,
    });
    applyColorScheme("paper", "none");
  },
}));

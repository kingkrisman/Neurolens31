import { create } from "zustand";
import { scopedKey } from "@/lib/storage-scope";
import * as sync from "@/lib/sync/notify";
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
import { fitSessions } from "./session-storage.ts";
import { track } from "./analytics.ts";
import { normalizeProfile } from "./profile-normalize.ts";

/** Settings whose changes are counted — by name only, never by value. */
const TRACKED_SETTINGS = [
  "fontFamily",
  "fontSize",
  "lineHeight",
  "letterSpacing",
  "wordSpacing",
  "theme",
  "tint",
  "align",
  "bionicStrength",
  "readingMask",
  "wordGuide",
  "syllables",
  "letterGuide",
  "plainLanguage",
  "focusHighlight",
  "rhythmOptimization",
] as const;

/**
 * When each setting was last counted.
 *
 * A slider fires setProfile on every step of a drag, and one adjustment is one
 * decision — without this a single drag of the size slider would be recorded
 * forty times and drown out every other signal.
 */
const lastSettingEvent = new Map<string, number>();
import { DEFAULT_HIGHLIGHT_COLOR, colorById, type HighlightColorId } from "./highlight-colors.ts";
import {
  inkColorById,
  strokeId,
  toolById,
  trimStrokes,
  type InkStroke,
  type InkToolId,
} from "./ink.ts";
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
const MARKER_KEY = "neurolens-marker-color";
const INK_KEY = "neurolens-ink";
const INK_TOOL_KEY = "neurolens-ink-tool";
const INK_COLOR_KEY = "neurolens-ink-color";
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
  /** The marker new highlights are made with, remembered between sessions. */
  markerColor: HighlightColorId;
  /** Freehand strokes, keyed by book the way highlights are. */
  ink: Record<string, InkStroke[]>;
  inkTool: InkToolId;
  inkColor: string;
  /**
   * Whether a mouse or finger draws instead of selecting.
   *
   * A stylus never needs this — a pen that touches the page is drawing, the
   * way it is on paper. This is for everyone reading without one, where the
   * same drag has to mean either select or draw and only a mode can say which.
   */
  inkMode: boolean;
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
  /**
   * Re-read everything for whoever is signed in now.
   *
   * `hydrate` runs once and refuses to run again, which is right for a page
   * load and wrong for an account change: the store would keep showing the
   * previous reader's library. This drops what is in memory and reads the new
   * account's keys instead.
   */
  rehydrateForAccount: () => void;
  /**
   * Merge what an account holds into this device.
   *
   * The one way the sync engine writes to the store. A single action rather
   * than a dozen setters because a pull is one event — a half-applied account,
   * where the books arrived and the highlights did not, would render marks
   * against the wrong text.
   */
  applyAccountData: (data: {
    sessions: Session[];
    highlights: Record<string, Highlight[]>;
    ink: Record<string, InkStroke[]>;
    bookmarks: Bookmark[];
    settings?: {
      profile?: ReadingProfile;
      mode?: string;
      targetWpm?: number;
      lockedSettings?: string[];
      savedProfiles?: SavedProfile[];
      adaptiveMemory?: Record<string, unknown>;
    };
  }) => void;
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
  setMarkerColor: (color: HighlightColorId) => void;
  recolorHighlight: (
    lineIdx: number,
    section: number,
    start: number,
    color: HighlightColorId,
  ) => void;
  addStroke: (stroke: Omit<InkStroke, "id" | "at">) => void;
  eraseStrokes: (ids: string[]) => void;
  undoStroke: (section: number) => void;
  clearInk: (section: number) => void;
  setInkTool: (tool: InkToolId) => void;
  setInkColor: (color: string) => void;
  setInkMode: (on: boolean) => void;
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
  // The reading profile is the most personal thing here — how somebody has
  // learned to read comfortably — so it follows the account, not the device.
  sync.settingsChanged();
}

/** Persist without queueing, for data that has just come from the account. */
function persistProfileQuietly(profile: ReadingProfile, mode: ReadingMode) {
  writeLocal(PROFILE_KEY, JSON.stringify(profile));
  writeLocal(MODE_KEY, mode);
}

function persistAndApply(profile: ReadingProfile, mode: ReadingMode) {
  const next = normalizeProfile(profile);
  persistProfile(next, mode);
  applyColorScheme(next.theme);
  return next;
}

function writeLocal(key: string, value: string) {
  tryWriteLocal(key, value);
}

/** A write that reports whether the browser actually took it. */
function tryWriteLocal(key: string, value: string): boolean {
  try {
    localStorage.setItem(scopedKey(key), value);
    return true;
  } catch {
    /* private mode or quota */
    return false;
  }
}

function forgetLocal(keys: string[]) {
  try {
    for (const key of keys) localStorage.removeItem(scopedKey(key));
  } catch {
    /* private mode */
  }
}

/**
 * Write the library to this device.
 *
 * Deliberately does not queue anything. It is called on every progress save and
 * by the pull that applies an account's own data, so queueing here meant
 * O(books) storage writes per save and — worse — sent the whole library back to
 * the server immediately after receiving it. The two call sites that represent
 * a real edit queue the one book that changed instead.
 */
function persistSessions(sessions: Session[]) {
  fitSessions(sessions, (payload) => tryWriteLocal(SESSIONS_KEY, payload));
}

function persistAdaptiveMemory(memory: AdaptiveMemory) {
  writeLocal(ADAPTIVE_MEMORY_KEY, JSON.stringify(memory));
  sync.settingsChanged();
}

function persistTargetWpm(value: number) {
  writeLocal(TARGET_WPM_KEY, String(value));
  sync.settingsChanged();
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
          Boolean(item) &&
          typeof item === "object" &&
          typeof (item as Highlight).lineIdx === "number",
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

function withSessionMetrics(
  sessions: Session[],
  text: string,
  reading: ReadingSnapshot,
  targetWpm: number,
  section: number,
): Session[] {
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

function previousFor(
  setting: AdaptiveRecommendation["setting"],
  profile: ReadingProfile,
  targetWpm: number,
) {
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
  markerColor: DEFAULT_HIGHLIGHT_COLOR,
  ink: {},
  inkTool: "pen",
  inkColor: "graphite",
  inkMode: false,
  readingFeel: null,
  cvdPreview: "none",
  pdfPage: 0,
  pdfPageCount: 0,
  chapterIndex: 0,
  chapterCount: 0,
  restoreTo: 0,

  applyAccountData: (data) => {
    // Persisted as well as set: the device has to keep working offline after
    // this, and state that only lives in memory is gone on the next reload.
    persistSessions(data.sessions);
    writeLocal(HIGHLIGHTS_KEY, JSON.stringify(data.highlights));
    writeLocal(INK_KEY, JSON.stringify(data.ink));
    writeLocal(BOOKMARKS_KEY, JSON.stringify(data.bookmarks));

    const patch: Partial<AppState> = {
      sessions: data.sessions,
      highlights: data.highlights,
      ink: data.ink,
      bookmarks: data.bookmarks,
    };

    // Settings are applied field by field, because the account may hold fewer
    // of them than this device does — a row written by an older build must not
    // blank a setting it never knew about.
    const settings = data.settings;
    if (settings) {
      if (settings.profile) {
        const mode = (settings.mode as ReadingMode) ?? get().mode;
        const profile = normalizeProfile(settings.profile);
        // Quietly: this came from the account, and echoing it back would be a
        // write per pull, forever.
        persistProfileQuietly(profile, mode);
        applyColorScheme(profile.theme);
        patch.profile = profile;
        patch.mode = mode;
      }
      if (typeof settings.targetWpm === "number") {
        persistTargetWpm(settings.targetWpm);
        patch.targetWpm = settings.targetWpm;
      }
      if (settings.lockedSettings) {
        writeLocal(LOCKS_KEY, JSON.stringify(settings.lockedSettings));
        patch.lockedSettings = settings.lockedSettings as LockableSetting[];
      }
      if (settings.savedProfiles) {
        writeLocal(SAVED_KEY, JSON.stringify(settings.savedProfiles));
        patch.savedProfiles = settings.savedProfiles;
      }
      if (settings.adaptiveMemory) {
        const memory = settings.adaptiveMemory as AdaptiveMemory;
        persistAdaptiveMemory(memory);
        patch.adaptiveMemory = memory;
      }
    }

    set(patch);
  },

  rehydrateForAccount: () => {
    // Cleared first, so nothing of the previous reader's survives into the new
    // account even if a key is missing from their storage and hydrate leaves
    // that field untouched.
    set({
      hydrated: false,
      sessions: [],
      highlights: {},
      ink: {},
      bookmarks: [],
      text: "",
      sourceKind: "text",
      sourceId: null,
      // Away from the reader as well. Clearing the text while the reader is
      // still open leaves it mounted over nothing — a page reading "0 words"
      // and waiting — so the new account arrives at their library instead.
      tab: "explore",
      autoScrolling: false,
      controlsOpen: false,
    });
    get().hydrate();
  },

  hydrate: () => {
    if (get().hydrated || typeof window === "undefined") return;
    try {
      const sessions = JSON.parse(
        localStorage.getItem(scopedKey(SESSIONS_KEY)) || "[]",
      ) as Session[];
      const adaptiveMemory = JSON.parse(
        localStorage.getItem(scopedKey(ADAPTIVE_MEMORY_KEY)) || "{}",
      ) as AdaptiveMemory;
      const savedProfile = localStorage.getItem(scopedKey(PROFILE_KEY));
      const savedMode =
        (localStorage.getItem(scopedKey(MODE_KEY)) as ReadingMode | null) ?? "default";
      const mode = READING_PROFILES[savedMode] ? savedMode : "default";
      const profile = normalizeProfile(
        savedProfile
          ? ({ ...READING_PROFILES[mode], ...JSON.parse(savedProfile) } as ReadingProfile)
          : READING_PROFILES[mode],
      );
      const savedWpm = Number(localStorage.getItem(scopedKey(TARGET_WPM_KEY)));
      const savedCvd = localStorage.getItem(scopedKey(CVD_KEY));
      const cvdPreview = isCvdKind(savedCvd) ? savedCvd : "none";
      applyColorScheme(profile.theme, cvdPreview);
      const lockedSettings = JSON.parse(
        localStorage.getItem(scopedKey(LOCKS_KEY)) || "[]",
      ) as LockableSetting[];
      const savedProfiles = JSON.parse(
        localStorage.getItem(scopedKey(SAVED_KEY)) || "[]",
      ) as SavedProfile[];
      const bookmarks = JSON.parse(
        localStorage.getItem(scopedKey(BOOKMARKS_KEY)) || "[]",
      ) as Bookmark[];
      const highlights = JSON.parse(
        localStorage.getItem(scopedKey(HIGHLIGHTS_KEY)) || "{}",
      ) as Record<string, number[]>;
      // colorById settles an unknown or absent value, so a palette that changes
      // later cannot strand someone on a colour that no longer exists.
      const markerColor = colorById(localStorage.getItem(scopedKey(MARKER_KEY)) ?? undefined).id;
      const ink = JSON.parse(localStorage.getItem(scopedKey(INK_KEY)) || "{}") as Record<
        string,
        InkStroke[]
      >;
      const inkTool = toolById(localStorage.getItem(scopedKey(INK_TOOL_KEY)) ?? undefined).id;
      const inkColor = inkColorById(localStorage.getItem(scopedKey(INK_COLOR_KEY)) ?? undefined).id;
      if (!localStorage.getItem(LOOKUP_MIGRATION)) {
        profile.lookup = true;
        localStorage.setItem(LOOKUP_MIGRATION, "1");
        persistProfileQuietly(profile, mode);
      }
      set({
        sessions: Array.isArray(sessions) ? sessions : [],
        adaptiveMemory: adaptiveMemory && typeof adaptiveMemory === "object" ? adaptiveMemory : {},
        profile,
        mode,
        targetWpm: Number.isFinite(savedWpm) && savedWpm >= 120 ? savedWpm : 220,
        lockedSettings: Array.isArray(lockedSettings) ? lockedSettings : [],
        savedProfiles: Array.isArray(savedProfiles) ? savedProfiles : [],
        bookmarks: Array.isArray(bookmarks) ? bookmarks : [],
        highlights: readHighlights(highlights),
        markerColor,
        ink: ink && typeof ink === "object" ? ink : {},
        inkTool,
        inkColor,
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
    set({
      tab,
      direction,
      autoScrolling: false,
      controlsOpen: tab === "read" ? get().controlsOpen : false,
    });
    if (tab !== current) track("tab_view", { tab });
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
    const title =
      meta?.title ||
      text
        .split(/\n/)
        .find((line) => line.trim())
        ?.slice(0, 60) ||
      "Untitled reading";
    const sessions = [
      { title, content: text, openedAt: Date.now(), progress: 0, kind, sourceId: meta?.sourceId },
      ...get().sessions.filter(
        (session) => session.content.length !== text.length || session.content !== text,
      ),
    ].slice(0, 12);
    persistSessions(sessions);
    // A book being opened is the edit worth sending, and only this book.
    if (text.trim()) sync.bookChanged(textKey(text));
    const pdfChapters = kind === "pdf" ? detectChapters(pages) : [];
    // Same fallback the reader uses: a long book whose headings the parser
    // cannot see still gets divided, rather than arriving as one document that
    // lays out in a single pass. Both sides must agree or `chapterCount` says
    // zero while the reader is showing parts.
    const declaredChapters = kind === "text" ? splitTextChapters(text) : [];
    const textChapters =
      kind === "text" && declaredChapters.length === 0 ? paginateLongText(text) : declaredChapters;
    const chapterCount =
      kind === "pdf" ? pdfChapters.length : textChapters.length > 1 ? textChapters.length : 0;
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
        reading: {
          ...reading,
          progress: state.pdfPageCount ? start / state.pdfPageCount : next / state.chapterCount,
        },
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
      const next = persistAndApply({ ...base, theme: current.theme, align: current.align }, mode);
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

      const now = Date.now();
      const was = before as unknown as Record<string, unknown>;
      const is = profile as unknown as Record<string, unknown>;
      for (const key of TRACKED_SETTINGS) {
        if (was[key] === is[key]) continue;
        if (now - (lastSettingEvent.get(key) ?? 0) < 10_000) continue;
        lastSettingEvent.set(key, now);
        track("setting_changed", { setting: key });
      }

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
    if (
      sameProgress &&
      sameWpm &&
      samePauses &&
      sameRereads &&
      sameSkips &&
      samePaused &&
      sameWords &&
      sameDwell &&
      sameNeural
    )
      return;
    // A PDF is divided by page and a text by part, and the two are counted
    // separately — pass whichever one this book is actually using.
    const section =
      state.pdfPageCount > 1 ? state.pdfPage : state.chapterCount > 1 ? state.chapterIndex : 0;
    const sessions = withSessionMetrics(
      state.sessions,
      state.text,
      reading,
      state.targetWpm,
      section,
    );

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
      (session) => session.content.length === state.text.length && session.content === state.text,
    );
    const shouldPersist =
      !existing ||
      Math.abs((existing.progress ?? 0) - reading.progress) >= 0.05 ||
      (existing.pauseCount ?? 0) !== reading.pauses.length ||
      (existing.rereadCount ?? 0) !== reading.rereads.length;
    if (shouldPersist) {
      persistSessions(sessions);
      // Position, not the whole book: this fires as somebody reads.
      const open = get().text;
      if (open.trim()) sync.progressChanged(textKey(open));
    }
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
    if (
      recommendation.setting === "targetWpm" &&
      typeof recommendation.recommendedValue === "number"
    ) {
      persistTargetWpm(recommendation.recommendedValue);
      set({ targetWpm: recommendation.recommendedValue });
    } else if (
      recommendation.setting === "lineHeight" &&
      typeof recommendation.recommendedValue === "number"
    ) {
      const next = persistAndApply(
        { ...profile, lineHeight: recommendation.recommendedValue },
        get().mode,
      );
      set({ profile: next });
    } else if (
      recommendation.setting === "fontSize" &&
      typeof recommendation.recommendedValue === "number"
    ) {
      const next = persistAndApply(
        { ...profile, fontSize: recommendation.recommendedValue },
        get().mode,
      );
      set({ profile: next });
    } else if (
      recommendation.setting === "focusHighlight" &&
      typeof recommendation.recommendedValue === "boolean"
    ) {
      const next = persistAndApply(
        { ...profile, focusHighlight: recommendation.recommendedValue },
        get().mode,
      );
      set({ profile: next });
    } else if (
      recommendation.setting === "theme" &&
      typeof recommendation.recommendedValue === "string" &&
      isThemeId(recommendation.recommendedValue)
    ) {
      const next = persistAndApply(
        { ...profile, theme: recommendation.recommendedValue },
        get().mode,
      );
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
      const next = persistAndApply(
        { ...profile, focusHighlight: change.previousValue },
        get().mode,
      );
      set({ profile: next, lastAdaptiveChange: null });
      return;
    }
    if (
      change.setting === "theme" &&
      typeof change.previousValue === "string" &&
      isThemeId(change.previousValue)
    ) {
      const next = persistAndApply({ ...profile, theme: change.previousValue }, get().mode);
      set({ profile: next, lastAdaptiveChange: null });
    }
  },

  toggleLock: (setting) => {
    const locked = get().lockedSettings;
    const next = locked.includes(setting)
      ? locked.filter((item) => item !== setting)
      : [...locked, setting];
    writeLocal(LOCKS_KEY, JSON.stringify(next));
    sync.settingsChanged();
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
    sync.settingsChanged();
    set({ savedProfiles });
  },

  deleteSavedProfile: (id) => {
    const savedProfiles = get().savedProfiles.filter((item) => item.id !== id);
    writeLocal(SAVED_KEY, JSON.stringify(savedProfiles));
    sync.settingsChanged();
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

    // Colour comes from the marker in hand unless the caller named one. When a
    // drag swallows earlier marks, the new colour wins: re-marking a passage in
    // green after marking it yellow is how someone changes their mind about it.
    const color = mark.color ?? get().markerColor;

    const merged: Highlight = {
      lineIdx: mark.lineIdx,
      section: mark.section,
      start,
      end,
      text: mark.text.slice(0, 400),
      note,
      color,
      at: Date.now(),
    };

    const nextForKey = [...current.filter((item) => !overlaps(item)), merged];
    const highlights = { ...get().highlights, [key]: nextForKey };
    writeLocal(HIGHLIGHTS_KEY, JSON.stringify(highlights));
    sync.highlightsChanged(key);
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
    sync.highlightsChanged(key);
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
    sync.highlightsChanged(key);
    set({ highlights });
  },

  /**
   * Choose the marker.
   *
   * Persisted on its own key rather than inside the profile: a reader who
   * colour-codes wants the same marker in hand next time regardless of which
   * reading profile they opened the book under.
   */
  setMarkerColor: (color) => {
    const next = colorById(color).id;
    writeLocal(MARKER_KEY, next);
    set({ markerColor: next });
  },

  /** Change the colour of a mark already made, without disturbing its note. */
  recolorHighlight: (lineIdx, section, start, color) => {
    const key = textKey(get().text);
    const current = get().highlights[key];
    if (!current) return;
    const next = colorById(color).id;
    const highlights = {
      ...get().highlights,
      [key]: current.map((item) =>
        item.lineIdx === lineIdx && item.section === section && item.start === start
          ? { ...item, color: next }
          : item,
      ),
    };
    writeLocal(HIGHLIGHTS_KEY, JSON.stringify(highlights));
    sync.highlightsChanged(key);
    set({ highlights });
  },

  addStroke: (stroke) => {
    const key = textKey(get().text);
    const current = get().ink[key] ?? [];
    const next = trimStrokes([...current, { ...stroke, id: strokeId(), at: Date.now() }]);
    const ink = { ...get().ink, [key]: next };
    writeLocal(INK_KEY, JSON.stringify(ink));
    sync.inkChanged(key, stroke.section);
    set({ ink });
  },

  eraseStrokes: (ids) => {
    if (!ids.length) return;
    const key = textKey(get().text);
    const current = get().ink[key] ?? [];
    const gone = new Set(ids);
    const next = current.filter((stroke) => !gone.has(stroke.id));
    if (next.length === current.length) return;
    const ink = { ...get().ink, [key]: next };
    writeLocal(INK_KEY, JSON.stringify(ink));
    // An eraser drag can cross a section boundary, so every section that lost a
    // stroke needs sending, not just the one under the cursor at the end.
    for (const section of new Set(current.filter((s) => gone.has(s.id)).map((s) => s.section))) {
      sync.inkChanged(key, section);
    }
    set({ ink });
  },

  /** Take back the last stroke drawn on this section, not on the whole book. */
  undoStroke: (section) => {
    const key = textKey(get().text);
    const current = get().ink[key] ?? [];
    let lastIndex = -1;
    for (let i = current.length - 1; i >= 0; i -= 1) {
      if (current[i]!.section === section) {
        lastIndex = i;
        break;
      }
    }
    if (lastIndex === -1) return;
    const next = current.filter((_, i) => i !== lastIndex);
    const ink = { ...get().ink, [key]: next };
    writeLocal(INK_KEY, JSON.stringify(ink));
    sync.inkChanged(key, section);
    set({ ink });
  },

  clearInk: (section) => {
    const key = textKey(get().text);
    const current = get().ink[key] ?? [];
    const next = current.filter((stroke) => stroke.section !== section);
    if (next.length === current.length) return;
    const ink = { ...get().ink, [key]: next };
    writeLocal(INK_KEY, JSON.stringify(ink));
    sync.inkChanged(key, section);
    set({ ink });
  },

  setInkTool: (tool) => {
    const next = toolById(tool).id;
    writeLocal(INK_TOOL_KEY, next);
    // Reaching for a tool is reaching to draw, so picking one arms the surface.
    // The eraser is included: it is a thing you do to the page, not to text.
    set({ inkTool: next, inkMode: true });
  },

  setInkColor: (color) => {
    const next = inkColorById(color).id;
    writeLocal(INK_COLOR_KEY, next);
    set({ inkColor: next });
  },

  setInkMode: (on) => set({ inkMode: on }),

  toggleBookmark: () => {
    const { text, reading, bookmarks, sourceKind, sourceId, pdfPage, chapterIndex, sessions } =
      get();
    if (!text) return;
    const match = (item: Bookmark) =>
      sourceId ? item.sourceId === sourceId : item.content === text;
    const existing = bookmarks.find(match);
    const title =
      sessions[0]?.title ||
      text
        .split(/\n/)
        .find((line) => line.trim())
        ?.slice(0, 60) ||
      "Bookmark";
    const start = Math.max(0, Math.floor(reading.progress * Math.max(0, text.length - 90)));
    const excerpt = text
      .replace(/\s+/g, " ")
      .slice(start, start + 90)
      .trim();
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
    sync.bookmarksChanged();
    set({ bookmarks: next });
  },

  removeBookmark: (id) => {
    const next = get().bookmarks.filter((item) => item.id !== id);
    writeLocal(BOOKMARKS_KEY, JSON.stringify(next));
    sync.bookmarksChanged();
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
      INK_KEY,
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
      markerColor: DEFAULT_HIGHLIGHT_COLOR,
      ink: {},
      inkMode: false,
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

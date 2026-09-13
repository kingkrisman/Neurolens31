import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Bookmark,
  BookOpenText,
  ChevronLeft,
  ChevronRight,
  ChevronsDown,
  Compass,
  Copy,
  Download,
  Focus,
  HelpCircle,
  Highlighter,
  Languages,
  MoreHorizontal,
  Pause,
  Play,
  Search,
  Settings2,
  SpellCheck,
  StickyNote,
  Volume2,
  VolumeX,
} from "lucide-react";
import { processBionicText } from "@/lib/bionic";
import { applyPlainLanguage, simplifyText } from "@/lib/text-simplifier";
import { evaluateScheme, formatContrastRatio } from "@/lib/contrast";
import { FONT_CLASS, TINT_CLASS } from "@/lib/types";
import { useAppStore } from "@/lib/store";
import { feedback, tapFeedback } from "@/lib/feedback";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Textarea, Input } from "@/components/ui/field";
import { IconSwap } from "@/components/ui/icon-swap";
import { Progress, Kbd } from "@/components/ui/surfaces";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ReaderControls } from "@/components/reader-controls";
import { RecommendationBanner } from "@/components/recommendation-banner";
import { SpeedReader } from "@/components/speed-reader";
import { cn, wordCount } from "@/lib/utils";
import { announce } from "@/lib/announce";
import { useReadingTracker } from "@/lib/adaptive/use-reading-tracker";
import { useLineDwell } from "@/lib/adaptive/use-line-dwell";
import { PatternHint } from "@/components/pattern-panel";
import { autoScrollDeltaPx, resolveRhythmCurve, tokenContextAtProgress } from "@/lib/rhythm";
import { splitSentenceSpans } from "@/lib/sentences";
import { ReadingFeelBar } from "@/components/reading-feel";
import { ReadingCoach } from "@/components/reading-coach";
import { ReconnectDock } from "@/components/reconnect-card";
import { PdfPageCanvas, ReaderPager } from "@/components/pdf-pager";
import { splitPdfPages, joinPdfPages } from "@/lib/pdf-pages";
import { detectChapters, joinTextChapters, paginateLongText, splitTextChapters } from "@/lib/chapters";
import { searchBook } from "@/lib/book-search";
import { exportHighlights } from "@/lib/data-export";
import {
  customHighlightsSupported,
  ensureHighlightStyle,
  rangeFromOffsets,
  readSelection,
} from "@/lib/selection-range";
import { Icon } from "@iconify/react";
import {
  bookmarkSimple,
  caretRight,
  bookmarkSimpleFill,
  compass,
  crosshair,
  dotsThree,
  highlighter as phHighlighter,
  magnifyingGlass,
  pause as phPause,
  play as phPlay,
  slidersHorizontal,
  speakerHigh,
  translate,
  x as phX,
} from "@/lib/ph-icons";
import { chapterRole, isTitlePage, parseBlocks } from "@/lib/blocks";
import { WordRun } from "@/components/word-run";
import { WordCard } from "@/components/word-card";
import { chunkByMinutes, wordAtChar, wordFromPoint } from "@/lib/word-markup";
import { followReadingLine, lineBoxesOf, type FollowState } from "@/lib/reading-line";
import { copyReading, downloadReading } from "@/lib/reading-export";
import { easeOut, gsap, registerGsap, useGSAP } from "@/lib/gsap";
import { useReducedMotion } from "@/lib/prefers-reduced-motion";
import { buildCheckpoints, scoreComprehension } from "@/lib/comprehension";
import { pauseSpeech, rateFromWpm, resumeSpeech, speakText, speechSupported, stopSpeech } from "@/lib/speech";

registerGsap();

function afterMenu(fn: () => void) {
  window.setTimeout(() => {
    try {
      fn();
    } catch (error) {
      console.error(error);
    }
  }, 0);
}

/** IconSwap takes components, so the Phosphor data is wrapped to match. */
const PhPause = (props: { size?: number; className?: string }) => (
  <Icon icon={phPause} width={props.size ?? 19} height={props.size ?? 19} aria-hidden className={props.className} />
);
const PhPlay = (props: { size?: number; className?: string }) => (
  <Icon icon={phPlay} width={props.size ?? 19} height={props.size ?? 19} aria-hidden className={props.className} />
);
const PhSpeaker = (props: { size?: number; className?: string }) => (
  <Icon icon={speakerHigh} width={props.size ?? 19} height={props.size ?? 19} aria-hidden className={props.className} />
);

export function Reader() {
  const text = useAppStore((s) => s.text);
  const sourceKind = useAppStore((s) => s.sourceKind);
  const pdfPage = useAppStore((s) => s.pdfPage);
  const pdfPageCount = useAppStore((s) => s.pdfPageCount);
  const setPdfPage = useAppStore((s) => s.setPdfPage);
  const chapterIndex = useAppStore((s) => s.chapterIndex);
  const chapterCount = useAppStore((s) => s.chapterCount);
  const setChapter = useAppStore((s) => s.setChapter);
  const profile = useAppStore((s) => s.profile);
  const setProfile = useAppStore((s) => s.setProfile);
  const mode = useAppStore((s) => s.mode);
  const controlsOpen = useAppStore((s) => s.controlsOpen);
  const setControlsOpen = useAppStore((s) => s.setControlsOpen);
  const autoScrolling = useAppStore((s) => s.autoScrolling);
  const setAutoScrolling = useAppStore((s) => s.setAutoScrolling);
  const targetWpm = useAppStore((s) => s.targetWpm);
  const highlights = useAppStore((s) => s.highlights);
  const elapsedActiveMs = useAppStore((s) => s.reading.elapsedActiveMs);
  const addHighlight = useAppStore((s) => s.addHighlight);
  const removeHighlight = useAppStore((s) => s.removeHighlight);
  const annotateHighlight = useAppStore((s) => s.annotateHighlight);
  const pendingJump = useAppStore((s) => s.pendingJump);
  const clearJump = useAppStore((s) => s.clearJump);
  const toggleBookmark = useAppStore((s) => s.toggleBookmark);
  const bookmarks = useAppStore((s) => s.bookmarks);
  const sourceId = useAppStore((s) => s.sourceId);

  const scrollRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const startReading = useAppStore((s) => s.startReading);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [rsvpOpen, setRsvpOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [marksOpen, setMarksOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  /**
   * Touch targets, then mouse targets.
   *
   * The dock's controls were 36px squares. That is under the 44px minimum for a
   * touch target, and this app is used by people who often have motor as well
   * as attention differences — a control you cannot reliably hit is not a
   * control. Nine of them across a 390px phone also left no room to grow, which
   * is why the secondary four move into the overflow menu below `sm` rather
   * than being shrunk further.
   */
  const dockButton = "size-11 min-h-11 sm:size-9 sm:min-h-9";
  const [findQuery, setFindQuery] = useState("");
  const [note, setNote] = useState("");
  const [simplifyOpen, setSimplifyOpen] = useState(false);
  const [checkOpen, setCheckOpen] = useState(false);
  const [checkPicks, setCheckPicks] = useState<number[]>([]);
  const [reconnectOpen, setReconnectOpen] = useState(false);
  const [resumeLine, setResumeLine] = useState<number | null>(null);
  const [lookup, setLookup] = useState<string | null>(null);
  const [activeWord, setActiveWord] = useState<{ line: number; index: number } | null>(null);
  const [chunkOn, setChunkOn] = useState(false);
  const [chunkIndex, setChunkIndex] = useState(0);
  const speechIndex = useRef(0);
  const programmaticScroll = useRef(false);
  const didAnnounceScroll = useRef(false);
  const pendingRestore = useRef(0);
  const activeLineRef = useRef<number | null>(null);
  const followStateRef = useRef<FollowState | null>(null);
  const pageKeyRef = useRef("");
  const placedKey = useRef("");
  const resumeTimer = useRef(0);

  const pdfPages = useMemo(
    () => (sourceKind === "pdf" ? splitPdfPages(text) : []),
    [sourceKind, text],
  );
  const textChapters = useMemo(() => {
    if (sourceKind !== "text") return [];
    const declared = splitTextChapters(text);
    // A long book whose headings this parser cannot see would otherwise render
    // in full — every paragraph of it — in a single pass.
    return declared.length > 0 ? declared : paginateLongText(text);
  }, [sourceKind, text]);
  const pdfChapters = useMemo(
    () => (sourceKind === "pdf" ? detectChapters(pdfPages) : []),
    [sourceKind, pdfPages],
  );
  const chapters = sourceKind === "pdf" ? pdfChapters : textChapters.map((chapter, index) => ({
    title: chapter.title,
    startPage: index + 1,
    endPage: index + 1,
  }));
  const pageCount = pdfPageCount || pdfPages.length;
  const paged = sourceKind === "pdf" && pageCount > 0;
  const chaptered = chapterCount > 1;
  const pageText = paged
    ? (pdfPages[Math.max(0, pdfPage - 1)] ?? "")
    : chaptered
      ? (textChapters[Math.max(0, chapterIndex - 1)]?.body ?? text)
      : text;
  const chunks = useMemo(
    () => (chunkOn ? chunkByMinutes(pageText, targetWpm, 3) : [pageText]),
    [chunkOn, pageText, targetWpm],
  );
  const viewText = chunks[Math.min(chunkIndex, Math.max(0, chunks.length - 1))] ?? pageText;

  const blocks = useMemo(() => parseBlocks(viewText), [viewText]);
  const titlePage =
    isTitlePage(blocks) ||
    (chaptered && chapterRole(chapters[Math.max(0, chapterIndex - 1)]?.title ?? "") === "front");
  const words = useMemo(() => viewText.trim().split(/\s+/).filter(Boolean), [viewText]);
  useReadingTracker(scrollRef, words.length);

  const pageKey = `${pdfPage}:${chapterIndex}:${viewText.length}:${viewText.slice(0, 24)}`;
  useLineDwell(scrollRef, pageKey);
  if (pageKeyRef.current !== pageKey) {
    pageKeyRef.current = pageKey;
    activeLineRef.current = null;
    followStateRef.current = null;
  }

  const guides = useMemo(
    () => ({
      syllables: Boolean(profile.syllables),
      letterGuide: Boolean(profile.letterGuide),
      wordGuide: Boolean(profile.wordGuide),
    }),
    [profile.syllables, profile.letterGuide, profile.wordGuide],
  );

  const markActiveLine = useCallback((lineIdx: number | null) => {
    const node = scrollRef.current;
    const prev = activeLineRef.current;
    if (prev === lineIdx && lineIdx != null) return;
    if (node) {
      if (prev != null) node.querySelector(`#line-${prev}`)?.classList.remove("active");
      if (lineIdx == null) {
        node.querySelectorAll(".reading-line.active").forEach((el) => el.classList.remove("active"));
      } else {
        node.querySelector(`#line-${lineIdx}`)?.classList.add("active");
        node.dispatchEvent(new Event("nl-line"));
      }
    }
    activeLineRef.current = lineIdx;
  }, []);

  const lines = useMemo(() => {
    const list: {
      text: string;
      html: string;
      lineIdx: number;
      blockIndex: number;
      itemIndex: number;
    }[] = [];
    blocks.forEach((block, blockIndex) => {
      const sources = block.items?.map((item) => item.text) ?? (block.text ? [block.text] : []);
      sources.forEach((source, itemIndex) => {
        splitSentenceSpans(source).forEach((span, index) => {
          const full = span.trim();
          if (!full) return;
          list.push({
            text: full,
            html:
              profile.bionicStrength > 0
                ? processBionicText(full, profile.bionicStrength, profile.rhythmOptimization)
                : full,
            lineIdx: blockIndex * 1000 + itemIndex * 40 + index,
            blockIndex,
            itemIndex,
          });
        });
      });
    });
    return list;
  }, [blocks, profile.bionicStrength, profile.rhythmOptimization]);

  const resumeTo = useCallback(
    (progress: number) => {
      const node = scrollRef.current;
      if (!node || !lines.length) return;
      const at = Math.min(1, Math.max(0, progress));
      const idx = Math.min(lines.length - 1, Math.max(0, Math.round(at * (lines.length - 1))));
      const line = lines[idx];
      if (!line) return;
      markActiveLine(line.lineIdx);
      followStateRef.current = { id: line.lineIdx, boxIndex: 0 };
      setResumeLine(line.lineIdx);
      const el = node.querySelector(`#line-${line.lineIdx}`);
      el?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
      window.clearTimeout(resumeTimer.current);
      resumeTimer.current = window.setTimeout(() => setResumeLine(null), 5000);
      announce("Back at the last solid stretch");
    },
    [lines, markActiveLine, reduceMotion],
  );

  useEffect(() => {
    const key = text.trim().slice(0, 40) || "default";
    try {
      setNote(localStorage.getItem(`neurolens-note-${key}`) || "");
    } catch {
      setNote("");
    }
  }, [text]);

  useEffect(() => {
    const key = text.trim().slice(0, 40) || "default";
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(`neurolens-note-${key}`, note);
      } catch {
        /* private mode or quota */
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [note, text]);

  function speakAt(index: number) {
    if (!speechSupported()) return;
    if (index < 0 || index >= lines.length) {
      stopSpeech();
      setIsSpeaking(false);
      setIsPaused(false);
      return;
    }
    const item = lines[index];
    speechIndex.current = index;
    markActiveLine(item.lineIdx);
    followStateRef.current = { id: item.lineIdx, boxIndex: 0 };
    document.getElementById(`line-${item.lineIdx}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    speakText(profile.plainLanguage ? applyPlainLanguage(item.text) : item.text, {
      rate: rateFromWpm(targetWpm),
      onBoundary: (charIndex) => {
        setActiveWord({ line: item.lineIdx, index: wordAtChar(item.text, charIndex) });
      },
      onEnd: () => {
        if (speechIndex.current === index) speakAt(index + 1);
      },
      onError: () => {
        setIsSpeaking(false);
        setIsPaused(false);
      },
    });
  }

  function toggleSpeech() {
    if (!speechSupported()) {
      toast.error("Speech is not available here");
      return;
    }
    if (isSpeaking && !isPaused) {
      pauseSpeech();
      setIsPaused(true);
      announce("Paused listening");
      return;
    }
    if (isSpeaking && isPaused) {
      resumeSpeech();
      setIsPaused(false);
      announce("Resumed listening");
      return;
    }
    setIsSpeaking(true);
    setIsPaused(false);
    announce("Reading aloud");
    const current = activeLineRef.current;
    const start = current == null ? 0 : Math.max(0, lines.findIndex((line) => line.lineIdx === current));
    speakAt(start);
  }

  useEffect(() => () => {
    stopSpeech();
    window.clearTimeout(resumeTimer.current);
  }, []);

  useEffect(() => {
    // Taken once, and taken away — the placement effect below runs on every
    // part change, and a restore point left lying around would drag the reader
    // back into the middle of the next part they turned to.
    pendingRestore.current = useAppStore.getState().restoreTo;
    if (pendingRestore.current) useAppStore.setState({ restoreTo: 0 });
  }, [text]);

  useLayoutEffect(() => {
    const id = activeLineRef.current;
    const node = scrollRef.current;
    if (!node) return;
    if (id == null) return;
    node.querySelector(`#line-${id}`)?.classList.add("active");
  });

  useEffect(() => {
    if (placedKey.current === pageKey) return;
    placedKey.current = pageKey;
    markActiveLine(null);
    setResumeLine(null);
    setReconnectOpen(false);
    const node = scrollRef.current;
    if (!node) return;
    const restore = pendingRestore.current;
    const place = () => {
      followStateRef.current = null;
      const picked = followReadingLine(node, null, null);
      if (picked) {
        followStateRef.current = { id: picked.id, boxIndex: picked.boxIndex };
        markActiveLine(picked.id);
      } else node.dispatchEvent(new Event("nl-line"));
    };
    if (restore > 0.02 && restore < 0.98) {
      // Wait for the text to have a height before restoring a fraction of it.
      // On a cold open the article has not laid out on the first frame, so a
      // single attempt measured zero, silently skipped, and cleared the pending
      // value — dropping the reader at the top of the right part instead of
      // where they stopped. Bounded, so a genuinely short part gives up rather
      // than spinning.
      let frames = 0;
      const restoreScroll = () => {
        const max = node.scrollHeight - node.clientHeight;
        if (max <= 8) {
          if (frames++ < 30) {
            requestAnimationFrame(restoreScroll);
            return;
          }
        } else {
          node.scrollTop = restore * max;
        }
        pendingRestore.current = 0;
        requestAnimationFrame(place);
      };
      requestAnimationFrame(restoreScroll);
    } else {
      node.scrollTop = 0;
      requestAnimationFrame(place);
    }
    if (chaptered && chapterIndex > 0) {
      const title = chapters[chapterIndex - 1]?.title;
      if (title) announce(title);
    } else if (paged) {
      announce(`Page ${pdfPage} of ${pageCount}`);
    }
  }, [pageKey, pdfPage, chapterIndex, pageText, markActiveLine, chaptered, paged, pageCount]);

  useEffect(() => {
    setChunkIndex(0);
  }, [pageText, chunkOn]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node || isSpeaking) return;
    if (!profile.wordGuide) return;
    let frame = 0;
    const sync = () => {
      frame = 0;
      const picked = followReadingLine(node, null, followStateRef.current);
      if (picked) {
        followStateRef.current = { id: picked.id, boxIndex: picked.boxIndex };
        markActiveLine(picked.id);
      }
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(sync);
    };
    node.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    sync();
    return () => {
      node.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [viewText, isSpeaking, profile.wordGuide, lines.length, markActiveLine]);

  // Cmd/Ctrl-F is what everyone reaches for, so it opens the in-book find
  // rather than the browser's — which would only search the section on screen
  // and quietly miss the rest of the book.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "f") return;
      event.preventDefault();
      setFindOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!paged && !chaptered) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
      if (event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        if (chaptered) setChapter(chapterIndex < 1 ? 1 : chapterIndex + 1);
        else setPdfPage(pdfPage + 1);
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        if (chaptered) setChapter(chapterIndex - 1);
        else setPdfPage(pdfPage - 1);
      } else if (paged && event.key === "]") {
        event.preventDefault();
        setPdfPage(pdfPage + 1);
      } else if (paged && event.key === "[") {
        event.preventDefault();
        setPdfPage(pdfPage - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paged, chaptered, pdfPage, chapterIndex, setPdfPage, setChapter]);

  const simplified = useMemo(() => simplifyText(viewText), [viewText]);
  const checkpoints = useMemo(() => buildCheckpoints(viewText), [viewText]);
  const markKey = text.trim().slice(0, 48) || "default";
  /**
   * Which slice of the book the reader is looking at.
   *
   * Line indices restart inside every chapter, Part, and PDF page, so a
   * highlight is only located once it is paired with the section it was made
   * in. Without this, marking a line lit up the same index in every other
   * section of the book.
   */
  const section = paged ? pdfPage : chaptered ? chapterIndex : 0;
  // Memoised so the fallback does not mint a fresh [] on every render, which
  // would invalidate the Set below each time and re-derive it for nothing.
  /**
   * The book as the reader navigates it, for searching across the whole thing.
   *
   * Search has to look beyond the section on screen — the point of it is to
   * find the passage you cannot see — so it works from every section's text and
   * reports matches in the same section/line terms the reader jumps by.
   */
  /** Move the reader to a section/line pair, changing section first if needed. */
  const jumpTo = useCallback(
    (toSection: number, lineIdx: number) => {
      const here = toSection === section;
      if (!here) {
        if (paged) setPdfPage(toSection);
        else if (chaptered) setChapter(toSection);
      }
      // A line only exists in the DOM once its section is rendered, so a
      // cross-section jump has to wait for that commit before scrolling.
      window.setTimeout(
        () => {
          const node = scrollRef.current?.querySelector(`#line-${lineIdx}`);
          node?.scrollIntoView({ block: "center", behavior: "smooth" });
          if (node instanceof HTMLElement) markActiveLine(lineIdx);
        },
        here ? 60 : 320,
      );
    },
    [section, paged, chaptered, setPdfPage, setChapter, markActiveLine],
  );

  // Satisfy a jump asked for from elsewhere (the command palette). Waits for
  // `lines` so the target section has actually rendered — jumping before that
  // would scroll to an id that does not exist yet.
  useEffect(() => {
    if (!pendingJump || !lines.length) return;
    const { section: to, lineIdx } = pendingJump;
    clearJump();
    jumpTo(to, lineIdx);
  }, [pendingJump, lines.length, clearJump, jumpTo]);

  const searchSections = useMemo(() => {
    if (paged) return pdfPages;
    if (chaptered) return textChapters.map((chapter) => chapter.body);
    return [text];
  }, [paged, pdfPages, chaptered, textChapters, text]);

  const findHits = useMemo(
    () => (findOpen && findQuery.trim().length > 1 ? searchBook(searchSections, findQuery) : []),
    [findOpen, findQuery, searchSections],
  );

  const bookHighlights = useMemo(() => highlights[markKey] ?? [], [highlights, markKey]);
  /**
   * Whether the reader has reached the end of this part, and what to say.
   *
   * Only for a book that actually has parts — an undivided passage has no
   * boundary to mark, and inventing one would be a celebration of nothing.
   */
  const partDone = useMemo(() => {
    if (!chaptered && !paged) return null;
    const words = viewText.trim() ? viewText.trim().split(/\s+/).length : 0;
    if (!words) return null;

    const minutes = Math.max(1, Math.round(elapsedActiveMs / 60_000));
    const markCount = bookHighlights.filter((h) => h.section === section).length;
    const summary = [
      `${words.toLocaleString()} words`,
      `${minutes} min`,
      markCount ? `${markCount} highlight${markCount === 1 ? "" : "s"}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    const total = paged ? pageCount : chapterCount;
    const at = paged ? pdfPage : chapterIndex;
    const hasNext = at < total;
    const next = hasNext
      ? (chapters[at]?.title ?? (paged ? `Page ${at + 1}` : `Part ${at + 1}`))
      : null;

    return { summary, next };
  }, [
    chaptered,
    paged,
    viewText,
    elapsedActiveMs,
    bookHighlights,
    section,
    pageCount,
    chapterCount,
    pdfPage,
    chapterIndex,
    chapters,
  ]);

  /** Marks that belong to the section currently on screen. */
  const marksHere = useMemo(
    () => bookHighlights.filter((h) => h.section === section),
    [bookHighlights, section],
  );

  /**
   * Paint saved marks as ranges over the live text.
   *
   * The CSS Custom Highlight API is the right tool and the only clean one: a
   * mark can start mid-word and end mid-word, and the line underneath is
   * already a nest of elements because bionic formatting wraps the lead of
   * every word. Splicing `<mark>` into that would mean rebuilding the markup on
   * every change and fighting React for it. Ranges sit *over* the DOM instead
   * and never touch it.
   *
   * Re-runs on font and spacing changes as well as on the marks themselves,
   * because a reflow moves the text the ranges are pinned to.
   */
  useEffect(() => {
    if (!customHighlightsSupported()) return;
    const node = scrollRef.current;
    if (!node) return;
    // Re-run on every paint so a scheme change is reflected; replacing the one
    // rule is cheaper than watching the theme separately.
    ensureHighlightStyle();

    const ranges: Range[] = [];
    for (const mark of marksHere) {
      const line = node.querySelector(`#line-${mark.lineIdx}`);
      if (!line) continue;
      const range = rangeFromOffsets(line, mark.start, mark.end);
      if (range) ranges.push(range);
    }

    const registry = (CSS as unknown as { highlights: Map<string, unknown> }).highlights;
    if (!ranges.length) {
      registry.delete("nl-mark");
      return;
    }
    registry.set("nl-mark", new (window as unknown as { Highlight: new (...r: Range[]) => unknown }).Highlight(...ranges));
    return () => {
      registry.delete("nl-mark");
    };
  }, [marksHere, viewText, profile.fontSize, profile.lineHeight, profile.bionicStrength, profile.fontFamily, profile.theme]);

  /**
   * Mark whatever was dragged over.
   *
   * On `pointerup` rather than on `selectionchange`, because a selection is
   * still growing while the pointer is down and marking mid-drag would leave a
   * trail of half-phrases. Keyboard selection is covered too: Shift+Arrow ends
   * on a keyup, and someone selecting by keyboard is often someone who cannot
   * comfortably drag.
   *
   * The selection is deliberately left in place afterwards, so the same drag
   * can still be copied. Marking and copying are both reasonable things to want
   * from having selected a phrase, and clearing it would silently rule one out.
   */
  const markSelection = useCallback(() => {
    const node = scrollRef.current;
    if (!node || isSpeaking) return;
    const picked = readSelection(node);
    if (!picked) return;

    addHighlight({
      lineIdx: picked.lineIdx,
      section,
      start: picked.start,
      end: picked.end,
      text: picked.text,
    });
    feedback("good", { message: `Highlighted: ${picked.text.slice(0, 60)}` });
    // The selection is cleared after marking, not kept. Leaving it in place
    // meant the browser's own selection sat on top of the stroke that had just
    // been drawn, so the reader could not see the mark they had made until they
    // clicked elsewhere — the one moment the feedback actually matters.
    window.getSelection?.()?.removeAllRanges();
  }, [isSpeaking, section, addHighlight]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const onUp = () => {
      // Deferred a frame: on pointerup the browser has not always finished
      // settling the selection, and reading it too early gives the range as it
      // stood one event earlier.
      window.setTimeout(markSelection, 0);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (!event.shiftKey) return;
      if (!event.key.startsWith("Arrow")) return;
      window.setTimeout(markSelection, 0);
    };
    node.addEventListener("pointerup", onUp);
    node.addEventListener("keyup", onKeyUp);
    return () => {
      node.removeEventListener("pointerup", onUp);
      node.removeEventListener("keyup", onKeyUp);
    };
  }, [markSelection]);

  const bookmarked = bookmarks.some((item) =>
    sourceId ? item.sourceId === sourceId : item.content === text,
  );
  const rhythmCurve = resolveRhythmCurve(profile.rhythmCurve, profile.rhythmOptimization);
  const contrast = evaluateScheme(profile.theme, profile.fontSize);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node || !autoScrolling) {
      didAnnounceScroll.current = false;
      return;
    }
    let frame = 0;
    let last = performance.now();
    let carry = 0;

    const stopForUser = () => {
      if (programmaticScroll.current) return;
      setAutoScrolling(false);
    };

    const maxAtStart = node.scrollHeight - node.clientHeight - node.scrollTop;
    if (maxAtStart < 8) {
      setAutoScrolling(false);
      toast("You’re already at the end of the page");
      return;
    }

    if (!didAnnounceScroll.current) {
      toast.success(`Scrolling at ${targetWpm} WPM`);
      didAnnounceScroll.current = true;
    }

    const step = (now: number) => {
      const dtSec = Math.min(0.05, (now - last) / 1000);
      last = now;
      const maxScroll = node.scrollHeight - node.clientHeight;
      const remainingPx = maxScroll - node.scrollTop;
      if (maxScroll <= 1 || remainingPx <= 2) {
        setAutoScrolling(false);
        toast.success("End of the page");
        return;
      }
      const localProgress = node.scrollTop / maxScroll;
      const remainingWords = Math.max(1, Math.round((1 - localProgress) * words.length));
      const focus = tokenContextAtProgress(words, localProgress);
      carry += autoScrollDeltaPx({
        remainingPx,
        remainingWords,
        targetWpm,
        dtSec,
        focusToken: focus.token,
        nextToken: focus.next,
        curve: rhythmCurve,
      });
      const px = Math.trunc(carry);
      if (px >= 1) {
        programmaticScroll.current = true;
        node.scrollTop += px;
        programmaticScroll.current = false;
        carry -= px;
      }
      const line = lines[Math.min(lines.length - 1, Math.max(0, Math.floor(localProgress * lines.length)))];
      if (line) markActiveLine(line.lineIdx);
      if (node.scrollTop + node.clientHeight >= node.scrollHeight - 4) {
        setAutoScrolling(false);
        toast.success("End of the page");
        return;
      }
      frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    node.addEventListener("wheel", stopForUser, { passive: true });
    node.addEventListener("pointerdown", stopForUser);
    node.addEventListener("touchmove", stopForUser, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      node.removeEventListener("wheel", stopForUser);
      node.removeEventListener("pointerdown", stopForUser);
      node.removeEventListener("touchmove", stopForUser);
    };
  }, [autoScrolling, targetWpm, words, setAutoScrolling, rhythmCurve, lines, markActiveLine]);

  function toggleAutoScroll() {
    if (autoScrolling) {
      setAutoScrolling(false);
      announce("Auto-scroll paused");
      return;
    }
    const node = scrollRef.current;
    const remaining = node ? node.scrollHeight - node.clientHeight - node.scrollTop : 0;
    if (!node || remaining < 8) {
      toast("You’re already at the end of the page");
      return;
    }
    tapFeedback("start");
    setAutoScrolling(true);
  }

  const onRsvpProgress = useCallback(
    (index: number) => {
      const node = scrollRef.current;
      if (!node || words.length < 2) return;
      const max = node.scrollHeight - node.clientHeight;
      if (max <= 1) return;
      programmaticScroll.current = true;
      node.scrollTop = (index / (words.length - 1)) * max;
      programmaticScroll.current = false;
    },
    [words.length],
  );

  const sessionTitle = useAppStore((s) => s.sessions[0]?.title);
  const readingTitle = sessionTitle || text.split(/\n/).find((line) => line.trim())?.slice(0, 80) || "Untitled reading";

  useGSAP(
    () => {
      const bar = toolbarRef.current;
      if (!bar || reduceMotion) return;
      gsap.from(bar, { y: 22, opacity: 0, duration: 0.5, delay: 0.12, ease: easeOut });
    },
    { dependencies: [reduceMotion] },
  );

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 flex-1 flex-col",
        TINT_CLASS[profile.tint] ?? "bg-bg",
        rhythmCurve === "breath" && "rhythm-breath",
        autoScrolling && "is-autoscrolling",
      )}
    >
      <Sheet open={controlsOpen} onOpenChange={setControlsOpen} title="Reading options">
        <ReaderControls onClose={() => setControlsOpen(false)} />
      </Sheet>

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          className={cn(
            "reader-scroll h-full overflow-y-auto",
            // The options panel is a 24rem drawer down the left. Shifting the
            // column out from under it is what makes the panel useful: you are
            // adjusting type against text you can still see, not text the panel
            // is sitting on. Only from `lg`, where there is width to give up.
            "transition-[padding] duration-[250ms] ease-[var(--ease-out)] motion-reduce:transition-none",
            controlsOpen && "lg:pl-[24rem]",
          )}
          data-resume={resumeLine ?? undefined}
        >
          <article
          aria-labelledby="reading-title"
          className={cn(
            "mx-auto max-w-2xl px-5 pt-24 pb-16 sm:px-8 sm:pt-28 sm:pb-20",
            FONT_CLASS[profile.fontFamily] ?? "font-sans",
            "break-words",
            profile.wordGuide && "word-guide-on",
            profile.align === "justify" && !titlePage && "text-justify",
            titlePage && "is-title-page",
          )}
          style={{
            fontSize: profile.fontSize,
            lineHeight: profile.lineHeight,
            letterSpacing: `${profile.letterSpacing}em`,
            wordSpacing: `${profile.wordSpacing}em`,
          }}
        >
          <h1 id="reading-title" className="sr-only">
            {readingTitle}
          </h1>
          <p className="mb-8 text-xs font-medium tracking-wide text-muted uppercase">
            <span className="sr-only">
              {chaptered && chapterIndex > 0 ? `Chapter ${chapterIndex} of ${chapterCount}. ` : ""}
              {paged ? `Page ${pdfPage} of ${pageCount}. ` : ""}
              {wordCount(viewText).toLocaleString()} words
              {paged || chaptered ? " in this section." : "."}
              {mode === "adaptive" ? " Adaptive is watching pace, pauses, and rereads." : ""}
              {` Contrast ${formatContrastRatio(contrast.body)}, ${contrast.bodyLevel}.`}
              <ReaderLiveStats autoScrolling={autoScrolling} targetWpm={targetWpm} />
            </span>
            <span aria-hidden="true">
              {chaptered && chapterIndex > 0 ? `Chapter ${chapterIndex} of ${chapterCount} · ` : ""}
              {paged ? `Page ${pdfPage} of ${pageCount} · ` : ""}
              {wordCount(viewText).toLocaleString()} words
            </span>
          </p>
          {chaptered && chapterIndex > 0 && !titlePage ? (
            <h2 className="mb-6 font-serif text-3xl">{chapters[chapterIndex - 1]?.title}</h2>
          ) : null}
          {/*
            The reader's job is the reformatted text, so the book's own page is
            not drawn alongside it — printing both put the original PDF on top
            of the very text it was extracted from, which is the layout the
            reader exists to replace. A page with no text at all is the one
            exception: there the scan is the only thing there is to show.
          */}
          {paged && blocks.length === 0 ? (
            <>
              <PdfPageCanvas page={pdfPage} />
              <p className="mb-6 text-sm leading-relaxed text-muted">
                This page is a picture, shown as the book printed it — there is no text on it to reformat.
              </p>
            </>
          ) : null}
          {blocks.map((block, blockIndex) => {
            const renderSentences = (itemIndex = 0) => {
              const sentenceNodes = lines.filter(
                (line) => line.blockIndex === blockIndex && line.itemIndex === itemIndex,
              );
              return sentenceNodes.map((line, index) => (
                <Fragment key={line.lineIdx}>
                  {index > 0 ? " " : null}
                  <span
                    id={`line-${line.lineIdx}`}
                    className={cn(
                      "reading-line cursor-pointer",
                      rhythmCurve !== "steady" && /[.!?…]["'”’)]*$/.test(line.text.trim()) && "rhythm-cadence",
                      resumeLine === line.lineIdx && "is-resume",
                    )}
                    onClick={(event) => {
                      if (isSpeaking) {
                        const found = lines.findIndex((item) => item.lineIdx === line.lineIdx);
                        if (found !== -1) speakAt(found);
                        return;
                      }
                      if (profile.lookup !== false) {
                        const word = wordFromPoint(event.clientX, event.clientY, event.currentTarget as HTMLElement);
                        if (word) setLookup(word);
                      }
                      // Marking is no longer a click. A click has no extent, so
                      // it could only ever mark the whole sentence — which is
                      // not what marking a passage means. Dragging says where it
                      // starts and where it stops; see the selection handler on
                      // the scroll container.
                      {
                        markActiveLine(line.lineIdx);
                        const boxes = lineBoxesOf(event.currentTarget);
                        let boxIndex = 0;
                        for (let i = 0; i < boxes.length; i += 1) {
                          const box = boxes[i]!;
                          if (event.clientY >= box.top && event.clientY <= box.bottom) {
                            boxIndex = i;
                            break;
                          }
                        }
                        followStateRef.current = { id: line.lineIdx, boxIndex };
                      }
                    }}
                  >
                    <WordRun
                      text={line.text}
                      html={line.html}
                      lineIdx={line.lineIdx}
                      highlightIndex={activeWord?.line === line.lineIdx ? activeWord.index : null}
                      guides={guides}
                      bionic={profile.bionicStrength}
                      rhythm={profile.rhythmOptimization}
                      plainLanguage={Boolean(profile.plainLanguage)}
                    />
                  </span>
                </Fragment>
              ));
            };

            if (block.kind === "list" && block.items?.length) {
              const ListTag = block.ordered ? "ol" : "ul";
              return (
                <ListTag
                  key={blockIndex}
                  className={cn("reading-list reading-block mb-6", block.ordered ? "is-ordered" : "is-bulleted")}
                >
                  {block.items.map((_, itemIndex) => (
                    <li key={itemIndex}>
                      <span className="min-w-0">{renderSentences(itemIndex)}</span>
                    </li>
                  ))}
                </ListTag>
              );
            }

            if (block.kind === "title") {
              return (
                <h2 key={blockIndex} className="reading-title reading-block mb-6 font-serif">
                  {renderSentences()}
                </h2>
              );
            }
            if (block.kind === "kicker") {
              return (
                <p key={blockIndex} className="reading-kicker reading-block mb-3">
                  {renderSentences()}
                </p>
              );
            }
            if (block.kind === "heading") {
              return (
                <h3 key={blockIndex} className="reading-heading reading-block mb-4 mt-8 font-serif text-2xl">
                  {renderSentences()}
                </h3>
              );
            }
            if (block.kind === "quote") {
              return (
                <blockquote key={blockIndex} className="reading-quote reading-block mb-6">
                  {renderSentences()}
                </blockquote>
              );
            }
            return (
              <p
                key={blockIndex}
                className={cn("reading-block mb-6", block.kind === "lead" && "reading-lead")}
              >
                {renderSentences()}
              </p>
            );
          })}

          {/* The end of a Part, marked.
              Reaching one used to pass in silence — the text simply stopped —
              which threw away a completion the reader had actually earned and
              the app had already computed. Dopamine follows closing a loop, and
              a whole book is too far away to pull anyone; a Part is fifteen
              minutes.

              In the flow of the text, not a modal and not a toast. A modal at a
              completion is friction at the exact moment somebody felt good, and
              a toast is gone before it is read. This is a landing, not a gate:
              Continue is right there, and closing the app is equally fine. */}
          {partDone ? (
            <div className="nl-part-done mt-10 rounded-lg bg-surface p-4 shadow-border sm:p-5">
              <p className="text-sm font-medium">
                {chaptered && chapters[chapterIndex - 1]?.title
                  ? `${chapters[chapterIndex - 1]!.title} finished`
                  : `Part ${section} finished`}
              </p>
              {/* What you did, not what you owe. No bar creeping toward a
                  distant end, no score — the effort, reported back while it
                  still feels like yours. */}
              <p className="mt-1 text-sm text-muted tabular-nums">{partDone.summary}</p>
              {partDone.next ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  {/* Anticipation rather than obligation: dopamine tracks the
                      expectation more than the receipt, and a chapter title is
                      a far better reason to go on than a number would be. */}
                  <p className="text-sm text-muted">Next: {partDone.next}</p>
                  <Button
                    size="sm"
                    onClick={() => {
                      if (paged) setPdfPage(pdfPage + 1);
                      else setChapter(chapterIndex < 1 ? 2 : chapterIndex + 1);
                    }}
                  >
                    Continue
                    <Icon icon={caretRight} width={14} height={14} aria-hidden className="icon-motion icon-shift" />
                  </Button>
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted">That was the last part.</p>
              )}
            </div>
          ) : null}
        </article>
        </div>
      </div>

      <div className="reader-dock pointer-events-none shrink-0 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-2">
          <ReadingCoach />
        <ReadingFeelBar />
          <RecommendationBanner />
          <PatternHint />
          <ReconnectDock
            text={viewText}
            open={reconnectOpen}
            onOpenChange={setReconnectOpen}
            onResume={resumeTo}
          />
          {lookup ? (
            <div className="pointer-events-auto w-full max-w-sm">
              <WordCard word={lookup} onClose={() => setLookup(null)} />
            </div>
          ) : null}
          <div
            ref={toolbarRef}
            role="toolbar"
            aria-label="Reading tools"
            className="material-surface pointer-events-auto flex max-w-full items-center gap-1 rounded-lg p-1.5 shadow-float"
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className={cn(dockButton, "hidden sm:inline-flex")}
                  onClick={() =>
                    setProfile({
                      ...useAppStore.getState().profile,
                      plainLanguage: !useAppStore.getState().profile.plainLanguage,
                    })
                  }
                  aria-label={profile.plainLanguage ? "Turn off plain words" : "Plain words"}
                  aria-pressed={Boolean(profile.plainLanguage)}
                >
                  <Icon icon={translate} width={19} height={19} aria-hidden className="icon-motion icon-lift" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{profile.plainLanguage ? "Plain words on" : "Plain words"}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" className={dockButton} onClick={() => setControlsOpen(true)} aria-label="Reading options">
                  <Icon icon={slidersHorizontal} width={19} height={19} aria-hidden className="icon-motion icon-turn" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Options</TooltipContent>
            </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm"
                  className={cn(dockButton, "hidden sm:inline-flex")} aria-label="Reading guides" aria-pressed={Boolean(profile.syllables || profile.letterGuide || profile.wordGuide || profile.plainLanguage)}>
                  <Icon icon={crosshair} width={19} height={19} aria-hidden className="icon-motion icon-lift" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  onSelect={() =>
                    afterMenu(() => {
                      const current = useAppStore.getState().profile;
                      setProfile({ ...current, syllables: !current.syllables });
                    })
                  }
                >
                  <SpellCheck size={14} className="icon-motion icon-lift" />
                  {profile.syllables ? "Syllables on" : "Syllables"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    afterMenu(() => {
                      const current = useAppStore.getState().profile;
                      setProfile({ ...current, letterGuide: !current.letterGuide });
                    })
                  }
                >
                  <BookOpenText size={14} className="icon-motion icon-lift" />
                  {profile.letterGuide ? "Letter guide on" : "Letter guide"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    afterMenu(() => {
                      const current = useAppStore.getState().profile;
                      setProfile({ ...current, wordGuide: !current.wordGuide });
                    })
                  }
                >
                  <Highlighter size={14} className="icon-motion icon-lift" />
                  {profile.wordGuide ? "Word highlight on" : "Word highlight"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    afterMenu(() => {
                      const current = useAppStore.getState().profile;
                      setProfile({ ...current, plainLanguage: !current.plainLanguage });
                    })
                  }
                >
                  <Languages size={14} className="icon-motion icon-lift" />
                  {profile.plainLanguage ? "Plain words on" : "Plain words"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    afterMenu(() => {
                      const current = useAppStore.getState().profile;
                      setProfile({ ...current, lookup: !current.lookup });
                    })
                  }
                >
                  <BookOpenText size={14} className="icon-motion icon-lift" />
                  {profile.lookup !== false ? "Definitions on" : "Tap for definition"}
                </DropdownMenuItem>
                {isSpeaking ? (
                  <DropdownMenuItem
                    onSelect={() => {
                      afterMenu(() => {
                        stopSpeech();
                        setIsSpeaking(false);
                        setIsPaused(false);
                        announce("Stopped listening");
                      });
                    }}
                  >
                    <VolumeX size={14} className="icon-motion icon-lift" />
                    Stop listening
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem
                  onSelect={() =>
                    afterMenu(() => {
                      const current = useAppStore.getState().profile;
                      setProfile({ ...current, dimChrome: !current.dimChrome });
                    })
                  }
                >
                  {profile.dimChrome ? "Chrome dimmed" : "Dim the chrome"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    afterMenu(() => {
                      setChunkOn((value) => !value);
                      setChunkIndex(0);
                    })
                  }
                >
                  {chunkOn ? "Exit chunks" : "Break into 3-minute chunks"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {/* Find and Highlights sit on the toolbar rather than in the
                overflow menu. Both are reached mid-read and often, and the menu
                had grown to nine items — long enough that scanning it costs
                more than the trip saves. */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className={dockButton}
                  onClick={() => setFindOpen(true)}
                  aria-label="Find in book"
                >
                  <Icon icon={magnifyingGlass} width={19} height={19} aria-hidden className="icon-motion icon-lift" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Find in book <Kbd>⌘F</Kbd>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className={dockButton}
                  onClick={() => setMarksOpen(true)}
                  disabled={bookHighlights.length === 0}
                  aria-label={`Highlights (${bookHighlights.length})`}
                >
                  <Icon icon={phHighlighter} width={19} height={19} aria-hidden className="icon-motion icon-lift" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {bookHighlights.length > 0
                  ? `Highlights · ${bookHighlights.length}`
                  : "No highlights yet"}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className={cn(dockButton, "hidden sm:inline-flex")}
                  onClick={() => setReconnectOpen((value) => !value)}
                  aria-label="Where was I"
                  aria-pressed={reconnectOpen}
                >
                  <Icon icon={compass} width={19} height={19} aria-hidden className="icon-motion icon-turn" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Where was I</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className={dockButton}
                  onClick={() => {
                    const was = bookmarked;
                    toggleBookmark();
                    toast.success(was ? "Bookmark removed" : `Saved at ${Math.round(useAppStore.getState().reading.progress * 100)}%`);
                  }}
                  aria-label={bookmarked ? "Remove bookmark" : "Bookmark this place"}
                  aria-pressed={bookmarked}
                >
                  <Icon
                    icon={bookmarked ? bookmarkSimpleFill : bookmarkSimple}
                    width={19}
                    height={19}
                    aria-hidden
                    className="icon-motion icon-rise"
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{bookmarked ? "Remove bookmark" : "Save this place"}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className={cn(dockButton, "hidden sm:inline-flex")}
                  onClick={toggleSpeech}
                  aria-label={isSpeaking && !isPaused ? "Pause listening" : isPaused ? "Resume listening" : "Listen"}
                  aria-pressed={isSpeaking}
                >
                  <IconSwap
                    active={isSpeaking && !isPaused}
                    ActiveIcon={PhPause}
                    InactiveIcon={isPaused ? PhPlay : PhSpeaker}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isSpeaking && !isPaused ? "Pause listening" : isPaused ? "Resume listening" : "Listen"}
              </TooltipContent>
            </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm"
                  className={dockButton} aria-label="More actions" aria-pressed={autoScrolling}>
                  <Icon icon={dotsThree} width={19} height={19} aria-hidden className="icon-motion icon-lift" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {/* The four controls the dock hides below `sm` reappear here, so
                    nothing is only reachable on a wide screen. */}
                <DropdownMenuItem
                  className="sm:hidden"
                  onSelect={() => afterMenu(toggleSpeech)}
                >
                  <Icon icon={isSpeaking && !isPaused ? phPause : speakerHigh} width={14} height={14} aria-hidden className="icon-motion icon-lift" />
                  {isSpeaking && !isPaused ? "Pause listening" : isPaused ? "Resume listening" : "Listen"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="sm:hidden"
                  onSelect={() => afterMenu(() => setReconnectOpen((value) => !value))}
                >
                  <Icon icon={compass} width={14} height={14} aria-hidden className="icon-motion icon-turn" />
                  Where was I
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="sm:hidden"
                  onSelect={() =>
                    afterMenu(() => {
                      const current = useAppStore.getState().profile;
                      setProfile({ ...current, plainLanguage: !current.plainLanguage });
                    })
                  }
                >
                  <Icon icon={translate} width={14} height={14} aria-hidden className="icon-motion icon-lift" />
                  {profile.plainLanguage ? "Plain words on" : "Plain words"}
                </DropdownMenuItem>
                {/* Reading guides is a nested menu on wide screens; nesting it
                    inside this one on a phone would be a menu in a menu, so its
                    toggles are listed flat instead. */}
                <DropdownMenuItem
                  className="sm:hidden"
                  onSelect={() =>
                    afterMenu(() => {
                      const current = useAppStore.getState().profile;
                      setProfile({ ...current, wordGuide: !current.wordGuide });
                    })
                  }
                >
                  <Icon icon={crosshair} width={14} height={14} aria-hidden className="icon-motion icon-lift" />
                  {profile.wordGuide ? "Word highlight on" : "Word highlight"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="sm:hidden"
                  onSelect={() =>
                    afterMenu(() => {
                      const current = useAppStore.getState().profile;
                      setProfile({ ...current, syllables: !current.syllables });
                    })
                  }
                >
                  <SpellCheck size={14} className="icon-motion icon-lift" />
                  {profile.syllables ? "Syllables on" : "Syllables"}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => afterMenu(toggleAutoScroll)}>
                  <ChevronsDown size={14} className="icon-motion icon-drop" />
                  {autoScrolling ? "Pause auto-scroll" : "Auto-scroll"}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => afterMenu(() => setRsvpOpen(true))}>
                  <Play size={14} className="icon-motion icon-lift" />
                  Speed reader
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => afterMenu(() => setSimplifyOpen(true))}>
                  <Languages size={14} className="icon-motion icon-lift" />
                  Rewrite this page
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    afterMenu(() => {
                      setCheckPicks([]);
                      setCheckOpen(true);
                    })
                  }
                  disabled={checkpoints.length === 0}
                >
                  <HelpCircle size={14} className="icon-motion icon-lift" />
                  Check understanding
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => afterMenu(() => setNoteOpen(true))}>
                  <StickyNote size={14} className="icon-motion icon-lift" />
                  Quick note
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    afterMenu(() => {
                      void copyReading(text, profile, targetWpm, readingTitle)
                        .then(() => toast.success("Copied with formatting"))
                        .catch(() => toast.error("Could not copy"));
                    })
                  }
                >
                  <Copy size={14} className="icon-motion icon-lift" />
                  Copy text
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    afterMenu(() => {
                      try {
                        downloadReading(text, profile, targetWpm, readingTitle);
                        toast.success("Downloaded with formatting");
                      } catch {
                        toast.error("Could not download");
                      }
                    })
                  }
                >
                  <Download size={14} className="icon-motion icon-drop" />
                  Download
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {paged || chaptered ? (
              <>
                <div className="mx-0.5 hidden h-5 w-px bg-fg/12 sm:block" aria-hidden />
                <ReaderPager
                  page={paged ? pdfPage : chapterIndex}
                  pageCount={paged ? pageCount : 0}
                  chapter={chapterIndex}
                  chapterCount={chapterCount}
                  chapters={chapters}
                  onPage={setPdfPage}
                  onChapter={setChapter}
                />
              </>
            ) : null}
            {chunkOn && chunks.length > 1 ? (
              <div className="mx-1 flex items-center gap-1 text-xs tabular-nums text-muted">
                <Button variant="ghost" size="icon-sm" disabled={chunkIndex <= 0} onClick={() => setChunkIndex((i) => Math.max(0, i - 1))} aria-label="Previous chunk">
                  <ChevronLeft size={16} className="icon-motion icon-shift-back" />
                </Button>
                <span>
                  {chunkIndex + 1}/{chunks.length}
                </span>
                <Button variant="ghost" size="icon-sm" disabled={chunkIndex >= chunks.length - 1} onClick={() => setChunkIndex((i) => Math.min(chunks.length - 1, i + 1))} aria-label="Next chunk">
                  <ChevronRight size={16} className="icon-motion icon-shift" />
                </Button>
              </div>
            ) : null}
            <ReaderProgress />
          </div>
        </div>
      </div>

      <SpeedReader open={rsvpOpen} onOpenChange={setRsvpOpen} words={words} onProgress={onRsvpProgress} />

      <Dialog open={simplifyOpen} onOpenChange={setSimplifyOpen}>
        <DialogContent>
          <DialogTitle className="mb-2 text-lg font-medium">Simpler wording</DialogTitle>
          <DialogDescription className="mb-4 text-sm text-muted">
            A local rewrite. Dense words become plainer ones. Nothing leaves this device.
          </DialogDescription>
          <p className="text-xs tracking-wide text-muted uppercase">
            {simplified.complexity} · grade {simplified.originalGrade}
            {simplified.simplifiedGrade !== simplified.originalGrade ? ` → ${simplified.simplifiedGrade}` : ""}
            {simplified.replacements > 0 ? ` · ${simplified.replacements} swap${simplified.replacements === 1 ? "" : "s"}` : ""}
          </p>
          <p className="mt-3 max-h-64 overflow-y-auto text-sm leading-relaxed">
            {simplified.simplified}
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setSimplifyOpen(false)}>
              Keep original
            </Button>
            <Button
              disabled={simplified.replacements === 0 && simplified.simplified === pageText.trim()}
              onClick={() => {
                tapFeedback("ok");
                if (paged) {
                  const next = [...pdfPages];
                  next[Math.max(0, pdfPage - 1)] = simplified.simplified;
                  startReading(joinPdfPages(next), { title: readingTitle, kind: "pdf", pdfPage });
                } else if (chaptered) {
                  const next = [...textChapters];
                  const index = Math.max(0, chapterIndex - 1);
                  if (next[index]) next[index] = { ...next[index], body: simplified.simplified };
                  startReading(joinTextChapters(next), { title: readingTitle, kind: "text", chapter: chapterIndex });
                } else {
                  startReading(simplified.simplified);
                }
                setSimplifyOpen(false);
                toast.success("Using the simpler version");
              }}
            >
              Use this version
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={checkOpen} onOpenChange={setCheckOpen}>
        <DialogContent>
          <DialogTitle className="mb-2 text-lg font-medium">Check understanding</DialogTitle>
          <DialogDescription className="mb-4 text-sm text-muted">
            Three gist questions from this page. Nothing is scored off this device.
          </DialogDescription>
          <div className="max-h-80 space-y-4 overflow-y-auto">
            {checkpoints.map((question, index) => (
              <fieldset key={question.id} className="space-y-1.5">
                <legend className="text-sm font-medium">{question.prompt}</legend>
                {question.options.map((option, optionIndex) => {
                  const picked = checkPicks[index];
                  const show = typeof picked === "number";
                  const right = optionIndex === question.answerIndex;
                  const selected = picked === optionIndex;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() =>
                        setCheckPicks((current) => {
                          const next = [...current];
                          next[index] = optionIndex;
                          return next;
                        })
                      }
                      className={cn(
                        "flex min-h-11 w-full rounded-md px-3 py-2 text-left text-sm",
                        selected ? "bg-fg text-primary-fg" : "bg-fg/4 hover:bg-fg/8",
                        show && right && !selected && "ring-1 ring-accent",
                      )}
                    >
                      {option}
                    </button>
                  );
                })}
              </fieldset>
            ))}
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCheckOpen(false)}>
              Close
            </Button>
            <Button
              disabled={checkPicks.filter((n) => typeof n === "number").length < checkpoints.length}
              onClick={() => {
                const results = checkpoints.map((question, index) => checkPicks[index] === question.answerIndex);
                const score = scoreComprehension(results);
                const pct = score == null ? 0 : Math.round(score * 100);
                toast.success(`${pct}% on this check`);
                setCheckOpen(false);
              }}
            >
              Score
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Highlights were write-only until now: they could be made, and never
          read back. Listing them here is the other half of the feature, and it
          is only possible because a highlight now carries its own text. */}
      <Dialog open={findOpen} onOpenChange={setFindOpen}>
        <DialogContent>
          <DialogTitle className="mb-3 text-lg font-medium">Find in book</DialogTitle>
          <DialogDescription className="sr-only">
            Search every chapter of this book and jump to a result.
          </DialogDescription>
          <Input
            autoFocus
            value={findQuery}
            onChange={(event) => setFindQuery(event.target.value)}
            placeholder="Search this book…"
            aria-label="Search this book"
            className="mb-3"
          />
          <p className="mb-2 text-xs text-muted" role="status">
            {findQuery.trim().length < 2
              ? "Type at least two characters."
              : findHits.length === 0
                ? "No matches."
                : `${findHits.length}${findHits.length === 200 ? "+" : ""} match${findHits.length === 1 ? "" : "es"}`}
          </p>
          <div className="max-h-[52vh] space-y-1.5 overflow-y-auto">
            {findHits.map((hit) => (
              <button
                key={`${hit.section}:${hit.lineIdx}:${hit.start}`}
                type="button"
                className="icon-group flex w-full flex-col items-start gap-1 rounded-md bg-bg px-3 py-2.5 text-left shadow-border transition-[box-shadow,transform] duration-[150ms] ease-[var(--ease-out)] hover:shadow-border-hover active:scale-[0.99]"
                onClick={() => {
                  setFindOpen(false);
                  jumpTo(hit.section, hit.lineIdx);
                }}
              >
                <span className="line-clamp-2 text-sm leading-relaxed">
                  {hit.text.slice(0, hit.start)}
                  <mark className="rounded-xs bg-accent/25 text-fg">
                    {hit.text.slice(hit.start, hit.end)}
                  </mark>
                  {hit.text.slice(hit.end)}
                </span>
                {searchSections.length > 1 ? (
                  <span className="text-xs text-muted">
                    {chapters[Math.max(0, hit.section - 1)]?.title ??
                      (paged ? `Page ${hit.section}` : `Part ${hit.section}`)}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={marksOpen} onOpenChange={setMarksOpen}>
        <DialogContent>
          <DialogTitle className="mb-3 text-lg font-medium">Highlights</DialogTitle>
          <DialogDescription className="mb-3 text-sm text-muted">
            {bookHighlights.length} in {readingTitle}. Select one to jump to it.
          </DialogDescription>
          {bookHighlights.length > 0 ? (
            <div className="mb-3 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // Only this book: exporting a whole library from a panel
                  // titled with one book's name would be a surprise. The
                  // everything-file lives in Settings, where it reads as backup.
                  exportHighlights({ [markKey]: bookHighlights }, () => readingTitle);
                  feedback("good", { message: "Highlights exported" });
                }}
              >
                Export as Markdown
              </Button>
            </div>
          ) : null}
          <div className="max-h-[60vh] space-y-1.5 overflow-y-auto">
            {[...bookHighlights]
              .sort((a, b) => a.section - b.section || a.lineIdx - b.lineIdx || a.start - b.start)
              .map((mark) => {

                return (
                  <div
                    key={`${mark.section}:${mark.lineIdx}:${mark.start}`}
                    className="relative rounded-md bg-bg px-3 py-2.5 shadow-border"
                  >
                    <button
                      type="button"
                      className="icon-group flex w-full flex-col items-start gap-1 text-left"
                      onClick={() => {
                        setMarksOpen(false);
                        jumpTo(mark.section, mark.lineIdx);
                      }}
                    >
                      <span className="line-clamp-3 pr-7 text-sm leading-relaxed">{mark.text}</span>
                      <span className="text-xs text-muted">
                        {chaptered || paged
                          ? (chapters[Math.max(0, mark.section - 1)]?.title ??
                            (paged ? `Page ${mark.section}` : `Part ${mark.section}`))
                          : new Date(mark.at).toLocaleDateString()}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove highlight: ${mark.text.slice(0, 50)}`}
                      className="icon-group absolute top-1.5 right-1.5 rounded-sm p-1.5 text-subtle transition-colors hover:bg-fg/6 hover:text-fg"
                      onClick={() => {
                        removeHighlight(mark.lineIdx, mark.section, mark.start);
                        feedback("bad", { message: "Highlight removed" });
                      }}
                    >
                      <Icon icon={phX} width={13} height={13} aria-hidden className="icon-motion icon-turn" />
                    </button>
                    {/* A note belongs to the passage, not to the session — the
                        existing Quick note is one field for the whole sitting,
                        which cannot say *which* sentence prompted the thought. */}
                    <Textarea
                      defaultValue={mark.note ?? ""}
                      placeholder="Add a note…"
                      aria-label={`Note on: ${mark.text.slice(0, 60)}`}
                      rows={mark.note ? 2 : 1}
                      onBlur={(event) => {
                        if (event.target.value.trim() === (mark.note ?? "")) return;
                        annotateHighlight(mark.lineIdx, mark.section, mark.start, event.target.value);
                      }}
                      className="mt-2 min-h-9 w-full resize-y rounded-sm bg-surface px-2 py-1.5 text-xs leading-relaxed"
                    />
                  </div>
                );
              })}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent>
          <DialogTitle className="mb-3 text-lg font-medium">Quick note</DialogTitle>
          <DialogDescription className="mb-4 text-sm text-muted">
            Saved to this session on this device.
          </DialogDescription>
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Capture a thought while you read…"
            aria-label="Quick note"
            className="min-h-40 rounded-md bg-bg px-3 py-2 shadow-border"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReaderProgress() {
  const progress = useAppStore((s) => s.reading.progress);
  const pct = Math.round(progress * 100);
  return (
    <>
      <span className="px-1.5 text-xs tabular-nums text-muted sm:hidden">{pct}%</span>
      <div className="mx-2 hidden w-20 sm:block">
        <Progress value={pct} label="Reading progress" />
      </div>
      <span className="hidden pr-2 text-xs tabular-nums text-muted sm:inline">{pct}%</span>
    </>
  );
}

function ReaderLiveStats({
  autoScrolling,
  targetWpm,
}: {
  autoScrolling: boolean;
  targetWpm: number;
}) {
  const currentWpm = useAppStore((s) => s.reading.currentWpm);
  const pauses = useAppStore((s) => s.reading.pauses.length);
  const rereads = useAppStore((s) => s.reading.rereads.length);
  const dwells = useAppStore((s) => s.reading.dwellCount);
  return (
    <>
      {pauses > 0 ? ` ${pauses} pause${pauses === 1 ? "" : "s"}.` : ""}
      {rereads > 0 ? ` ${rereads} reread${rereads === 1 ? "" : "s"}.` : ""}
      {dwells > 0 ? ` ${dwells} line${dwells === 1 ? "" : "s"} held.` : ""}
      {autoScrolling ? ` Auto-scrolling at ${targetWpm} words per minute.` : ""}
      {currentWpm ? ` Current pace ${currentWpm} words per minute.` : ""}
    </>
  );
}

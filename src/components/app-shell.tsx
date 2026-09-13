import { lazy, Suspense, useEffect, useRef, type ComponentType, type ReactNode } from "react";
import { Toaster } from "sonner";
import { Icon } from "@iconify/react";
import { magnifyingGlass } from "@/lib/ph-icons";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { TABS, type TabId } from "@/lib/types";
import { isDarkScheme } from "@/lib/scheme";
import { CVD_LABELS } from "@/lib/color-vision";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/surfaces";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Landing } from "@/components/landing";
import { Mark } from "@/components/mark";
import { Segmented } from "@/components/segmented";
import { NavMenu } from "@/components/nav-menu";
import { GlassHeader } from "@/components/glass-header";
import { Neuro } from "@/components/neuro";
import { MotionCues } from "@/components/motion-cues";
import { OfflineReady } from "@/components/offline-ready";
import { LiveAnnouncer } from "@/components/live-announcer";
import { FontLoader } from "@/components/font-loader";
import { LensLoader } from "@/components/ui/loader";
import { friendlyViewError, isStaleChunkError, reloadView, TabErrorBoundary } from "@/lib/error-component";
import { cn } from "@/lib/utils";
import { Reader } from "@/components/reader";

function lazyView(load: () => Promise<Record<string, ComponentType<any>>>, exportName: string) {
  return lazy(async () => {
    const open = async () => {
      const mod = await load();
      const Comp = mod[exportName];
      if (!Comp) throw new Error("Could not open this view.");
      return { default: Comp };
    };
    try {
      return await open();
    } catch (error) {
      await new Promise((resolve) => window.setTimeout(resolve, 160));
      try {
        return await open();
      } catch (retryError) {
        if (isStaleChunkError(retryError) || isStaleChunkError(error)) reloadView(exportName);
        const message = friendlyViewError(retryError);
        return {
          default: function ViewLoadError() {
            return (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                <p className="max-w-sm text-sm text-pretty text-muted">{message}</p>
                <button
                  type="button"
                  className="h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-fg"
                  onClick={() => window.location.reload()}
                >
                  Reload
                </button>
              </div>
            );
          },
        };
      }
    }
  });
}

const Library = lazyView(() => import("@/components/library"), "Library");
const Insights = lazyView(() => import("@/components/insights"), "Insights");
const SettingsPanel = lazyView(() => import("@/components/settings-panel"), "SettingsPanel");
const CommandPalette = lazy(async () => {
  try {
    const mod = await import("@/components/command-palette");
    return { default: mod.CommandPalette };
  } catch {
    return { default: function PaletteUnavailable() {
      return null;
    } };
  }
});

const HAS_SCROLL_TIMELINE =
  typeof CSS !== "undefined" && CSS.supports("animation-timeline: scroll()");

/**
 * Flag whether the active pane has moved off its top.
 *
 * The header carries no seam until something is actually behind it — an edge
 * that appears on first scroll and dissolves on the way back. Guarded so the
 * attribute is only touched when the boolean flips, not on every frame.
 */
let lastScrolled = false;
function markScrolled(scrolled: boolean) {
  if (scrolled === lastScrolled) return;
  lastScrolled = scrolled;
  document.documentElement.dataset.scrolled = scrolled ? "true" : "false";
}

function Pane({
  children,
  className,
  onProgress,
}: {
  children: ReactNode;
  className?: string;
  onProgress?: (value: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      className={cn("pane-scroll h-full overflow-y-auto", className)}
      onScroll={() => {
        const node = ref.current;
        if (!node) return;
        // Written to the DOM rather than React state: this fires on every
        // scroll frame and the header only needs the boolean.
        markScrolled(node.scrollTop > 4);
        if (HAS_SCROLL_TIMELINE) return;
        if (!onProgress) return;
        const remaining = node.scrollHeight - node.clientHeight;
        onProgress(remaining > 1 ? Math.min(1, node.scrollTop / remaining) : 1);
      }}
    >
      <div className="min-h-full pt-14 sm:pt-16">{children}</div>
    </div>
  );
}

function TabFallback() {
  return (
    <div className="flex h-full items-center justify-center pt-14">
      <LensLoader label="Loading" />
    </div>
  );
}

export function AppShell() {
  const hydrate = useAppStore((s) => s.hydrate);
  const tab = useAppStore((s) => s.tab);
  const direction = useAppStore((s) => s.direction);
  const setTab = useAppStore((s) => s.setTab);
  const text = useAppStore((s) => s.text);
  const setCommandOpen = useAppStore((s) => s.setCommandOpen);
  const theme = useAppStore((s) => s.profile.theme);
  const dimChrome = useAppStore((s) => s.profile.dimChrome);
  const motionCues = useAppStore((s) => s.profile.motionCues);
  const cvdPreview = useAppStore((s) => s.cvdPreview);
  const setCvdPreview = useAppStore((s) => s.setCvdPreview);
  const progressRef = useRef(0);
  const navigate = useNavigate();
  const urlView = useSearch({ from: "/", select: (search) => search.view });

  /**
   * Keep the URL and the store's tab in step, in both directions.
   *
   * This has to be one effect, not two. Two effects run in the same commit and
   * each sees the other's value pre-update: the URL->store one queues setTab
   * while the store->URL one still reads the old tab and navigates straight
   * back, so a deep link ping-pongs forever. `lastSynced` records the value the
   * two sides last agreed on, which is enough to tell which one actually moved
   * and therefore which one to follow.
   *
   * Store->URL is driven off `tab` rather than off setTab because some moves
   * (startReading) change the tab from inside the store, and those deserve a
   * history entry too. It pushes, so Back returns to the previous view instead
   * of leaving the app.
   */
  // Seeded from the store, not the URL: on a deep link the URL is the side that
  // has moved away from the store's default, and seeding it from the URL would
  // make both sides look agreed so the default would win and overwrite the link.
  const lastSynced = useRef<TabId>(tab);
  useEffect(() => {
    // The query string is untrusted input, so it is re-checked here rather than
    // trusting validateSearch alone: feeding an unknown id into setTab renders
    // an app shell with no matching view inside it — chrome, and nothing else.
    const raw = urlView;
    const valid = typeof raw === "string" && TABS.some((item) => item.id === raw);
    const url: TabId = valid ? (raw as TabId) : "explore";
    if (raw !== undefined && !valid) {
      // Drop the junk so the address bar stops advertising a broken link.
      void navigate({ to: "/", search: {}, replace: true });
      return;
    }
    if (url === tab) {
      lastSynced.current = tab;
      return;
    }
    if (url !== lastSynced.current) {
      lastSynced.current = url;
      setTab(url);
      return;
    }
    lastSynced.current = tab;
    void navigate({ to: "/", search: tab === "explore" ? {} : { view: tab } });
  }, [tab, urlView, setTab, navigate]);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Mirrored onto the document so the motion-cue rules can reach parallax and
  // scroll-linked layers wherever they are, without every one of them having to
  // subscribe to the profile.
  useEffect(() => {
    document.documentElement.dataset.motionCues = motionCues ? "true" : "false";
  }, [motionCues]);

  useEffect(() => {
    const stopNav = (event: DragEvent) => {
      if (!event.dataTransfer || ![...event.dataTransfer.types].includes("Files")) return;
      event.preventDefault();
    };
    window.addEventListener("dragover", stopNav);
    window.addEventListener("drop", stopNav);
    return () => {
      window.removeEventListener("dragover", stopNav);
      window.removeEventListener("drop", stopNav);
    };
  }, []);

  useEffect(() => {
    const label = TABS.find((item) => item.id === tab)?.label ?? "Explore";
    document.title = tab === "explore" ? "NeuroLens" : `${label} · NeuroLens`;
  }, [tab]);

  useEffect(() => {
    progressRef.current = 0;
    document.documentElement.style.setProperty("--scroll-progress", "0");
    // A new pane mounts at its top and fires no scroll event, so the seam has
    // to be cleared here or it would linger from the previous tab.
    markScrolled(false);
  }, [tab]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(!useAppStore.getState().commandOpen);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [setCommandOpen]);

  const toastTheme = isDarkScheme(theme) ? "dark" : "light";

  function setProgress(value: number) {
    progressRef.current = value;
    if (HAS_SCROLL_TIMELINE) return;
    document.documentElement.style.setProperty("--scroll-progress", String(value));
  }

  const reading = tab === "read";

  return (
    <TooltipProvider>
      <div
        className={cn(
          "nl-shell relative flex h-dvh flex-col overflow-hidden bg-bg text-fg",
          reading && "is-reading",
          reading && dimChrome && "is-reading-dim",
        )}
      >
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <div className="grain" aria-hidden="true" />
        <header className="nl-chrome-in pointer-events-none absolute inset-x-0 top-0 z-40">
          <GlassHeader>
          <div className="pointer-events-auto flex h-14 items-center gap-1.5 px-2 sm:h-16 sm:gap-2 sm:px-6">
            <button
              type="button"
              aria-label="NeuroLens home"
              className="icon-group flex shrink-0 items-center gap-2.5 text-fg"
              onClick={() => setTab("explore")}
            >
              {/* Keyed on the tab so a switch remounts the mark and replays the
                  dilation — the eye reacting to the view changing under it. */}
              <Mark key={tab} detail className="size-9 text-fg sm:size-10" />
              <span className="hidden text-sm font-medium tracking-tight sm:inline">NeuroLens</span>
            </button>
            {/* Below `lg` the segmented control does not fit, so navigation
                moves into the menu button and the header states where you are. */}
            <p
              key={tab}
              className="nl-title-swap min-w-0 flex-1 truncate text-sm font-medium tracking-tight lg:hidden"
            >
              {TABS.find((item) => item.id === tab)?.label ?? "Explore"}
            </p>
            <nav
              aria-label="Primary"
              className="hidden min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] lg:block [&::-webkit-scrollbar]:hidden"
            >
              <Segmented
                tone="nav"
                value={tab}
                onChange={setTab}
                options={TABS.map((item) => ({
                  id: item.id,
                  label: item.label,
                  disabled: item.id === "read" && !text,
                  // A greyed-out tab that does nothing when clicked teaches
                  // nothing. Saying what is missing is the whole fix.
                  disabledReason:
                    item.id === "read" && !text
                      ? "Open a book or paste some text first"
                      : undefined,
                }))}
                className="mx-auto h-10 w-max max-w-full"
              />
            </nav>
            {cvdPreview !== "none" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="hidden sm:inline-flex"
                aria-label={`Turn off ${CVD_LABELS[cvdPreview]} simulation`}
                onClick={() => setCvdPreview("none")}
              >
                {CVD_LABELS[cvdPreview]}
              </Button>
            )}
            {reading ? null : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="hidden lg:inline-flex"
                  onClick={() => setCommandOpen(true)}
                >
                  <Icon icon={magnifyingGlass} width={14} height={14} aria-hidden className="icon-motion icon-lift" />
                  Search
                  <Kbd>⌘K</Kbd>
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="lg:hidden"
                  aria-label="Search"
                  onClick={() => setCommandOpen(true)}
                >
                  <Icon icon={magnifyingGlass} width={16} height={16} aria-hidden className="icon-motion icon-lift" />
                </Button>
              </>
            )}
            <NavMenu />
          </div>
          </GlassHeader>
          <div aria-hidden className="scroll-progress pointer-events-none h-0.5 bg-fg/35" />
          <div
            aria-hidden
            className="nl-scroll-edge pointer-events-none h-6 bg-gradient-to-b from-bg/80 to-transparent"
          />
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          aria-label={TABS.find((item) => item.id === tab)?.label ?? "Explore"}
          className="relative min-h-0 flex-1 outline-none"
        >
          <div
            key={tab}
            className="nl-stage-in absolute inset-0 overflow-hidden"
            data-dir={direction >= 0 ? "1" : "-1"}
          >
            {tab === "explore" && (
              <Pane onProgress={setProgress}>
                <Landing />
              </Pane>
            )}
            {tab === "read" && (
              <TabErrorBoundary slot="reader">
                <Reader />
              </TabErrorBoundary>
            )}
            {tab === "library" && (
              <Pane onProgress={setProgress}>
                <TabErrorBoundary slot="library">
                  <Suspense fallback={<TabFallback />}>
                    <Library className="icon-motion icon-lift" />
                  </Suspense>
                </TabErrorBoundary>
              </Pane>
            )}
            {tab === "insights" && (
              <Pane onProgress={setProgress}>
                <TabErrorBoundary slot="insights">
                  <Suspense fallback={<TabFallback />}>
                    <Insights />
                  </Suspense>
                </TabErrorBoundary>
              </Pane>
            )}
            {tab === "settings" && (
              <Pane onProgress={setProgress}>
                <TabErrorBoundary slot="settings">
                  <Suspense fallback={<TabFallback />}>
                    <SettingsPanel />
                  </Suspense>
                </TabErrorBoundary>
              </Pane>
            )}
          </div>
        </main>

        {/* On mobile the footer sits directly above the TabBar, so it collapses
            to a single compact row — the tagline goes, the legal links stay. */}
        {reading ? null : (
          <footer className="nl-footer-in flex shrink-0 flex-row items-center justify-center gap-3 px-4 py-2 text-center text-xs text-muted sm:min-h-12 sm:gap-4 sm:py-3">
            <span className="hidden sm:inline">NeuroLens · Crafted for neurodivergent minds</span>
            <span className="hidden opacity-40 sm:inline" aria-hidden>
              ·
            </span>
            <nav aria-label="Legal" className="flex items-center gap-3">
              <Link to="/privacy" className="hover:text-fg">
                Privacy
              </Link>
              <Link to="/thank-you" className="hover:text-fg">
                Thank you
              </Link>
            </nav>
          </footer>
        )}
        <MotionCues />
        <Neuro />
        <LiveAnnouncer />
        <FontLoader />
        <OfflineReady />
        <Suspense fallback={null}>
          <CommandPalette />
        </Suspense>
        <Toaster
          theme={toastTheme}
          position="bottom-right"
          offset={24}
          mobileOffset={16}
          visibleToasts={3}
          gap={10}
          toastOptions={{
            classNames: {
              toast: "!bg-surface !text-fg !border-0 !shadow-[var(--shadow-float)] !rounded-[16px]",
              title: "!text-sm !font-medium !text-fg",
              description: "!text-sm !text-muted",
            },
          }}
        />
      </div>
    </TooltipProvider>
  );
}

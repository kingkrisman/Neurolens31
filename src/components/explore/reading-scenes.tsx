import { useEffect, useRef, type CSSProperties } from "react";
import { ChevronRight } from "lucide-react";
import { AmbientVideo } from "@/components/explore/ambient-video";

/**
 * "Wherever you read": a row of short clips that slides sideways while the
 * section is pinned, as the visitor scrolls down.
 *
 * All of the motion is CSS. The section is a tall box with a sticky frame
 * inside it, and the row's `transform` is an animation whose timeline is the
 * section's own progress through the scroller (`view-timeline`). The browser
 * runs that on the compositor, so the slide stays smooth even while React or a
 * video is busy — there is no scroll listener here at all.
 *
 * Where scroll-driven animations are not supported, or the reader asked for
 * less motion, none of that applies: the section is its natural height and
 * the row is an ordinary horizontal scroller with snap points.
 *
 * The one thing JavaScript does is tell the CSS how tall the scroller is. The
 * app scrolls inside a pane under a header and above a footer, so `100svh`
 * would be taller than the space the frame is pinned in.
 */

const SCENES = [
  {
    video: "scene-desk",
    title: "At a desk, for class",
    text: "Academic mode sets a steady serif page for long, dense chapters, with a quick recall at the end of each.",
  },
  {
    video: "scene-window",
    title: "By a window, for the story",
    text: "Turn pages like an e-reader, or scroll. Your place is kept either way.",
  },
  {
    video: "scene-line",
    title: "One line at a time",
    text: "A reading band holds your place, so looking away does not cost you the paragraph.",
  },
  {
    video: "scene-night",
    title: "Late, when attention is thin",
    text: "Dark palettes, larger type, and Neuro kept still while you read.",
  },
  {
    video: "scene-shelves",
    title: "From a whole library",
    text: "Classics, the Bible, poetry, your own PDFs, EPUBs and documents, and your Kindle highlights.",
  },
] as const;

export function ReadingScenes() {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = ref.current;
    const pane = section?.closest(".pane-scroll");
    if (!section || !(pane instanceof HTMLElement)) return;
    const apply = () => section.style.setProperty("--pane-h", `${pane.clientHeight}px`);
    apply();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(apply);
    observer.observe(pane);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      id="scenes"
      aria-labelledby="scenes-title"
      className="scenes mt-24"
      style={{ "--scene-count": SCENES.length + 1 } as CSSProperties}
    >
      <div className="scenes-pin">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-xl">
            <p className="mb-3 font-serif text-base text-accent italic">Wherever you read</p>
            <h2 id="scenes-title" className="text-4xl text-balance sm:text-5xl">
              Same reader, different rooms.
            </h2>
          </div>
          <div className="scenes-progress" aria-hidden>
            <i />
          </div>
        </div>

        <div className="scenes-window mt-8">
          <ul className="scenes-track">
            {SCENES.map((scene) => (
              <li key={scene.video} className="scenes-card">
                <div className="relative overflow-hidden rounded-xl bg-fg/10 shadow-border">
                  <AmbientVideo
                    src={`/videos/${scene.video}.mp4`}
                    poster={`/videos/${scene.video}.jpg`}
                    className="aspect-3/4 w-full"
                  />
                  <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/10 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-4 text-white sm:p-5">
                    <h3 className="font-serif text-xl leading-snug sm:text-2xl">{scene.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-white/80">{scene.text}</p>
                  </div>
                </div>
              </li>
            ))}
            <li className="scenes-card scenes-end">
              <div className="flex aspect-3/4 flex-col justify-end rounded-xl bg-surface p-5 shadow-border">
                <p className="font-serif text-sm text-accent italic">Your turn</p>
                <p className="mt-2 font-serif text-2xl leading-snug">
                  Bring a chapter, an article, or a whole book.
                </p>
                <a
                  href="#reader-start"
                  className="mt-5 inline-flex h-11 w-max items-center gap-1 rounded-md bg-primary pr-3.5 pl-4 text-sm font-medium text-primary-fg transition-transform duration-150 ease-out active:scale-[0.97]"
                >
                  Start reading <ChevronRight size={16} className="icon-motion icon-shift" />
                </a>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}

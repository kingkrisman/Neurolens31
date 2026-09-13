import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { hasPdfDocument, renderPdfPage } from "@/lib/pdf-session";
import { easeOut, gsap, registerGsap, useGSAP } from "@/lib/gsap";
import { cn } from "@/lib/utils";
import type { ChapterSpan } from "@/lib/chapters";
import { useInView } from "@/lib/use-in-view";

registerGsap();

export function PdfPageCanvas({ page }: { page: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inView = useInView(wrapRef, { rootMargin: "120px 0px" });
  const [status, setStatus] = useState<"idle" | "ready" | "missing">("idle");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!inView) return;
    if (!canvas || !hasPdfDocument()) {
      setStatus("missing");
      return;
    }
    let cancelled = false;
    setStatus("idle");
    const context = canvas.getContext("2d");
    context?.clearRect(0, 0, canvas.width, canvas.height);
    const width = Math.min(520, canvas.parentElement?.clientWidth || 520);
    void renderPdfPage(page, canvas, width)
      .then((ok) => {
        if (!cancelled) setStatus(ok ? "ready" : "missing");
      })
      .catch(() => {
        if (!cancelled) setStatus("missing");
      });
    return () => {
      cancelled = true;
    };
  }, [page, inView]);

  useGSAP(
    () => {
      const wrap = wrapRef.current;
      if (!wrap || status !== "ready") return;
      gsap.fromTo(wrap, { opacity: 0.55, y: 10 }, { opacity: 1, y: 0, duration: 0.32, ease: easeOut });
    },
    { dependencies: [page, status] },
  );

  if (status === "missing" && !hasPdfDocument()) return null;

  return (
    <div ref={wrapRef} className="pdf-page-preview mb-8 overflow-hidden rounded-lg bg-surface shadow-border">
      <canvas
        key={page}
        ref={canvasRef}
        className={cn("mx-auto block h-auto w-full bg-bg", status !== "ready" && "min-h-40")}
        aria-label={`PDF page ${page}`}
      />
    </div>
  );
}

export function ReaderPager({
  page,
  pageCount,
  chapter,
  chapterCount,
  chapters,
  onPage,
  onChapter,
}: {
  page: number;
  pageCount: number;
  chapter: number;
  chapterCount: number;
  chapters: ChapterSpan[];
  onPage: (page: number) => void;
  onChapter: (chapter: number) => void;
}) {
  const hasChapters = chapterCount > 1;
  const current = hasChapters ? chapters[Math.max(0, chapter - 1)] : null;
  const label = hasChapters
    ? chapter < 1
      ? "Opening"
      : current?.title.replace(/^Chapter\s+/i, "Ch. ") || `Chapter ${chapter}`
    : pageCount > 1
      ? `${page} / ${pageCount}`
      : "";

  if (!hasChapters && pageCount <= 1) return null;

  const prev = () => (hasChapters ? onChapter(chapter < 1 ? 1 : chapter - 1) : onPage(page - 1));
  const next = () => (hasChapters ? onChapter(chapter < 1 ? 1 : chapter + 1) : onPage(page + 1));
  const prevDisabled = hasChapters ? chapter <= 1 : page <= 1;
  const nextDisabled = hasChapters ? chapter >= chapterCount : page >= pageCount;

  return (
    <div className="flex items-center gap-0.5" role="navigation" aria-label={hasChapters ? "Chapters" : "Pages"}>
      <Button variant="ghost" size="icon-sm" onClick={prev} disabled={prevDisabled} aria-label={hasChapters ? "Previous chapter" : "Previous page"}>
        <ChevronLeft size={16} className="icon-motion icon-shift-back" />
      </Button>
      {hasChapters ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-9 max-w-36 min-w-0 gap-1 px-2 text-xs font-medium">
              <span className="truncate">{label}</span>
              <ChevronDown size={12} className="shrink-0 opacity-60 icon-motion icon-drop" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="center" className="max-h-72 w-64 overflow-y-auto p-1">
            {chapters.map((item, index) => {
              const active = index + 1 === chapter;
              return (
                <DropdownMenuItem
                  key={`${item.startPage}-${item.title}`}
                  onSelect={() => onChapter(index + 1)}
                  className={cn("justify-between", active && "bg-fg/6")}
                >
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  {active ? <Check size={14} className="shrink-0 icon-motion icon-lift" /> : null}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <p className="min-w-12 px-1 text-center text-xs tabular-nums text-muted">{label}</p>
      )}
      <Button variant="ghost" size="icon-sm" onClick={next} disabled={nextDisabled} aria-label={hasChapters ? "Next chapter" : "Next page"}>
        <ChevronRight size={16} className="icon-motion icon-shift" />
      </Button>
      {hasChapters && pageCount > 1 ? (
        <p className="hidden px-1 text-[11px] tabular-nums text-subtle sm:block">
          {page}/{pageCount}
        </p>
      ) : null}
    </div>
  );
}

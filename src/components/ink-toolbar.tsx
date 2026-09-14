import { Eraser, PenLine, Pencil, Highlighter, Undo2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { INK_COLORS, INK_TOOLS, type InkToolId, inkColorById } from "@/lib/ink";
import { cn } from "@/lib/utils";

const TOOL_ICON: Record<InkToolId, typeof PenLine> = {
  pen: PenLine,
  marker: Highlighter,
  pencil: Pencil,
  eraser: Eraser,
};

/**
 * The tool tray.
 *
 * Sits apart from the reading dock rather than inside it, because the dock is
 * for reading and this is for drawing — and because a tray that appears only
 * while annotating is one fewer permanent thing on a page whose whole argument
 * is that fewer things on the page is better.
 *
 * Tools first, then colours, then the two destructive actions, in the order a
 * hand reaches for them. Undo is next to the colours rather than at the far
 * edge: it is the control used most after the tools themselves.
 */
export function InkToolbar({
  tool,
  color,
  onTool,
  onColor,
  onUndo,
  onClear,
  onClose,
  canUndo,
  hasInk,
}: {
  tool: InkToolId;
  color: string;
  onTool: (tool: InkToolId) => void;
  onColor: (color: string) => void;
  onUndo: () => void;
  onClear: () => void;
  onClose: () => void;
  canUndo: boolean;
  hasInk: boolean;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Drawing tools"
      className={cn(
        "pointer-events-auto flex max-w-[calc(100vw-2rem)] flex-wrap items-center justify-center gap-x-1 gap-y-2",
        "rounded-2xl bg-surface/95 px-2.5 py-2 shadow-float backdrop-blur-sm",
      )}
    >
      <div className="flex items-center gap-0.5">
        {INK_TOOLS.map((item) => {
          const Glyph = TOOL_ICON[item.id];
          const active = item.id === tool;
          return (
            <Button
              key={item.id}
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={item.label}
              aria-pressed={active}
              title={item.label}
              onClick={() => onTool(item.id)}
              className={cn("size-10 min-h-10 sm:size-9 sm:min-h-9", active && "bg-fg/8 text-fg")}
            >
              <Glyph size={17} className="icon-motion icon-lift" />
            </Button>
          );
        })}
      </div>

      <span aria-hidden className="mx-1 h-6 w-px bg-fg/12" />

      {/* Colour is meaningless for the eraser, so it goes quiet rather than
          disappearing — a row that changes width as tools are tapped makes the
          buttons move under the reader's finger. */}
      <div
        className={cn(
          "flex items-center gap-1 transition-opacity duration-[150ms]",
          tool === "eraser" && "pointer-events-none opacity-35",
        )}
        role="radiogroup"
        aria-label="Ink colour"
      >
        {INK_COLORS.map((item) => {
          const active = item.id === inkColorById(color).id;
          return (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={item.label}
              title={item.label}
              onClick={() => onColor(item.id)}
              className={cn(
                "size-6 shrink-0 rounded-full transition-transform duration-[150ms] ease-[var(--ease-standard)]",
                "hover:scale-110 active:scale-95",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
                active && "ring-2 ring-fg ring-offset-2 ring-offset-surface",
              )}
              style={{ backgroundColor: item.hex }}
            />
          );
        })}
      </div>

      <span aria-hidden className="mx-1 h-6 w-px bg-fg/12" />

      <div className="flex items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="Undo last stroke"
          title="Undo"
          className="size-10 min-h-10 sm:size-9 sm:min-h-9"
        >
          <Undo2 size={16} className="icon-motion icon-shift-back" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onClear}
          disabled={!hasInk}
          aria-label="Erase everything on this page"
          title="Clear page"
          className="size-10 min-h-10 sm:size-9 sm:min-h-9"
        >
          <Trash2 size={16} className="icon-motion icon-lift" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Done drawing"
          title="Done"
          className="size-10 min-h-10 sm:size-9 sm:min-h-9"
        >
          <X size={16} className="icon-motion icon-turn" />
        </Button>
      </div>
    </div>
  );
}

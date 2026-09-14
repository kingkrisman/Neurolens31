import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LensLoader } from "@/components/ui/loader";
import { cn } from "@/lib/utils";

/**
 * What the picker will offer.
 *
 * iOS resolves each token to a UTI and greys out every file it cannot map, so
 * `text/markdown` — which has no UTI — could leave a phone showing a Files
 * browser where nothing is selectable. Extensions first, because a phone often
 * reports no MIME type at all; then the types iOS does know; then `text/*` as
 * the catch-all.
 *
 * This list only decides what can be tapped. The processor decides what can be
 * read, and it will try an unfamiliar extension as text rather than refuse it
 * outright — so a file missing from here is still worth dragging in.
 */
const ACCEPT = [
  // Extensions first: a phone often reports no MIME type for a file picked
  // out of Files, and the extension is then the only thing to match on.
  ".pdf,.epub,.docx,.rtf,.html,.htm,.xhtml",
  ".txt,.text,.md,.markdown,.rst,.org,.tex,.log,.csv,.tsv,.json,.yaml,.yml,.srt,.vtt",
  // Then the MIME types iOS can actually map to a UTI.
  "application/pdf,application/epub+zip,application/rtf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/html,text/plain,text/*",
].join(",");

export function FileDrop({
  onFile,
  busy = false,
  busyLabel,
  compact = false,
  children,
}: {
  onFile: (file: File) => void;
  busy?: boolean;
  /**
   * What the wait is for, while it is happening.
   *
   * A long book can take a minute on a phone, and a spinner that says only
   * "Parsing" for that long is indistinguishable from one that has hung —
   * which is how a working upload gets reported as a broken one.
   */
  busyLabel?: string;
  compact?: boolean;
  children?: ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  function take(file: File | undefined) {
    if (!file || busy) return;
    onFile(file);
  }

  function onDrag(event: DragEvent) {
    if (!event.dataTransfer || ![...event.dataTransfer.types].includes("Files")) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setOver(true);
  }

  function onLeave(event: DragEvent) {
    event.preventDefault();
    setOver(false);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    setOver(false);
    take(event.dataTransfer.files?.[0]);
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
        suppressHydrationWarning
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.currentTarget.value = "";
          take(file);
        }}
      />
      {compact ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="pl-3 pr-2.5"
          disabled={busy}
          aria-busy={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? (
            <LensLoader label={busyLabel ?? "Parsing"} />
          ) : (
            <>
              <Upload size={14} className="icon-motion icon-rise" />
              Upload
            </>
          )}
        </Button>
      ) : (
        <button
          type="button"
          disabled={busy}
          aria-busy={busy}
          aria-label="Upload a PDF or text file"
          onClick={() => inputRef.current?.click()}
          onDragEnter={onDrag}
          onDragOver={onDrag}
          onDragLeave={onLeave}
          onDrop={onDrop}
          className={cn(
            "flex h-24 w-full cursor-pointer items-center justify-center rounded-xl bg-surface text-sm shadow-border",
            over && "bg-fg/6",
          )}
        >
          {busy ? (
            <LensLoader label={busyLabel ?? "Parsing"} />
          ) : (
            children ?? "Drop a PDF or text file here"
          )}
        </button>
      )}
    </>
  );
}

import { useEffect, useState } from "react";
import { Volume2, X } from "lucide-react";
import { lookupWord, speakWord, type WordSense } from "@/lib/dictionary";
import { Button } from "@/components/ui/button";

export function WordCard({
  word,
  onClose,
}: {
  word: string;
  onClose: () => void;
}) {
  const [sense, setSense] = useState<WordSense | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    setSense(undefined);
    void lookupWord(word).then((result) => {
      if (live) setSense(result);
    });
    return () => {
      live = false;
    };
  }, [word]);

  function play() {
    if (sense?.audio) {
      const audio = new Audio(sense.audio);
      void audio.play().catch(() => speakWord(word));
      return;
    }
    speakWord(word);
  }

  const display = sense?.word ?? word.replace(/[^A-Za-z']/g, "");

  return (
    <div className="material-surface pointer-events-auto w-full max-w-sm rounded-lg p-4 shadow-float">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-serif text-xl">{display}</p>
          {sense?.phonetic ? <p className="mt-0.5 text-sm text-muted">{sense.phonetic}</p> : null}
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon-sm" onClick={play} aria-label="Pronounce">
            <Volume2 size={16} className="icon-motion icon-lift" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close definition">
            <X size={16} className="icon-motion icon-turn" />
          </Button>
        </div>
      </div>
      {sense === undefined ? (
        <p className="mt-3 text-sm text-muted">Looking up…</p>
      ) : sense ? (
        <div className="mt-3 space-y-1.5">
          {sense.partOfSpeech ? (
            <p className="text-xs tracking-wide text-muted uppercase">{sense.partOfSpeech}</p>
          ) : null}
          <p className="text-sm leading-relaxed">{sense.definition}</p>
          {sense.example ? (
            <p className="text-sm leading-relaxed text-muted italic">“{sense.example}”</p>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">No definition on hand. Pronounce still works.</p>
      )}
    </div>
  );
}

import { memo, useMemo } from "react";
import { AccessibleBionic } from "@/components/accessible-bionic";
import { applyPlainLanguage, applyPlainPhrases } from "@/lib/text-simplifier";
import { decorateLine, decorateWord, tokenizeWords } from "@/lib/word-markup";
import { cn } from "@/lib/utils";

export const WordRun = memo(function WordRun({
  text,
  html,
  lineIdx,
  highlightIndex,
  guides,
  bionic,
  rhythm,
  plainLanguage = false,
}: {
  text: string;
  html: string;
  lineIdx: number;
  highlightIndex: number | null;
  guides: { syllables: boolean; letterGuide: boolean; wordGuide: boolean };
  bionic: number;
  rhythm: boolean;
  plainLanguage?: boolean;
}) {
  const split = Boolean(guides.wordGuide) || highlightIndex != null;
  const decorate = Boolean(guides.syllables || guides.letterGuide || plainLanguage);
  const spoken = plainLanguage ? applyPlainLanguage(text) : text;
  const source = plainLanguage ? applyPlainPhrases(text).text : text;
  const tokens = useMemo(() => (split ? tokenizeWords(source) : []), [split, source]);
  const decorated = useMemo(
    () =>
      !split && decorate
        ? decorateLine(text, {
            bionic,
            syllables: guides.syllables,
            letterGuide: guides.letterGuide,
            rhythm,
            plainLanguage,
          })
        : "",
    [split, decorate, text, bionic, guides.syllables, guides.letterGuide, rhythm, plainLanguage],
  );

  if (!split && !decorate) return <AccessibleBionic text={text} html={html} />;
  if (!split) return <AccessibleBionic text={spoken} html={decorated || html} />;

  const needsInner = bionic > 0 || decorate;
  let wordIndex = -1;
  return (
    <>
      <span aria-hidden="true">
        {tokens.map((token, i) => {
          if (!token.isWord) return <span key={i}>{token.raw}</span>;
          wordIndex += 1;
          const index = wordIndex;
          const current = highlightIndex === index;
          return (
            <span
              key={i}
              data-word={`${lineIdx}-${index}`}
              className={cn("reading-word", current && "is-current")}
            >
              {needsInner ? (
                <span
                  dangerouslySetInnerHTML={{
                    __html: decorateWord(token.raw, {
                      bionic,
                      syllables: guides.syllables,
                      letterGuide: guides.letterGuide,
                      rhythm,
                      plainLanguage,
                    }),
                  }}
                />
              ) : (
                token.raw
              )}
            </span>
          );
        })}
      </span>
      <span className="sr-only">{spoken}</span>
    </>
  );
});

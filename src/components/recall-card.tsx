import { useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { recallVerdict, type RecallQuestion } from "@/lib/recall";
import { Bloom } from "@/components/garden-view";
import { cn } from "@/lib/utils";

/**
 * Two quick questions at the end of a chapter.
 *
 * Optional, inline, and impossible to fail. It opens inside the chapter's
 * closing card rather than as a dialog, because a dialog at the moment
 * someone finished something is friction exactly when they felt good. A wrong
 * answer shows the right one without a cross or a red — the point is to have
 * another look at the passage, not to be marked. Whatever happens, a flower
 * opens in the reader's garden: finishing the card is the achievement, not
 * the score.
 */
export function RecallCard({
  questions,
  onFinish,
  growthNote,
}: {
  questions: RecallQuestion[];
  /** Called once, when the last question is answered. */
  onFinish: (right: number, asked: number) => void;
  /** What happened in the garden, shown with the verdict. */
  growthNote: string | null;
}) {
  const [stage, setStage] = useState<"offer" | "asking" | "done">("offer");
  const [index, setIndex] = useState(0);
  const [picks, setPicks] = useState<number[]>([]);

  if (questions.length === 0) return null;

  const right = picks.filter((pick, i) => pick === questions[i]?.answerIndex).length;

  if (stage === "offer") {
    return (
      <button
        type="button"
        onClick={() => setStage("asking")}
        className="mt-4 flex w-full items-center gap-3 rounded-lg bg-fg/4 px-3.5 py-3 text-left transition-[background-color,transform] duration-150 ease-[var(--ease-out)] hover:bg-fg/7 active:scale-[0.99]"
      >
        <Sparkles size={16} className="shrink-0 text-accent" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Quick recall</span>
          <span className="block text-xs text-muted">
            {questions.length === 1 ? "One question" : `${questions.length} questions`} about what
            you just read. A flower for your garden either way.
          </span>
        </span>
      </button>
    );
  }

  if (stage === "done") {
    return (
      <div className="recall-done mt-4 flex items-center gap-3 rounded-lg bg-fg/4 px-3.5 py-3">
        <Bloom className="recall-bloom size-10 shrink-0" />
        <div className="min-w-0" aria-live="polite">
          <p className="text-sm font-medium">{recallVerdict(right, questions.length)}</p>
          {growthNote ? <p className="mt-0.5 text-xs text-muted">{growthNote}</p> : null}
        </div>
      </div>
    );
  }

  const question = questions[index]!;
  const picked = picks[index];
  const answered = typeof picked === "number";
  const last = index === questions.length - 1;

  return (
    <fieldset className="mt-4 rounded-lg bg-fg/4 p-3.5">
      <legend className="sr-only">
        Question {index + 1} of {questions.length}
      </legend>
      <p className="text-xs text-muted tabular-nums" aria-hidden>
        {index + 1} of {questions.length}
      </p>
      <p className="mt-0.5 text-sm font-medium">{question.prompt}</p>
      <div className="mt-2.5 flex flex-col gap-1.5">
        {question.options.map((option, optionIndex) => {
          const isAnswer = optionIndex === question.answerIndex;
          const isPick = optionIndex === picked;
          return (
            <button
              key={option}
              type="button"
              disabled={answered}
              aria-pressed={isPick}
              onClick={() =>
                setPicks((current) => {
                  const next = [...current];
                  next[index] = optionIndex;
                  return next;
                })
              }
              className={cn(
                "flex min-h-11 w-full items-start gap-2 rounded-md px-3 py-2 text-left text-sm leading-snug text-pretty",
                "transition-[background-color,box-shadow,transform] duration-150 ease-[var(--ease-out)]",
                !answered && "bg-bg hover:bg-fg/6 active:scale-[0.99]",
                // Once answered, the right option is marked and nothing else
                // is — a wrong pick is simply not the one that lights up.
                answered &&
                  isAnswer &&
                  "bg-accent/12 shadow-[inset_0_0_0_1.5px_var(--color-accent)]",
                answered && !isAnswer && "bg-bg opacity-70",
              )}
            >
              {answered && isAnswer ? (
                <Check size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden />
              ) : null}
              <span className="min-w-0">{option}</span>
            </button>
          );
        })}
      </div>
      {answered ? (
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-xs text-muted" aria-live="polite">
            {picked === question.answerIndex ? "Yes — that one." : "It was this one."}
          </p>
          <button
            type="button"
            onClick={() => {
              if (last) {
                onFinish(
                  picks.filter((pick, i) => pick === questions[i]?.answerIndex).length,
                  questions.length,
                );
                setStage("done");
              } else {
                setIndex(index + 1);
              }
            }}
            className="h-9 rounded-full bg-fg px-4 text-sm font-medium text-bg transition-[transform,opacity] duration-150 ease-[var(--ease-out)] hover:opacity-90 active:scale-[0.97]"
          >
            {last ? "Done" : "Next"}
          </button>
        </div>
      ) : null}
    </fieldset>
  );
}

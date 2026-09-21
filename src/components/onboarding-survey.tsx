import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronLeft } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { READING_PROFILES } from "@/lib/types";
import { answeredAnything, profileFromAnswers } from "@/lib/onboarding/apply";
import { QUESTIONS, type Answers } from "@/lib/onboarding/questions";
import { Mark } from "@/components/mark";
import { cn } from "@/lib/utils";

/**
 * Five questions, once, so the first book is not the calibration.
 *
 * One question at a time rather than a form. The people this app is for are
 * the people a five-question page of radio buttons puts off, and a question
 * that fills the screen is a question you answer rather than a page you assess.
 *
 * Everything is a button. Nothing here takes typing — partly because tapping is
 * easier, and mostly because a text field is somewhere a condition, a name or a
 * sentence about somebody's life can be entered, and then it has to be stored.
 * See `lib/onboarding/questions.ts` for the rest of that reasoning.
 *
 * Skippable from the first screen and every screen after. A survey nobody can
 * get out of is a wall in front of the thing they signed up for, and somebody
 * who skips has still told us something: leave the defaults alone.
 */
export function OnboardingSurvey({ onDone }: { onDone: () => void }) {
  const setProfile = useAppStore((s) => s.setProfile);
  const setMode = useAppStore((s) => s.setMode);
  const setTargetWpm = useAppStore((s) => s.setTargetWpm);

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const headingRef = useRef<HTMLHeadingElement>(null);

  const question = QUESTIONS[step]!;
  const chosen = answers[question.id] ?? [];
  const last = step === QUESTIONS.length - 1;

  /**
   * Move focus to the new question.
   *
   * Without this a keyboard or screen-reader user answers question one and is
   * left with focus on a button that no longer exists, at the top of a page
   * that silently changed under them.
   */
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const finish = useCallback(
    (collected: Answers) => {
      const stamp = Date.now();

      if (answeredAnything(collected)) {
        const { profile, mode, targetWpm } = profileFromAnswers(collected);
        // The mode's preset first, then the survey's adjustments on top — so a
        // reader who said "I lose my place" gets the whole Focus profile and
        // not just the two settings the survey names.
        setMode(mode);
        setTargetWpm(targetWpm);
        setProfile({
          ...READING_PROFILES[mode],
          ...profile,
          onboardedAt: stamp,
        });
      } else {
        // Nothing to apply. Record only that we asked, so it is not asked again.
        setProfile({ ...useAppStore.getState().profile, onboardedAt: stamp });
      }

      onDone();
    },
    [onDone, setMode, setProfile, setTargetWpm],
  );

  const choose = (id: string) => {
    const next: Answers = question.multiple
      ? {
          ...answers,
          [question.id]: chosen.includes(id)
            ? chosen.filter((value) => value !== id)
            : [...chosen, id],
        }
      : { ...answers, [question.id]: [id] };

    setAnswers(next);
    // A single-answer question advances on its own: tapping an answer and then
    // hunting for Next is a step nobody needs. The multi-answer one waits,
    // because it cannot know you are finished.
    if (!question.multiple) {
      if (last) finish(next);
      else setStep((at) => at + 1);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-bg text-fg">
      <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-4 sm:px-8 sm:py-5">
        <span className="flex items-center gap-2.5">
          <Mark detail className="size-8 text-fg" />
          <span className="text-sm font-medium tracking-tight">NeuroLens</span>
        </span>
        <button
          type="button"
          onClick={() => finish(answers)}
          className="h-9 rounded-full px-3.5 text-sm font-medium text-muted transition-[background-color,color] duration-150 ease-[var(--ease-out)] hover:bg-fg/5 hover:text-fg"
        >
          Skip
        </button>
      </div>

      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-5 pb-10 sm:px-8">
        {/* Progress as words and as a bar: the bar is the glanceable one, the
            text is the one a screen reader reads out. */}
        <div className="mb-8">
          <p className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">
            Question {step + 1} of {QUESTIONS.length}
          </p>
          <div className="h-1 overflow-hidden rounded-full bg-fg/10">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-300 ease-[var(--ease-out)]"
              style={{ width: `${((step + 1) / QUESTIONS.length) * 100}%` }}
            />
          </div>
        </div>

        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-3xl leading-tight text-balance outline-none sm:text-4xl"
        >
          {question.title}
        </h1>
        {question.lead ? (
          <p className="mt-3 text-[15px] leading-relaxed text-pretty text-muted">{question.lead}</p>
        ) : null}

        {/* Deliberately not a radiogroup.
            `role="radio"` is a promise that arrow keys move between the
            options and that the group is one tab stop, and neither is
            implemented here — ARIA that lies about the keyboard is worse than
            none, because a screen reader announces the contract and then the
            keys do nothing. These are buttons and behave like buttons: tab to
            them, press to answer. The multi-answer question uses `aria-pressed`,
            which is a toggle button and exactly what it is. */}
        <div role="group" aria-label={question.title} className="mt-8 flex flex-col gap-2">
          {question.choices.map((choice) => {
            const on = chosen.includes(choice.id);
            return (
              <button
                key={choice.id}
                type="button"
                aria-pressed={question.multiple ? on : undefined}
                onClick={() => choose(choice.id)}
                className={cn(
                  "flex min-h-14 items-center gap-3 rounded-xl px-4 py-3 text-left transition-[background-color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.99]",
                  on ? "bg-fg text-primary-fg" : "bg-fg/5 hover:bg-fg/10",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid size-5 shrink-0 place-items-center rounded-full border",
                    on ? "border-primary-fg bg-primary-fg/15" : "border-fg/25",
                  )}
                >
                  {on ? <Check size={12} strokeWidth={3} /> : null}
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-medium text-pretty">{choice.label}</span>
                  {choice.hint ? (
                    <span
                      className={cn(
                        "mt-0.5 block text-xs leading-snug text-pretty",
                        on ? "text-primary-fg/70" : "text-muted",
                      )}
                    >
                      {choice.hint}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-8 flex items-center gap-3">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep((at) => at - 1)}
              className="inline-flex h-11 items-center gap-1 rounded-full px-3 text-sm font-medium text-muted transition-[background-color,color] duration-150 ease-[var(--ease-out)] hover:bg-fg/5 hover:text-fg"
            >
              <ChevronLeft size={15} aria-hidden />
              Back
            </button>
          ) : null}

          {/* Only the multi-answer question needs this; the others advance on
              a tap. It stays enabled with nothing chosen, because "none of
              these" is a real answer and deserves a way to say it. */}
          {question.multiple ? (
            <button
              type="button"
              onClick={() => (last ? finish(answers) : setStep((at) => at + 1))}
              className="ml-auto inline-flex h-11 items-center rounded-full bg-fg px-5 text-sm font-semibold text-bg transition-[transform,opacity] duration-150 ease-[var(--ease-out)] hover:opacity-90 active:scale-[0.97]"
            >
              {chosen.length ? "Continue" : "None of these"}
            </button>
          ) : null}
        </div>

        <p className="mt-8 text-xs leading-relaxed text-pretty text-subtle">
          Your answers set where you start. They are turned into reading settings and are not stored
          as answers — and everything here can be changed later in reading options.
        </p>
      </div>
    </div>
  );
}

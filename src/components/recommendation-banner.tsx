import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/lib/prefers-reduced-motion";
import { toast } from "sonner";
import { useAppStore } from "@/lib/store";
import { feedback, tapFeedback } from "@/lib/feedback";
import { Button } from "@/components/ui/button";
import { easeOut, gsap, registerGsap, useGSAP } from "@/lib/gsap";

registerGsap();

export function RecommendationBanner() {
  const mode = useAppStore((s) => s.mode);
  const recommendation = useAppStore((s) => s.recommendation);
  const applyRecommendation = useAppStore((s) => s.applyRecommendation);
  const dismissRecommendation = useAppStore((s) => s.dismissRecommendation);
  const undoAdaptiveChange = useAppStore((s) => s.undoAdaptiveChange);
  const [whyOpen, setWhyOpen] = useState(false);
  const reduce = useReducedMotion();
  const show = mode === "adaptive" && recommendation;
  const [shown, setShown] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const whyRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (show && recommendation) tapFeedback("adapt");
  }, [show, recommendation?.id]);

  useEffect(() => {
    if (show) setShown(true);
  }, [show]);

  useGSAP(
    () => {
      const card = cardRef.current;
      if (!card || !shown) return;
      gsap.killTweensOf(card);
      if (show) {
        gsap.fromTo(
          card,
          { opacity: 0, y: 12, scale: 0.98 },
          {
            opacity: 1,
            y: 0,
            scale: 1,
            duration: reduce ? 0.01 : 0.32,
            ease: easeOut,
          },
        );
      } else {
        gsap.to(card, {
          opacity: 0,
          y: 10,
          scale: 0.98,
          duration: reduce ? 0.01 : 0.18,
          ease: "power2.in",
          onComplete: () => setShown(false),
        });
      }
    },
    { dependencies: [show, shown, recommendation?.id, reduce] },
  );

  useGSAP(
    () => {
      const why = whyRef.current;
      if (!why) return;
      gsap.killTweensOf(why);
      if (whyOpen) {
        gsap.fromTo(
          why,
          { opacity: 0, height: 0, marginTop: 0 },
          {
            opacity: 1,
            height: "auto",
            marginTop: 8,
            duration: reduce ? 0.01 : 0.28,
            ease: easeOut,
          },
        );
      } else {
        gsap.to(why, {
          opacity: 0,
          height: 0,
          marginTop: 0,
          duration: reduce ? 0.01 : 0.2,
          ease: "power2.in",
        });
      }
    },
    { dependencies: [whyOpen, reduce] },
  );

  if (!shown || !recommendation) return null;

  return (
    <div
      ref={cardRef}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-auto w-[min(28rem,calc(100vw-1.5rem))] origin-bottom rounded-lg bg-surface p-3 shadow-float"
    >
      <p className="text-xs font-medium tracking-wide text-muted uppercase">NeuroLens recommendation</p>
      <p className="mt-2 text-sm leading-relaxed">{recommendation.reason}</p>
      <p
        ref={whyRef}
        className="overflow-hidden text-sm leading-relaxed text-muted"
        style={{ height: whyOpen ? undefined : 0, opacity: whyOpen ? 1 : 0, marginTop: whyOpen ? 8 : 0 }}
      >
        {recommendation.why}
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={whyOpen}
          onClick={() => setWhyOpen((open) => !open)}
        >
          {whyOpen ? "Hide why" : "Why?"}
        </Button>
        <Button variant="outline" size="sm" onClick={dismissRecommendation}>
          Dismiss
        </Button>
        <Button
          size="sm"
          onClick={() => {
            applyRecommendation();
            setWhyOpen(false);
            feedback("adapt", {
              message: "Suggestion applied",
            });
            toast.success("Recommendation applied", {
              action: {
                label: "Undo",
                onClick: () => undoAdaptiveChange(),
              },
            });
          }}
        >
          Apply
        </Button>
      </div>
    </div>
  );
}

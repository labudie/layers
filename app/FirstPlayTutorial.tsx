"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  type RefObject,
} from "react";

export const TUTORIAL_SEEN_KEY = "tutorial_seen";

const OVERLAY = "rgba(0,0,0,0.75)";
const PAD = 10;

type Step = 1 | 2 | 3;

type Rect = { top: number; left: number; width: number; height: number };

const STEPS: Record<
  Step,
  { title: string; body: string; primary: string; isLast?: boolean }
> = {
  1: {
    title: "The image",
    body: "This is today's design. Study it carefully — every element, shadow, and adjustment counts as a layer.",
    primary: "Next",
  },
  2: {
    title: "Your guess",
    body: "Type your guess for the total layer count. You have 3 attempts. After each guess you'll learn if you're too high or too low.",
    primary: "Next",
  },
  3: {
    title: "The challenge",
    body: "Complete all 5 daily designs to finish today's stack. Come back tomorrow for a fresh set. Good luck!",
    primary: "Let's Play",
    isLast: true,
  },
};

function measureEl(el: HTMLElement | null): Rect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    top: r.top - PAD,
    left: r.left - PAD,
    width: r.width + PAD * 2,
    height: r.height + PAD * 2,
  };
}

export function FirstPlayTutorial({
  step,
  imageRef,
  guessInputRef,
  onNext,
  onSkip,
  onComplete,
}: {
  step: Step | null;
  imageRef: RefObject<HTMLElement | null>;
  guessInputRef: RefObject<HTMLElement | null>;
  onNext: () => void;
  onSkip: () => void;
  onComplete: () => void;
}) {
  const [rect, setRect] = useState<Rect | null>(null);

  const updateRect = useCallback(() => {
    if (step == null || step === 3) {
      setRect(null);
      return;
    }
    const el =
      step === 1 ? imageRef.current : guessInputRef.current;
    setRect(measureEl(el));
  }, [step, imageRef, guessInputRef]);

  useLayoutEffect(() => {
    updateRect();
  }, [updateRect]);

  useEffect(() => {
    if (step == null) return;
    const tick = () => updateRect();
    window.addEventListener("resize", tick);
    window.addEventListener("scroll", tick, true);
    const id = window.setInterval(tick, 200);
    return () => {
      window.removeEventListener("resize", tick);
      window.removeEventListener("scroll", tick, true);
      window.clearInterval(id);
    };
  }, [step, updateRect]);

  if (step == null) return null;

  const copy = STEPS[step];
  const vh = typeof window !== "undefined" ? window.innerHeight : 0;
  const cardH = 280;

  const hole = rect;
  const showHole = step !== 3 && hole && hole.width > 0 && hole.height > 0;

  let cardTop: string | number = "50%";
  let cardTransform = "translate(-50%, -50%)";
  if (showHole && hole) {
    const below = hole.top + hole.height + 16;
    const above = hole.top - cardH - 16;
    if (below + cardH <= vh - 16) {
      cardTop = below;
      cardTransform = "translateX(-50%)";
    } else if (above >= 16) {
      cardTop = above;
      cardTransform = "translateX(-50%)";
    } else {
      cardTop = Math.max(16, (vh - cardH) / 2);
      cardTransform = "translateX(-50%)";
    }
  }

  return (
    <div
      className="fixed inset-0 z-[500]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutorial-title"
      aria-describedby="tutorial-body"
    >
      {showHole && hole ? (
        <>
          <div
            className="absolute z-[497] bg-black/0"
            style={{
              top: 0,
              left: 0,
              right: 0,
              height: Math.max(0, hole.top),
              backgroundColor: OVERLAY,
            }}
          />
          <div
            className="absolute z-[497] bg-black/0"
            style={{
              top: hole.top + hole.height,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: OVERLAY,
            }}
          />
          <div
            className="absolute z-[497] bg-black/0"
            style={{
              top: hole.top,
              left: 0,
              width: Math.max(0, hole.left),
              height: hole.height,
              backgroundColor: OVERLAY,
            }}
          />
          <div
            className="absolute z-[497] bg-black/0"
            style={{
              top: hole.top,
              left: hole.left + hole.width,
              right: 0,
              height: hole.height,
              backgroundColor: OVERLAY,
            }}
          />
          <div
            className="absolute z-[499] cursor-default"
            style={{
              top: hole.top,
              left: hole.left,
              width: hole.width,
              height: hole.height,
            }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute z-[500] rounded-lg"
            style={{
              top: hole.top,
              left: hole.left,
              width: hole.width,
              height: hole.height,
              boxShadow:
                "0 0 0 2px rgba(168,85,247,0.95), 0 0 24px rgba(124,58,237,0.85), 0 0 48px rgba(124,58,237,0.45)",
            }}
          />
        </>
      ) : (
        <div
          className="absolute inset-0 z-[497]"
          style={{ backgroundColor: OVERLAY }}
        />
      )}

      <button
        type="button"
        onClick={onSkip}
        className="absolute right-4 top-4 z-[502] rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20"
      >
        Skip
      </button>

      <div
        className="absolute left-1/2 z-[501] w-[min(22rem,calc(100vw-2rem))] rounded-2xl border-2 border-[var(--accent)] bg-white p-5 text-[var(--background)] shadow-[0_8px_40px_rgba(124,58,237,0.35)]"
        style={{
          top: typeof cardTop === "number" ? `${cardTop}px` : cardTop,
          left: "50%",
          transform: cardTransform,
        }}
      >
        <div className="mb-3 flex justify-center gap-2">
          {([1, 2, 3] as const).map((n) => (
            <span
              key={n}
              className={`h-2 w-2 rounded-full transition ${
                n === step
                  ? "bg-[var(--accent)] scale-125"
                  : "bg-[var(--accent)]/25"
              }`}
              aria-hidden
            />
          ))}
        </div>
        <p className="text-center text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
          {step} of 3
        </p>
        <h2
          id="tutorial-title"
          className="mt-2 text-center text-lg font-extrabold text-[#1a0a2e]"
        >
          {copy.title}
        </h2>
        <p
          id="tutorial-body"
          className="mt-3 text-center text-sm leading-relaxed text-neutral-700"
        >
          {copy.body}
        </p>
        <button
          type="button"
          onClick={copy.isLast ? onComplete : onNext}
          className="mt-5 w-full rounded-xl bg-[var(--accent)] py-3 text-sm font-bold text-white shadow-md transition hover:bg-[var(--accent2)]"
        >
          {copy.primary}
        </button>
      </div>
    </div>
  );
}

"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

const THRESHOLD = 60;

/** Rubber-band: stronger resistance as the finger travels further. */
function rubberBandVisual(raw: number) {
  if (raw <= 0) return 0;
  return Math.min(100, 8 * Math.sqrt(raw));
}

function safeVibrate(pattern: number | number[]) {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
    return;
  }
  try {
    navigator.vibrate(pattern);
  } catch {
    /* ignore */
  }
}

function PullSpinner({
  pull,
  refreshing,
  threshold,
}: {
  pull: number;
  refreshing: boolean;
  threshold: number;
}) {
  const progress = refreshing ? 1 : Math.min(1, pull / threshold);
  const show = refreshing || pull > 2;
  const preRotate = refreshing ? 0 : progress * 220;

  return (
    <div
      className="pointer-events-none flex justify-center"
      style={
        {
          opacity: show ? 1 : 0,
          transform: `translateY(${Math.min(24, pull * 0.35)}px) scale(${progress})`,
          transition: "opacity 0.15s ease-out",
        } as CSSProperties
      }
      aria-hidden
    >
      <div
        className={`h-7 w-7 rounded-full border-2 border-[#7c3aed] border-t-transparent ${
          refreshing ? "animate-spin" : ""
        }`}
        style={
          refreshing
            ? undefined
            : ({ transform: `rotate(${preRotate}deg)` } as CSSProperties)
        }
      />
    </div>
  );
}

export function PullToRefresh({
  onRefresh,
  children,
  className = "",
  scrollAreaClassName = "",
  scrollAreaStyle,
  contentClassName = "",
  disabled = false,
}: {
  onRefresh: () => Promise<void>;
  children: ReactNode;
  className?: string;
  /** Merged onto the scrollable div (e.g. min-h-dvh for settings). */
  scrollAreaClassName?: string;
  /** Merged onto the scrollable div (e.g. overscroll-behavior for settings). */
  scrollAreaStyle?: CSSProperties;
  /** Merged onto the inner content wrapper (e.g. h-full flex flex-col for one-screen layouts). */
  contentClassName?: string;
  disabled?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pull, setPull] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const startYRef = useRef(0);
  const startXRef = useRef(0);
  const activeRef = useRef(false);
  const thresholdHapticRef = useRef(false);
  const pullRef = useRef(0);
  const axisChosenRef = useRef(false);
  const refreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    pullRef.current = pull;
  }, [pull]);

  useEffect(() => {
    refreshingRef.current = refreshing;
  }, [refreshing]);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  const resetPullVisual = useCallback(() => {
    setPull(0);
    setDragging(false);
    activeRef.current = false;
    thresholdHapticRef.current = false;
    axisChosenRef.current = false;
  }, []);

  const runRefresh = useCallback(async () => {
    if (refreshingRef.current) return;
    safeVibrate(25);
    refreshingRef.current = true;
    setRefreshing(true);
    setPull(THRESHOLD * 0.42);
    pullRef.current = THRESHOLD * 0.42;
    let completedOk = false;
    try {
      await onRefreshRef.current();
      completedOk = true;
    } catch (e) {
      console.error("[PullToRefresh]", e);
    } finally {
      if (completedOk) {
        safeVibrate([10, 30, 10]);
      }
      refreshingRef.current = false;
      setRefreshing(false);
      setPull(0);
      pullRef.current = 0;
      setDragging(false);
      activeRef.current = false;
      thresholdHapticRef.current = false;
      axisChosenRef.current = false;
    }
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || disabled) return;

    const onTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current) return;
      if (e.touches.length !== 1) return;
      // Only arm pull-to-refresh from the true top; avoids preventDefault while scrolled.
      if (el.scrollTop >= 1) {
        activeRef.current = false;
        axisChosenRef.current = false;
        thresholdHapticRef.current = false;
        return;
      }
      activeRef.current = true;
      axisChosenRef.current = false;
      startYRef.current = e.touches[0].clientY;
      startXRef.current = e.touches[0].clientX;
      setDragging(true);
      thresholdHapticRef.current = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!activeRef.current || refreshingRef.current) return;
      if (e.touches.length !== 1) return;

      if (el.scrollTop >= 1) {
        resetPullVisual();
        return;
      }

      const t = e.touches[0];
      const rawY = t.clientY - startYRef.current;
      const rawX = t.clientX - startXRef.current;

      if (!axisChosenRef.current) {
        const ax = Math.abs(rawX);
        const ay = Math.abs(rawY);
        if (ax > 12 || ay > 12) {
          axisChosenRef.current = true;
          if (ax > ay) {
            activeRef.current = false;
            setDragging(false);
            setPull(0);
            pullRef.current = 0;
            return;
          }
        }
      }

      if (rawY <= 0) {
        setPull(0);
        pullRef.current = 0;
        thresholdHapticRef.current = false;
        return;
      }

      const visual = rubberBandVisual(rawY);
      setPull(visual);
      pullRef.current = visual;

      if (visual >= THRESHOLD && !thresholdHapticRef.current) {
        thresholdHapticRef.current = true;
        safeVibrate(10);
      }
      if (visual < THRESHOLD * 0.82) {
        thresholdHapticRef.current = false;
      }

      // Only block native scroll when at scroll top, committed to vertical pull, and pulling down.
      const atTop = el.scrollTop < 1;
      if (
        atTop &&
        axisChosenRef.current &&
        rawY > 0 &&
        visual > 1
      ) {
        e.preventDefault();
      }
    };

    const onTouchEnd = () => {
      if (refreshingRef.current) return;
      const wasActive = activeRef.current;
      const v = pullRef.current;
      activeRef.current = false;
      setDragging(false);

      if (!wasActive) {
        return;
      }

      if (v >= THRESHOLD) {
        void runRefresh();
      } else {
        resetPullVisual();
      }
    };

    const onTouchCancel = () => {
      if (!refreshingRef.current) {
        resetPullVisual();
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchCancel);

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [disabled, resetPullVisual, runRefresh]);

  const contentTransition =
    dragging || refreshing
      ? "none"
      : "transform 0.38s cubic-bezier(0.34, 1.56, 0.64, 1)";

  return (
    <div className={`relative flex min-h-0 flex-1 flex-col ${className}`.trim()}>
      <div
        ref={scrollRef}
        className={`pull-to-refresh-scroll min-h-0 min-w-0 flex-1 touch-pan-y overflow-x-hidden overflow-y-auto overscroll-y-contain ${scrollAreaClassName}`.trim()}
        aria-busy={refreshing}
        style={
          {
            WebkitOverflowScrolling: "touch",
            overscrollBehavior: "contain",
            ...scrollAreaStyle,
          } as CSSProperties
        }
      >
        <div
          className={`min-h-full min-w-0 max-w-full ${contentClassName}`.trim()}
          style={
            {
              transform: `translateY(${pull}px)`,
              transition: contentTransition,
            } as CSSProperties
          }
        >
          {children}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center pt-1">
        <PullSpinner pull={pull} refreshing={refreshing} threshold={THRESHOLD} />
      </div>
    </div>
  );
}

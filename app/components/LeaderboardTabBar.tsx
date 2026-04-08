"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type LeaderboardTabId = "daily" | "all-time" | "creators";

const TABS: { id: LeaderboardTabId; label: string }[] = [
  { id: "daily", label: "Daily" },
  { id: "all-time", label: "All Time" },
  { id: "creators", label: "Creators" },
];

export function LeaderboardTabBar({ current }: { current: LeaderboardTabId }) {
  const activeIndex = Math.max(
    0,
    TABS.findIndex((t) => t.id === current),
  );
  const rowRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [underlineX, setUnderlineX] = useState(0);

  const updateUnderline = useCallback(() => {
    const row = rowRef.current;
    const el = tabRefs.current[activeIndex];
    if (!row || !el) return;
    const rr = row.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    setUnderlineX(er.left - rr.left + er.width / 2 - 20);
  }, [activeIndex]);

  useLayoutEffect(() => {
    updateUnderline();
  }, [updateUnderline]);

  useEffect(() => {
    const row = rowRef.current;
    if (!row || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => updateUnderline());
    ro.observe(row);
    return () => ro.disconnect();
  }, [updateUnderline]);

  return (
    <div className="mt-5 w-full" role="tablist" aria-label="Leaderboard views">
      <div ref={rowRef} className="relative flex w-full items-stretch pb-1">
        {TABS.map((t, i) => {
          const active = current === t.id;
          return (
            <Link
              key={t.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              href={`/leaderboard?tab=${t.id}`}
              role="tab"
              aria-selected={active}
              className={`tap-press flex flex-1 items-center justify-center py-3 text-sm outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-[rgba(124,58,237,0.45)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] ${
                active
                  ? "font-bold text-white"
                  : "font-normal text-[rgba(255,255,255,0.45)]"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
        <div
          className="pointer-events-none absolute bottom-0 left-0 h-0.5 w-10 rounded-sm bg-[#7c3aed]"
          style={{
            transform: `translateX(${underlineX}px)`,
            transition:
              "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
          aria-hidden
        />
      </div>
    </div>
  );
}

/** Swipe left/right to change leaderboard tab (mobile). */
export function LeaderboardSwipeArea({
  currentTab,
  children,
}: {
  currentTab: LeaderboardTabId;
  children: ReactNode;
}) {
  const router = useRouter();
  const touchStartX = useRef<number | null>(null);
  const order: LeaderboardTabId[] = ["daily", "all-time", "creators"];

  return (
    <div
      onTouchStart={(e) => {
        if (e.touches.length !== 1) return;
        touchStartX.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        const start = touchStartX.current;
        touchStartX.current = null;
        if (start == null) return;
        const end = e.changedTouches[0]?.clientX;
        if (end == null) return;
        const dx = end - start;
        const idx = order.indexOf(currentTab);
        if (dx < -72 && idx < order.length - 1) {
          router.push(`/leaderboard?tab=${order[idx + 1]}`);
        } else if (dx > 72 && idx > 0) {
          router.push(`/leaderboard?tab=${order[idx - 1]}`);
        }
      }}
    >
      {children}
    </div>
  );
}

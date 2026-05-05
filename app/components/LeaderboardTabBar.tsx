"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, type ReactNode } from "react";

export type LeaderboardTabId = "all-time" | "creators";

const TABS: { id: LeaderboardTabId; label: string }[] = [
  { id: "all-time", label: "All Time" },
  { id: "creators", label: "Creators" },
];

export function LeaderboardTabBar({ current }: { current: LeaderboardTabId }) {
  return (
    <div className="mt-5 w-full" role="tablist" aria-label="Leaderboard views">
      <div className="flex w-full items-stretch border-b border-white/[0.06]">
        {TABS.map((t) => {
          const active = current === t.id;
          return (
            <Link
              key={t.id}
              href={`/leaderboard?tab=${t.id}`}
              role="tab"
              aria-selected={active}
              className={`tap-press flex flex-1 items-center justify-center py-3 text-center text-sm outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-[rgba(124,58,237,0.45)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] ${
                active
                  ? "border-b-2 border-[#7c3aed] font-semibold text-[#f8f4ff]"
                  : "border-b-2 border-transparent font-normal text-[#6b7280]"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
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
  const order: LeaderboardTabId[] = ["all-time", "creators"];

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

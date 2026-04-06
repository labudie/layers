"use client";

import Link from "next/link";

export type LeaderboardTabId = "daily" | "all-time" | "creators";

const TABS: { id: LeaderboardTabId; label: string }[] = [
  { id: "daily", label: "Daily" },
  { id: "all-time", label: "All Time" },
  { id: "creators", label: "Creators" },
];

export function LeaderboardTabBar({ current }: { current: LeaderboardTabId }) {
  return (
    <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="Leaderboard views">
      {TABS.map((t) => {
        const active = current === t.id;
        return (
          <Link
            key={t.id}
            href={`/leaderboard?tab=${t.id}`}
            role="tab"
            aria-selected={active}
            className={`leaderboard-tab-pill tap-press relative inline-flex min-h-[44px] items-center rounded-[var(--radius-pill)] px-5 py-2.5 text-sm font-semibold outline-none transition-[color,background-color,border-color,box-shadow,transform] duration-200 [transition-timing-function:var(--smooth)] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-[rgba(124,58,237,0.45)] active:brightness-95 ${
              active
                ? "leaderboard-tab-pill--active bg-[var(--accent)] text-white shadow-[inset_0_-2px_0_0_rgba(255,255,255,0.2)]"
                : "border border-white/15 bg-white/5 text-white/80 hover:bg-white/10"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

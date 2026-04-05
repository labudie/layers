"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { PullToRefresh } from "@/app/components/PullToRefresh";

/** Re-runs the server leaderboard page; spinner stays up briefly so the RSC payload can land. */
export function LeaderboardPullToRefresh({ children }: { children: ReactNode }) {
  const router = useRouter();
  return (
    <PullToRefresh
      className="flex min-h-0 flex-1 flex-col"
      onRefresh={async () => {
        router.refresh();
        await new Promise((r) => setTimeout(r, 480));
      }}
    >
      {children}
    </PullToRefresh>
  );
}

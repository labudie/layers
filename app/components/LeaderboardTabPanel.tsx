"use client";

import type { ReactNode } from "react";

export function LeaderboardTabPanel({
  tab,
  children,
}: {
  tab: string;
  children: ReactNode;
}) {
  return (
    <div className="lb-tab-panel mt-2" data-lb-tab={tab}>
      {children}
    </div>
  );
}

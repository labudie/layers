"use client";

import { useEffect } from "react";

/** Clears document scroll/touch locks when entering/leaving leaderboard (profile sheet closes leave stale styles). */
export function LeaderboardScrollUnlock() {
  useEffect(() => {
    document.body.style.overflow = "";
    document.body.style.touchAction = "";
    return () => {
      document.body.style.overflow = "";
      document.body.style.touchAction = "";
    };
  }, []);
  return null;
}

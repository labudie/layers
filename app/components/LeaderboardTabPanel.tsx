"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export function LeaderboardTabPanel({
  tab,
  children,
}: {
  tab: string;
  children: ReactNode;
}) {
  const [opaque, setOpaque] = useState(true);
  const prevTab = useRef(tab);

  useEffect(() => {
    if (prevTab.current === tab) return;
    setOpaque(false);
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setOpaque(true);
        prevTab.current = tab;
      });
    });
    return () => cancelAnimationFrame(id);
  }, [tab]);

  return (
    <div
      className="lb-tab-panel mt-2 transition-opacity duration-200 ease-out"
      data-lb-tab={tab}
      data-no-tap-haptic
      style={{ opacity: opaque ? 1 : 0 }}
    >
      {children}
    </div>
  );
}

"use client";

import { usePathname } from "next/navigation";

/**
 * Remounts on pathname change so `page-nav-fade` runs each navigation (see globals.css).
 * Avoid stacking Framer opacity on the same node as that animation — it can leave the shell stuck invisible.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const settingsScrollShell = pathname === "/settings";
  const studioShell = pathname === "/studio" || pathname.startsWith("/studio/");

  const shellClass = `flex min-h-0 flex-1 flex-col ${settingsScrollShell ? "overflow-y-visible" : ""}`.trim();

  /** Studio admin pages: skip page fade class to avoid compositor work while idle. */
  if (studioShell) {
    return (
      <div
        style={{
          position: "relative",
          minHeight: "100dvh",
          overflowX: "hidden",
          overflowY: "visible",
        }}
        className={shellClass}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      style={{
        position: "relative",
        minHeight: "100dvh",
        overflowX: "hidden",
        overflowY: "visible",
      }}
    >
      <div key={pathname} className={`page-transition-shell ${shellClass}`.trim()}>
        {children}
      </div>
    </div>
  );
}

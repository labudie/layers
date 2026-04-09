"use client";

import { usePathname } from "next/navigation";

/**
 * Remounts on pathname change so `page-nav-fade` runs each navigation (see globals.css).
 * View Transitions for the document root are styled in globals when supported.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const settingsScrollShell = pathname === "/settings";
  return (
    <div
      key={pathname}
      className={`page-transition-shell flex min-h-0 flex-1 flex-col ${
        settingsScrollShell ? "overflow-y-visible" : ""
      }`.trim()}
    >
      {children}
    </div>
  );
}

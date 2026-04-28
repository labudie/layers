"use client";

import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";

/**
 * Remounts on pathname change so `page-nav-fade` runs each navigation (see globals.css).
 * View Transitions for the document root are styled in globals when supported.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const settingsScrollShell = pathname === "/settings";

  const initial = { opacity: 0 };
  const animate = { opacity: 1 };
  const exit = { opacity: 0 };
  const transition = { duration: 0.15, ease: "easeInOut" as const };

  return (
    <AnimatePresence mode="sync" initial={false}>
      <motion.div
        key={pathname}
        layout="position"
        initial={initial}
        animate={animate}
        exit={exit}
        transition={transition}
        className={`page-transition-shell flex min-h-0 flex-1 flex-col ${
          settingsScrollShell ? "overflow-y-visible" : ""
        }`.trim()}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

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
  const isDrillTransition =
    pathname.startsWith("/profile/") && pathname !== "/profile";

  const initial = isDrillTransition
    ? { opacity: 0, x: 40 }
    : { opacity: 0, y: 8 };
  const animate = isDrillTransition
    ? { opacity: 1, x: 0 }
    : { opacity: 1, y: 0 };
  const exit = isDrillTransition
    ? { opacity: 0, x: -40 }
    : { opacity: 0, y: -8 };
  const transition = isDrillTransition
    ? { duration: 0.22, ease: "easeInOut" as const }
    : { duration: 0.2, ease: "easeInOut" as const };

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
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

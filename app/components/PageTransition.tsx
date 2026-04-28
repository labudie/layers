"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";

/**
 * Remounts on pathname change so `page-nav-fade` runs each navigation (see globals.css).
 * View Transitions for the document root are styled in globals when supported.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const settingsScrollShell = pathname === "/settings";
  const [isAnimating, setIsAnimating] = useState(true);

  useEffect(() => {
    setIsAnimating(true);
  }, [pathname]);

  const initial = { opacity: 0 };
  const animate = { opacity: 1 };
  const exit = { opacity: 0 };
  const transition = { duration: 0.12, ease: [0.25, 0.1, 0.25, 1] as const };

  return (
    <div
      style={{
        position: "relative",
        minHeight: "100dvh",
        overflowX: "hidden",
        overflowY: "visible",
      }}
    >
      <AnimatePresence mode="sync" initial={false}>
        <motion.div
          key={pathname}
          initial={initial}
          animate={animate}
          exit={exit}
          transition={transition}
          onAnimationComplete={() => setIsAnimating(false)}
          style={
            isAnimating
              ? { position: "absolute", top: 0, left: 0, width: "100%" }
              : { position: "relative", width: "100%" }
          }
          className={`page-transition-shell flex min-h-0 flex-1 flex-col ${
            settingsScrollShell ? "overflow-y-visible" : ""
          }`.trim()}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

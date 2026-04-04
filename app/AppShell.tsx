"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { AppBottomNav } from "@/app/AppBottomNav";

const NAV_TOTAL = "calc(5.75rem + env(safe-area-inset-bottom, 0px))";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const showNav =
    pathname !== "/login" &&
    !pathname.startsWith("/studio") &&
    !pathname.startsWith("/onboarding");

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--app-bottom-nav-height",
      showNav ? NAV_TOTAL : "0px",
    );
  }, [showNav]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={
          showNav
            ? "flex min-h-0 flex-1 flex-col pb-[calc(5.75rem+env(safe-area-inset-bottom,0px))]"
            : "flex min-h-0 flex-1 flex-col"
        }
      >
        {children}
      </div>
      {showNav ? <AppBottomNav /> : null}
    </div>
  );
}

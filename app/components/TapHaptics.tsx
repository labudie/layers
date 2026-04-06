"use client";

import { useEffect } from "react";

/**
 * Light haptic on primary-button interactions (Apple HIG–style tap feedback).
 * Opt out with `data-no-tap-haptic` on a container.
 */
export function TapHaptics() {
  useEffect(() => {
    const vibrate = () => {
      if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
        return;
      }
      try {
        navigator.vibrate(8);
      } catch {
        /* ignore */
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.buttons !== 1) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-no-tap-haptic]")) return;

      const hit = target.closest(
        [
          "button:not([disabled])",
          '[role="button"]:not([aria-disabled="true"])',
          '[role="switch"]',
          'a[href]',
          'input[type="submit"]:not([disabled])',
          "summary",
          "[data-tap-haptic]",
        ].join(","),
      );
      if (!hit) return;
      if ((hit as HTMLButtonElement).disabled) return;

      vibrate();
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, []);

  return null;
}

"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { badgeDefById, type BadgeId } from "@/lib/badges";
import { playBadgeUnlockSound } from "@/lib/game-sound";

const SPRING =
  "transform 0.48s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.32s ease-out";

type Props = {
  badgeId: BadgeId | null;
  onDismiss: () => void;
};

export function BadgeUnlockSheet({ badgeId, onDismiss }: Props) {
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);
  const [sheetIn, setSheetIn] = useState(false);
  const [suppressTransition, setSuppressTransition] = useState(true);
  const playedForIdRef = useRef<string | null>(null);

  useEffect(() => {
    queueMicrotask(() => setPortalEl(document.body));
  }, []);

  const closeWithAnimation = useCallback(() => {
    setSuppressTransition(false);
    setClosing(true);
    window.setTimeout(() => {
      onDismiss();
      setClosing(false);
      setSheetIn(false);
    }, 400);
  }, [onDismiss]);

  useEffect(() => {
    if (!badgeId) {
      queueMicrotask(() => {
        setMounted(false);
        setSuppressTransition(true);
        setSheetIn(false);
      });
      playedForIdRef.current = null;
      return;
    }
    queueMicrotask(() => {
      setMounted(true);
      setClosing(false);
      setSheetIn(false);
      setSuppressTransition(true);
    });
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        setSheetIn(true);
        window.requestAnimationFrame(() => setSuppressTransition(false));
      });
    });
    return () => window.cancelAnimationFrame(id);
  }, [badgeId]);

  useEffect(() => {
    if (!badgeId || !mounted || closing) return;
    if (playedForIdRef.current === badgeId) return;
    playedForIdRef.current = badgeId;
    playBadgeUnlockSound();
  }, [badgeId, mounted, closing]);

  if (!portalEl || !badgeId || !mounted) return null;

  const def = badgeDefById(badgeId);
  if (!def) return null;

  const sheetTransform =
    closing || !sheetIn ? "translateY(110%)" : "translateY(0)";
  const sheetTransition = suppressTransition ? "none" : SPRING;
  const backdropOpacity = closing ? 0 : 1;
  const backdropTransition = suppressTransition
    ? "none"
    : "opacity 0.36s ease-out";

  return createPortal(
    <div
      className="pointer-events-auto fixed inset-0 z-[160]"
      aria-modal
      role="dialog"
      aria-labelledby="badge-unlock-title"
    >
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0 bg-black/60"
        style={
          {
            opacity: backdropOpacity,
            transition: backdropTransition,
          } as CSSProperties
        }
        onClick={() => closeWithAnimation()}
      />
      <div
        className="absolute bottom-0 left-0 right-0 flex flex-col items-center px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-8 shadow-[0_-16px_48px_rgba(0,0,0,0.45)]"
        style={
          {
            background: "#1a0a2e",
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            transform: sheetTransform,
            transition: sheetTransition,
          } as CSSProperties
        }
      >
        <div
          className="mb-6 flex h-[80px] w-[80px] shrink-0 items-center justify-center text-[80px] leading-none"
          style={{
            boxShadow: "0 0 30px rgba(255, 215, 0, 0.4)",
            borderRadius: 20,
          }}
          aria-hidden
        >
          {def.icon}
        </div>
        <h2
          id="badge-unlock-title"
          className="text-center text-2xl font-bold text-white"
        >
          {def.name}
        </h2>
        <p className="mt-3 max-w-sm text-center text-base text-white/55">
          {def.description}
        </p>
        <button
          type="button"
          className="mt-8 w-full max-w-xs rounded-2xl bg-[var(--accent)] py-3.5 text-base font-semibold text-white shadow-lg transition hover:opacity-95 active:scale-[0.99]"
          onClick={() => closeWithAnimation()}
        >
          Awesome! 🎉
        </button>
      </div>
    </div>,
    portalEl,
  );
}

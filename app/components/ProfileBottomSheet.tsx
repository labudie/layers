"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { BADGE_DEFS, type BadgeId } from "@/lib/badges";
import { stripAtHandle } from "@/lib/username-display";

type ProfileRow = {
  id: string;
  username: string | null;
  avatar_url: string | null;
  current_streak: number | null;
  longest_streak: number | null;
  total_solved: number | null;
  perfect_days: number | null;
  badges: string[] | null;
  bio: string | null;
  website_url: string | null;
  instagram_handle: string | null;
};

type PublishedWorkRow = {
  id: string;
  image_url: string | null;
  title: string | null;
  active_date: string | null;
};

const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
const ANIM_MS = 320;
const CLOSE_SWIPE_PX = 80;
const VELOCITY_THRESHOLD = 0.5; // px / ms

function cleanUrl(url: string) {
  const raw = url.trim();
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return `https://${raw}`;
}

function displayDomain(url: string) {
  const cleaned = cleanUrl(url);
  try {
    const parsed = new URL(cleaned);
    return parsed.host + parsed.pathname.replace(/\/$/, "");
  } catch {
    return url.replace(/^https?:\/\//, "");
  }
}

function normalizeInstagramHandle(raw: string | null | undefined) {
  return (raw ?? "").trim().replace(/^@+/, "");
}

export function ProfileBottomSheet({
  username,
  isOpen,
  onClose,
}: {
  username: string | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const handle = useMemo(() => stripAtHandle(username ?? "").trim(), [username]);
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);
  const [rendered, setRendered] = useState(false);
  const [active, setActive] = useState(false);
  const [snap, setSnap] = useState<"peek" | "full">("peek");
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [publishedWork, setPublishedWork] = useState<PublishedWorkRow[]>([]);

  const closeTimeoutRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const dragStartYRef = useRef<number | null>(null);
  const dragStartXRef = useRef<number | null>(null);
  const dragStartTimeRef = useRef<number>(0);
  const dragDirectionRef = useRef<"unknown" | "horizontal" | "vertical">("unknown");
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") return;
    setPortalEl(document.body);
  }, []);

  useEffect(() => {
    if (closeTimeoutRef.current) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    if (isOpen) {
      setRendered(true);
      setSnap("peek");
      setDragOffsetY(0);
      const id = window.requestAnimationFrame(() => setActive(true));
      return () => window.cancelAnimationFrame(id);
    }
    setActive(false);
    if (rendered) {
      closeTimeoutRef.current = window.setTimeout(() => {
        setRendered(false);
      }, ANIM_MS);
    }
  }, [isOpen, rendered]);

  useEffect(() => {
    if (!isOpen || !handle) return;
    let cancelled = false;
    setLoading(true);
    setProfile(null);
    setPublishedWork([]);
    (async () => {
      const sb = supabase();
      const { data: row } = await sb
        .from("profiles")
        .select(
          "id, username, avatar_url, current_streak, longest_streak, total_solved, perfect_days, badges, bio, website_url, instagram_handle"
        )
        .eq("username", handle)
        .maybeSingle();
      if (cancelled) return;
      const prof = (row as ProfileRow | null) ?? null;
      setProfile(prof);
      if (!prof) {
        setLoading(false);
        return;
      }
      const variants = Array.from(new Set([handle, `@${handle}`]));
      const { data: workRows } = await sb
        .from("challenges")
        .select("id, image_url, title, active_date")
        .in("creator_name", variants)
        .not("image_url", "is", null)
        .order("active_date", { ascending: false })
        .order("position", { ascending: true });
      if (cancelled) return;
      setPublishedWork((workRows as PublishedWorkRow[] | null) ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, handle]);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        window.clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  if (!portalEl || !rendered) return null;

  const displayHandle = stripAtHandle(profile?.username ?? handle);
  const initial = (displayHandle.slice(0, 1) || "?").toUpperCase();
  const earned = new Set((profile?.badges ?? []) as BadgeId[]);
  const isFull = snap === "full";
  const targetHeight = isFull ? "100dvh" : "55dvh";
  const website = profile?.website_url?.trim() ?? "";
  const instagram = normalizeInstagramHandle(profile?.instagram_handle);
  const bio = profile?.bio?.trim() ?? "";

  const overlayStyle: React.CSSProperties = {
    background: "rgba(0,0,0,0.6)",
    opacity: active ? 1 : 0,
    transition: `opacity ${ANIM_MS}ms ${EASE}`,
  };

  const sheetTransformBase = active ? "translateY(0)" : "translateY(100%)";
  const dragTransform =
    dragOffsetY !== 0 ? ` translateY(${Math.max(-120, dragOffsetY)}px)` : "";
  const borderRadius = isFull ? "0px" : "20px 20px 0 0";

  const beginDragGesture = (touch: { clientX: number; clientY: number }) => {
    draggingRef.current = true;
    dragStartYRef.current = touch.clientY;
    dragStartXRef.current = touch.clientX;
    dragStartTimeRef.current = performance.now();
    dragDirectionRef.current = "unknown";
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[220]"
      role="dialog"
      aria-modal="true"
      aria-label="Profile"
      onTouchStartCapture={(e) => e.stopPropagation()}
      onTouchMoveCapture={(e) => e.stopPropagation()}
      onTouchEndCapture={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label="Close profile sheet"
        onClick={onClose}
        className="absolute inset-0"
        style={overlayStyle}
      />
      <div
        className="absolute bottom-0 left-0 right-0 flex flex-col overflow-hidden bg-[#0f0520] shadow-[0_-12px_48px_rgba(0,0,0,0.55)]"
        style={{
          height: targetHeight,
          borderRadius,
          transform: `${sheetTransformBase}${dragTransform}`,
          transition: draggingRef.current ? "none" : `transform ${ANIM_MS}ms ${EASE}, height ${ANIM_MS}ms ${EASE}, border-radius ${ANIM_MS}ms ${EASE}`,
          willChange: "transform,height,border-radius",
        }}
        onTouchStart={(e) => {
          e.stopPropagation();
          const touch = e.touches[0];
          if (!touch) return;
          beginDragGesture(touch);
        }}
        onTouchMove={(e) => {
          e.stopPropagation();
          if (!draggingRef.current) return;
          const touch = e.touches[0];
          const startY = dragStartYRef.current;
          const startX = dragStartXRef.current;
          if (!touch || startY == null || startX == null) return;
          const dy = touch.clientY - startY;
          const dx = touch.clientX - startX;

          if (dragDirectionRef.current === "unknown") {
            if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
              dragDirectionRef.current =
                Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
            }
          }
          if (dragDirectionRef.current === "horizontal") {
            return;
          }

          const target = e.target as Node | null;
          const inScrollableContent =
            scrollAreaRef.current != null &&
            target != null &&
            scrollAreaRef.current.contains(target);

          if (inScrollableContent && isFull) {
            const scrollTop = scrollAreaRef.current?.scrollTop ?? 0;
            // When expanded, let internal scroll consume gesture unless user pulls down from top.
            if (!(scrollTop <= 0 && dy > 0)) {
              return;
            }
          }

          e.preventDefault();
          setDragOffsetY(dy * 0.55);
        }}
        onTouchEnd={(e) => {
          e.stopPropagation();
          if (!draggingRef.current) return;
          const startY = dragStartYRef.current;
          const endY = e.changedTouches[0]?.clientY;
          const elapsedMs = Math.max(1, performance.now() - dragStartTimeRef.current);
          const direction = dragDirectionRef.current;
          draggingRef.current = false;
          dragStartYRef.current = null;
          dragStartXRef.current = null;
          dragDirectionRef.current = "unknown";
          setDragOffsetY(0);

          if (direction === "horizontal") return;
          if (startY == null || endY == null) return;
          const dy = endY - startY;
          const velocity = Math.abs(dy) / elapsedMs;
          const shouldSnap = Math.abs(dy) > CLOSE_SWIPE_PX || velocity > VELOCITY_THRESHOLD;
          if (!shouldSnap) return;

          if (dy < 0) {
            if (!isFull) setSnap("full");
            return;
          }
          if (isFull) setSnap("peek");
          else onClose();
        }}
      >
        <div
          className="shrink-0 px-4 pt-2"
        >
          <div className="flex justify-center pb-1">
            <div
              aria-hidden
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                background: "rgba(255,255,255,0.2)",
              }}
            />
          </div>
          <p className="pb-2 text-center text-[10px] text-[#6b7280]">↑ Swipe up to expand</p>

          {loading ? (
            <p className="pb-5 text-center text-sm text-white/60">Loading profile...</p>
          ) : !profile ? (
            <p className="pb-5 text-center text-sm text-white/60">Profile unavailable</p>
          ) : (
            <>
              <div className="flex flex-col items-center">
                <div className="h-14 w-14 overflow-hidden rounded-full border-2 border-[#7c3aed] bg-black/40 p-[2px]">
                  <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-black/40">
                    {profile.avatar_url ? (
                      <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-lg font-bold text-white/70">{initial}</span>
                    )}
                  </div>
                </div>
                <p className="mt-2 text-base font-bold text-white">@{displayHandle || "unknown"}</p>
                {bio ? (
                  <p className="mt-1 max-w-[90%] text-center text-[12px] leading-[1.35] text-[#a0a0b0] [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical] overflow-hidden">
                    {bio}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                  {website ? (
                    <a
                      href={cleanUrl(website)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center rounded-full border border-white/15 bg-white/[0.05] px-2.5 py-1 text-[11px] text-white/85 hover:bg-white/[0.1]"
                    >
                      🔗 {displayDomain(website)}
                    </a>
                  ) : null}
                  {instagram ? (
                    <a
                      href={`https://instagram.com/${instagram}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center rounded-full border border-white/15 bg-white/[0.05] px-2.5 py-1 text-[11px] text-white/85 hover:bg-white/[0.1]"
                    >
                      @{instagram}
                    </a>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                <div className="rounded-xl border border-white/10 bg-white/[0.04] px-2 py-2">
                  <div className="text-sm font-extrabold text-white">{profile.current_streak ?? 0}</div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Streak</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.04] px-2 py-2">
                  <div className="text-sm font-extrabold text-white">{profile.longest_streak ?? 0}</div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Longest</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.04] px-2 py-2">
                  <div className="text-sm font-extrabold text-white">{profile.total_solved ?? 0}</div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Solved</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.04] px-2 py-2">
                  <div className="text-sm font-extrabold text-white">{profile.perfect_days ?? 0}</div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Perfect</div>
                </div>
              </div>

              <div className="mt-4">
                <p className="text-xs font-bold uppercase tracking-wider text-white/45">Badges</p>
                <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                  {BADGE_DEFS.map((badge) => {
                    const has = earned.has(badge.id);
                    return (
                      <span
                        key={badge.id}
                        title={badge.name}
                        className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${
                          has
                            ? "border-[var(--accent)]/45 bg-[var(--accent)]/15 text-white"
                            : "border-white/10 bg-white/[0.04] text-white/35"
                        }`}
                      >
                        {badge.icon} {badge.name}
                      </span>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        <div
          ref={scrollAreaRef}
          className={`min-h-0 flex-1 px-4 pb-[max(env(safe-area-inset-bottom),16px)] ${isFull ? "overflow-y-auto pt-2" : "overflow-hidden pt-0"}`}
          style={isFull ? { WebkitOverflowScrolling: "touch", touchAction: "pan-y" } : { touchAction: "none" }}
          onTouchStart={(e) => {
            if (isFull) e.stopPropagation();
          }}
          onTouchMove={(e) => {
            if (isFull) e.stopPropagation();
          }}
          onTouchEnd={(e) => {
            if (isFull) e.stopPropagation();
          }}
        >
          <div className={`pb-3 transition-all duration-300 ${isFull ? "opacity-100" : "opacity-45"}`}>
            <p className="text-xs font-bold uppercase tracking-wider text-white/45">Published work</p>
            <div className="mt-2 grid grid-cols-2 gap-[6px]">
              {publishedWork.length === 0 ? (
                <p className="col-span-2 py-8 text-center text-sm text-white/45">
                  No published work yet
                </p>
              ) : (
                publishedWork.map((w) => (
                  <div
                    key={w.id}
                    className="overflow-hidden rounded-[8px] border border-white/10 bg-white/[0.04]"
                  >
                    <div className="relative aspect-[4/5] w-full bg-black/30">
                      {w.image_url ? (
                        <img
                          src={w.image_url}
                          alt={w.title ?? ""}
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    portalEl
  );
}


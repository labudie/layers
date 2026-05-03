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

type SnapPoint = "closed" | "collapsed" | "expanded";

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
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [publishedWork, setPublishedWork] = useState<PublishedWorkRow[]>([]);
  const [snap, setSnap] = useState<SnapPoint>("closed");
  const dragging = useRef(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [viewportH, setViewportH] = useState(1);
  const [isDesktop, setIsDesktop] = useState(false);

  const dragStartY = useRef(0);
  const dragStartTime = useRef(0);
  const sheetRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const SNAP = { closed: 100, collapsed: 45, expanded: 0 } as const;
  const SNAP_THRESHOLD_PX = 80;
  const VELOCITY_THRESHOLD = 0.3; // px/ms

  useEffect(() => {
    if (typeof document === "undefined") return;
    setPortalEl(document.body);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setSnap("closed");
      return;
    }
    const id = window.requestAnimationFrame(() => setSnap("collapsed"));
    return () => window.cancelAnimationFrame(id);
  }, [isOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => {
      setViewportH(window.innerHeight || 1);
      setIsDesktop(window.innerWidth >= 768 && !("ontouchstart" in window));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Block touch events from leaking to page behind the sheet.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!isOpen) return;

    const prevent = (e: TouchEvent) => {
      e.stopPropagation();
    };
    const preventScroll = (e: TouchEvent) => {
      if (scrollRef.current && scrollRef.current.contains(e.target as Node)) return;
      e.preventDefault();
    };

    const opts: AddEventListenerOptions = { passive: false };
    document.addEventListener("touchmove", preventScroll, opts);
    document.addEventListener("touchstart", prevent, opts);

    return () => {
      console.log(
        "[ProfileBottomSheet] sheet closed — removed document touchmove/touchstart listeners (cleanup ran)",
      );
      document.removeEventListener("touchmove", preventScroll, opts);
      document.removeEventListener("touchstart", prevent, opts);
      document.body.style.overflow = "";
      document.body.style.touchAction = "";
    };
  }, [isOpen]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (isOpen) return;
    document.body.style.overflow = "";
    document.body.style.touchAction = "";
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !handle) return;
    let cancelled = false;
    setLoading(true);
    setProfile(null);
    setPublishedWork([]);
    (async () => {
      try {
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
      } catch (error) {
        if (!cancelled) {
          console.error("[ProfileBottomSheet] failed to fetch profile", error);
          setProfile(null);
          setPublishedWork([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, handle]);

  if (!portalEl) return null;

  const onHandleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    dragStartY.current = e.touches[0].clientY;
    dragStartTime.current = Date.now();
    dragging.current = true;
    setDragOffset(0);
  };

  const onHandleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dragging.current) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    setDragOffset(dy);
  };

  const onHandleTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (!dragging.current) return;
    dragging.current = false;

    const dy = e.changedTouches[0].clientY - dragStartY.current;
    const dt = Math.max(1, Date.now() - dragStartTime.current);
    const velocity = dy / dt; // positive = downward

    const fastDown = velocity > 0.4;
    const fastUp = velocity < -0.4;
    const bigDown = dy > SNAP_THRESHOLD_PX;
    const bigUp = dy < -SNAP_THRESHOLD_PX;

    if (snap === "collapsed") {
      if (fastUp || bigUp) setSnap("expanded");
      else if (fastDown || bigDown) {
        setSnap("closed");
        onClose();
      }
    } else if (snap === "expanded") {
      if (fastDown || bigDown) setSnap("collapsed");
    }

    setDragOffset(0);
  };

  const baseTranslate = SNAP[snap];
  const dragPercent = dragging.current ? (dragOffset / Math.max(1, viewportH)) * 100 : 0;
  const translateY = Math.max(0, Math.min(100, baseTranslate + dragPercent));

  const sheetStyle: React.CSSProperties = {
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    height: "100vh",
    borderRadius: "20px 20px 0 0",
    background: "#0f0520",
    borderTop: "0.5px solid rgba(255,255,255,0.08)",
    transform: `translateY(${translateY}%)`,
    transition: dragging.current ? "none" : "transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
    zIndex: 50,
    display: "flex",
    flexDirection: "column",
    willChange: "transform",
    touchAction: "none",
  };

  const scrollableStyle: React.CSSProperties = {
    flex: 1,
    overflowY: snap === "expanded" ? "auto" : "hidden",
    WebkitOverflowScrolling: "touch",
    touchAction: snap === "expanded" ? "pan-y" : "none",
    padding: "0 16px 40px",
  };

  const displayHandle = stripAtHandle(profile?.username ?? handle);
  const initial = (displayHandle.slice(0, 1) || "?").toUpperCase();
  const earned = new Set((profile?.badges ?? []) as BadgeId[]);
  const website = profile?.website_url?.trim() ?? "";
  const instagram = normalizeInstagramHandle(profile?.instagram_handle);
  const bio = profile?.bio?.trim() ?? "";

  if (!isOpen && snap === "closed") return null;

  return createPortal(
    <div className="fixed inset-0 z-[220]" role="dialog" aria-modal="true" aria-label="Profile">
      <div
        onTouchStart={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
        onTouchMove={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
        onClick={() =>
          snap === "expanded" ? setSnap("collapsed") : (setSnap("closed"), onClose())
        }
        style={{
          position: "fixed",
          inset: 0,
          background: snap === "expanded" ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.5)",
          transition: "background 0.3s",
          zIndex: 49,
        }}
      />

      <div
        ref={sheetRef}
        style={sheetStyle}
        onTouchStart={(e) => {
          e.stopPropagation();
          if (snap !== "expanded") onHandleTouchStart(e);
        }}
        onTouchMove={(e) => {
          e.stopPropagation();
          if (snap !== "expanded") onHandleTouchMove(e);
        }}
        onTouchEnd={(e) => {
          e.stopPropagation();
          if (snap !== "expanded") onHandleTouchEnd(e);
        }}
      >
        <div
          style={{
            padding: "12px 0 8px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "6px",
            cursor: "grab",
            flexShrink: 0,
            touchAction: "none",
          }}
          onTouchStart={onHandleTouchStart}
          onTouchMove={onHandleTouchMove}
          onTouchEnd={onHandleTouchEnd}
        >
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.2)" }} />
          {snap === "collapsed" && !isDesktop ? (
            <div style={{ fontSize: 10, color: "#6b7280" }}>↑ Swipe up to expand</div>
          ) : null}
          {snap === "collapsed" && isDesktop ? (
            <button
              type="button"
              onClick={() => setSnap("expanded")}
              style={{
                fontSize: 13,
                color: "#a855f7",
                cursor: "pointer",
                background: "transparent",
                border: "none",
                padding: "4px 0",
              }}
            >
              View full profile ↑
            </button>
          ) : null}
          {snap === "expanded" && isDesktop ? (
            <button
              type="button"
              onClick={() => setSnap("collapsed")}
              style={{
                fontSize: 13,
                color: "#a855f7",
                cursor: "pointer",
                background: "transparent",
                border: "none",
                padding: "4px 0",
              }}
            >
              ↓ Collapse
            </button>
          ) : null}
        </div>

        <div className="shrink-0 px-4 pt-0">
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

        <div ref={scrollRef} className="min-h-0 pt-2" style={scrollableStyle}>
          <div className={`pb-3 transition-all duration-300 ${snap === "expanded" ? "opacity-100" : "opacity-45"}`}>
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


/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { supabase } from "@/lib/supabase";
import { BADGE_DEFS, type BadgeId } from "@/lib/badges";
import { stripAtHandle } from "@/lib/username-display";

const PEEK_VH = 60;
const FULL_VH = 95;
const SPRING =
  "transform 0.48s cubic-bezier(0.32, 0.72, 0, 1), height 0.48s cubic-bezier(0.32, 0.72, 0, 1)";

type ProfileRow = {
  id: string;
  username: string | null;
  avatar_url: string | null;
  current_streak: number | null;
  total_solved: number | null;
  perfect_days: number | null;
  badges: string[] | null;
};

type SubmissionRow = {
  id: number;
  title: string | null;
  software: string | null;
  image_url: string | null;
  scheduled_challenge_id: string | null;
};

type WorkItem = {
  id: number;
  title: string | null;
  software: string | null;
  image_url: string;
  download_count: number;
};

export function GameplayProfileSheet({
  open,
  onClose,
  usernameHandle,
}: {
  open: boolean;
  onClose: () => void;
  usernameHandle: string | null;
}) {
  const handle = usernameHandle?.trim() ?? "";
  const [mounted, setMounted] = useState(false);
  const [snap, setSnap] = useState<"peek" | "full">("peek");
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [suppressSheetTransition, setSuppressSheetTransition] = useState(true);
  const touchStartY = useRef<number | null>(null);
  const sheetStartDragY = useRef(0);

  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setMounted(false);
      setSnap("peek");
      setDragY(0);
      setSuppressSheetTransition(true);
      setProfile(null);
      setWorkItems([]);
      setFetchError(null);
      return;
    }
    setMounted(true);
    setSnap("peek");
    setSuppressSheetTransition(true);
    const h = typeof window !== "undefined" ? window.innerHeight : 600;
    setDragY(h);
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        setDragY(0);
        window.requestAnimationFrame(() => setSuppressSheetTransition(false));
      });
    });
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  const loadProfile = useCallback(async (h: string) => {
    setLoading(true);
    setFetchError(null);
    try {
      const sb = supabase();
      const { data: profileData, error: profileError } = await sb
        .from("profiles")
        .select(
          "id, username, avatar_url, current_streak, total_solved, perfect_days, badges",
        )
        .eq("username", h)
        .maybeSingle();

      if (profileError || !profileData) {
        setProfile(null);
        setWorkItems([]);
        setFetchError("Profile not found");
        return;
      }

      const prof = profileData as ProfileRow;
      setProfile(prof);

      const { data: submissionRows, error: subErr } = await sb
        .from("submissions")
        .select("id, title, software, image_url, scheduled_challenge_id")
        .eq("user_id", prof.id)
        .eq("status", "approved")
        .order("created_at", { ascending: false });

      if (subErr) {
        setWorkItems([]);
        return;
      }

      const subs = (submissionRows as SubmissionRow[] | null) ?? [];
      const challengeIds = subs
        .map((s) => s.scheduled_challenge_id)
        .filter((id): id is string => Boolean(id));

      const countMap = new Map<string, number>();
      if (challengeIds.length > 0) {
        const { data: countRows } = await sb.rpc("get_download_counts_for_challenges", {
          p_challenge_ids: challengeIds,
        });
        const rows = (countRows ?? []) as Array<{
          challenge_id: string;
          download_count: number;
        }>;
        for (const r of rows) {
          countMap.set(r.challenge_id, Number(r.download_count) || 0);
        }
      }

      const items: WorkItem[] = subs
        .filter((s) => s.image_url)
        .map((s) => ({
          id: s.id,
          title: s.title,
          software: s.software,
          image_url: s.image_url as string,
          download_count: s.scheduled_challenge_id
            ? countMap.get(s.scheduled_challenge_id) ?? 0
            : 0,
        }));
      setWorkItems(items);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !handle.length) return;
    void loadProfile(handle);
  }, [open, handle, loadProfile]);

  const closeWithAnimation = useCallback(() => {
    setDragging(false);
    setDragY(typeof window !== "undefined" ? window.innerHeight : 800);
    window.setTimeout(() => {
      onClose();
    }, 420);
  }, [onClose]);

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    touchStartY.current = e.touches[0].clientY;
    sheetStartDragY.current = dragY;
    setDragging(true);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current == null) return;
    if (e.touches.length !== 1) return;
    const y = e.touches[0].clientY;
    const start = touchStartY.current;
    if (start == null) return;
    const delta = y - start;
    let next = sheetStartDragY.current + delta;
    const maxDown =
      typeof window !== "undefined" ? window.innerHeight * 0.5 : 400;
    next = Math.min(maxDown, Math.max(-40, next));
    setDragY(next);
  };

  const onTouchEnd = () => {
    const start = touchStartY.current;
    touchStartY.current = null;
    setDragging(false);
    if (start == null) return;

    const threshold = 100;
    const upExpand = -55;

    if (snap === "peek") {
      if (dragY > threshold) {
        closeWithAnimation();
        return;
      }
      if (dragY < upExpand) {
        setSnap("full");
      }
    } else if (dragY > threshold * 1.85) {
      closeWithAnimation();
      return;
    } else if (dragY > 48) {
      setSnap("peek");
    }
    setDragY(0);
  };

  if (!open || !mounted) return null;

  const displayHandle = stripAtHandle(profile?.username ?? handle);
  const earned = new Set((profile?.badges ?? []) as BadgeId[]);
  const heightVh = snap === "full" ? FULL_VH : PEEK_VH;

  return (
    <div className="fixed inset-0 z-[140]" aria-modal role="dialog" aria-label="Profile preview">
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0 bg-black/55"
        onClick={() => closeWithAnimation()}
      />
      <div
        className="absolute bottom-0 left-0 right-0 flex flex-col overflow-hidden rounded-t-[20px] bg-[#0f0520] shadow-[0_-12px_48px_rgba(0,0,0,0.55)]"
        style={
          {
            height: `${heightVh}vh`,
            transform: `translateY(${dragY}px)`,
            transition:
              dragging || suppressSheetTransition ? "none" : SPRING,
          } as CSSProperties
        }
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="flex shrink-0 flex-col items-center pt-2">
          <div className="h-1 w-10 rounded-full bg-white/25" aria-hidden />
        </div>
        <div className="flex shrink-0 items-center gap-2 px-3 pb-1 pt-2">
          <button
            type="button"
            aria-label="Back"
            className="tap-press flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg text-white/90 hover:bg-white/10"
            onClick={() => closeWithAnimation()}
          >
            ←
          </button>
          <div className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-white/80">
            Profile
          </div>
          <span className="w-10 shrink-0" aria-hidden />
        </div>

        <div
          className={`min-h-0 flex-1 overflow-y-auto px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-1 ${
            snap === "full" ? "" : ""
          }`}
        >
          {loading ? (
            <div className="space-y-4 py-2" aria-busy>
              <div className="mx-auto h-16 w-16 animate-pulse rounded-full bg-white/10" />
              <div className="mx-auto h-5 w-32 animate-pulse rounded-md bg-white/10" />
              <div className="grid grid-cols-3 gap-2">
                <div className="h-14 animate-pulse rounded-lg bg-white/10" />
                <div className="h-14 animate-pulse rounded-lg bg-white/10" />
                <div className="h-14 animate-pulse rounded-lg bg-white/10" />
              </div>
            </div>
          ) : fetchError || !profile ? (
            <p className="py-8 text-center text-sm text-white/55">{fetchError ?? "Unavailable"}</p>
          ) : (
            <>
              <div className="flex flex-col items-center text-center">
                <div className="h-16 w-16 overflow-hidden rounded-full border-[3px] border-[var(--accent)] bg-black/40 p-[2px] shadow-[0_0_20px_rgba(124,58,237,0.35)]">
                  <div className="h-full w-full overflow-hidden rounded-full bg-black/40">
                    {profile.avatar_url ? (
                      <img
                        src={profile.avatar_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-2xl text-white/35">
                        👤
                      </div>
                    )}
                  </div>
                </div>
                <p className="mt-3 text-lg font-bold text-white">@{displayHandle}</p>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl border border-white/10 bg-white/[0.04] px-2 py-2">
                  <div className="text-base font-extrabold text-white">
                    {profile.current_streak ?? 0}
                  </div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
                    Streak
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.04] px-2 py-2">
                  <div className="text-base font-extrabold text-white">
                    {profile.total_solved ?? 0}
                  </div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
                    Solved
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.04] px-2 py-2">
                  <div className="text-base font-extrabold text-white">
                    {profile.perfect_days ?? 0}
                  </div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
                    Perfect
                  </div>
                </div>
              </div>

              {snap === "peek" ? (
                <button
                  type="button"
                  className="tap-press mt-5 w-full rounded-xl border border-white/15 bg-white/[0.06] py-3 text-sm font-bold text-white hover:bg-white/10"
                  onClick={() => {
                    setSnap("full");
                    setDragY(0);
                  }}
                >
                  View Full Profile →
                </button>
              ) : null}

              {snap === "full" ? (
                <>
                  <div className="mt-6">
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

                  <div className="mt-6">
                    <p className="text-xs font-bold uppercase tracking-wider text-white/45">
                      Submitted work
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      {workItems.length === 0 ? (
                        <p className="col-span-2 text-center text-sm text-white/45">No public work yet</p>
                      ) : (
                        workItems.map((w) => (
                          <div
                            key={w.id}
                            className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]"
                          >
                            <div className="relative aspect-square w-full bg-black/30">
                              <img
                                src={w.image_url}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            </div>
                            <div className="p-2">
                              <p className="line-clamp-2 text-xs font-semibold text-white/90">
                                {w.title ?? "Untitled"}
                              </p>
                              {w.software ? (
                                <p className="mt-0.5 line-clamp-1 text-[11px] text-white/50">
                                  {w.software}
                                </p>
                              ) : null}
                              <p className="mt-1 text-[11px] text-white/45">
                                {w.download_count} downloads
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <Link
                    href={`/profile/${encodeURIComponent(displayHandle)}`}
                    className="mt-6 block w-full rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/15 py-3 text-center text-sm font-bold text-white hover:bg-[var(--accent)]/25"
                    onClick={() => onClose()}
                  >
                    Open full profile page
                  </Link>
                </>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

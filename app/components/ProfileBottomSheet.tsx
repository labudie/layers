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

const SHEET_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const SHEET_DURATION_MS = 360;

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
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);
  const [rendered, setRendered] = useState(false);
  const [active, setActive] = useState(false);
  const handleTouchStartYRef = useRef<number | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);

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
      const id = window.requestAnimationFrame(() => setActive(true));
      return () => window.cancelAnimationFrame(id);
    }
    setActive(false);
    if (rendered) {
      closeTimeoutRef.current = window.setTimeout(() => {
        setRendered(false);
      }, SHEET_DURATION_MS);
    }
  }, [isOpen, rendered]);

  useEffect(() => {
    if (!isOpen || !handle) return;
    let cancelled = false;
    setLoading(true);
    setProfile(null);
    setWorkItems([]);
    (async () => {
      const sb = supabase();
      const { data: profileData } = await sb
        .from("profiles")
        .select(
          "id, username, avatar_url, current_streak, longest_streak, total_solved, perfect_days, badges"
        )
        .eq("username", handle)
        .maybeSingle();

      if (cancelled) return;
      const prof = (profileData as ProfileRow | null) ?? null;
      setProfile(prof);
      if (!prof) {
        setLoading(false);
        return;
      }

      const { data: submissionRows } = await sb
        .from("submissions")
        .select("id, title, software, image_url, scheduled_challenge_id")
        .eq("user_id", prof.id)
        .eq("status", "approved")
        .order("created_at", { ascending: false });

      if (cancelled) return;
      const subs = (submissionRows as SubmissionRow[] | null) ?? [];
      const challengeIds = subs
        .map((s) => s.scheduled_challenge_id)
        .filter((id): id is string => Boolean(id));

      const countMap = new Map<string, number>();
      if (challengeIds.length > 0) {
        const { data: countRows } = await sb.rpc(
          "get_download_counts_for_challenges",
          { p_challenge_ids: challengeIds }
        );
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

  return createPortal(
    <div
      className="fixed inset-0 z-[220]"
      role="dialog"
      aria-modal="true"
      aria-label="Profile"
    >
      <button
        type="button"
        aria-label="Close profile sheet"
        onClick={onClose}
        className="absolute inset-0"
        style={{
          background: "rgba(0,0,0,0.6)",
          opacity: active ? 1 : 0,
          transition: `opacity ${SHEET_DURATION_MS}ms ${SHEET_EASE}`,
        }}
      />
      <div
        className="absolute bottom-0 left-0 right-0 flex flex-col overflow-hidden rounded-t-[20px] bg-[#0f0520] shadow-[0_-12px_48px_rgba(0,0,0,0.55)]"
        style={{
          height: "70vh",
          borderRadius: "20px 20px 0 0",
          transform: active ? "translateY(0)" : "translateY(100%)",
          transition: `transform ${SHEET_DURATION_MS}ms ${SHEET_EASE}`,
          willChange: "transform",
        }}
      >
        <div className="flex justify-center pb-2 pt-2">
          <div
            role="button"
            aria-hidden
            onTouchStart={(e) => {
              handleTouchStartYRef.current = e.touches[0]?.clientY ?? null;
            }}
            onTouchEnd={(e) => {
              const start = handleTouchStartYRef.current;
              handleTouchStartYRef.current = null;
              const end = e.changedTouches[0]?.clientY;
              if (start == null || end == null) return;
              if (end - start >= 72) onClose();
            }}
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              background: "rgba(255,255,255,0.2)",
              cursor: "grab",
            }}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-2">
          {loading ? (
            <p className="py-8 text-center text-sm text-white/60">Loading profile...</p>
          ) : !profile ? (
            <p className="py-8 text-center text-sm text-white/60">Profile unavailable</p>
          ) : (
            <>
              <div className="flex flex-col items-center">
                <div className="h-16 w-16 overflow-hidden rounded-full border-[3px] border-[var(--accent)] bg-black/40 p-[2px]">
                  <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-black/40">
                    {profile.avatar_url ? (
                      <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xl font-bold text-white/70">{initial}</span>
                    )}
                  </div>
                </div>
                <p className="mt-3 text-lg font-bold text-white">@{displayHandle || "unknown"}</p>
              </div>

              <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                <div className="rounded-xl border border-white/10 bg-white/[0.04] px-2 py-2">
                  <div className="text-base font-extrabold text-white">{profile.current_streak ?? 0}</div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
                    Streak
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.04] px-2 py-2">
                  <div className="text-base font-extrabold text-white">{profile.longest_streak ?? 0}</div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
                    Longest
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.04] px-2 py-2">
                  <div className="text-base font-extrabold text-white">{profile.total_solved ?? 0}</div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
                    Solved
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.04] px-2 py-2">
                  <div className="text-base font-extrabold text-white">{profile.perfect_days ?? 0}</div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
                    Perfect
                  </div>
                </div>
              </div>

              <div className="mt-5">
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
                  Public work
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
            </>
          )}
        </div>
      </div>
    </div>,
    portalEl
  );
}


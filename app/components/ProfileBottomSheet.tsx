"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { stripAtHandle } from "@/lib/username-display";

type ProfileRow = {
  username: string | null;
  avatar_url: string | null;
  current_streak: number | null;
  total_solved: number | null;
  perfect_days: number | null;
};

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
  const [loading, setLoading] = useState(false);
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);
  const startYRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") return;
    setPortalEl(document.body);
  }, []);

  useEffect(() => {
    if (!isOpen || !handle) return;
    let cancelled = false;
    setLoading(true);
    setProfile(null);
    (async () => {
      const { data } = await supabase()
        .from("profiles")
        .select("username, avatar_url, current_streak, total_solved, perfect_days")
        .eq("username", handle)
        .maybeSingle();
      if (cancelled) return;
      setProfile((data as ProfileRow | null) ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, handle]);

  if (!portalEl) return null;
  if (!isOpen) return null;

  const displayHandle = stripAtHandle(profile?.username ?? handle);
  const initial = (displayHandle.slice(0, 1) || "?").toUpperCase();

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
        style={{ background: "rgba(0,0,0,0.6)" }}
      />
      <div
        className="absolute bottom-0 left-0 right-0 overflow-hidden rounded-t-[20px] bg-[#0f0520] shadow-[0_-12px_48px_rgba(0,0,0,0.55)]"
        style={{
          height: "70vh",
          borderRadius: "20px 20px 0 0",
          transform: "translateY(0)",
          transition: "transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)",
        }}
        onTouchStart={(e) => {
          startYRef.current = e.touches[0]?.clientY ?? null;
        }}
        onTouchEnd={(e) => {
          const start = startYRef.current;
          startYRef.current = null;
          const end = e.changedTouches[0]?.clientY;
          if (start == null || end == null) return;
          if (end - start >= 60) onClose();
        }}
      >
        <div className="flex justify-center pt-2">
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

        <div className="px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-4">
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

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl border border-white/10 bg-white/[0.04] px-2 py-2">
                  <div className="text-base font-extrabold text-white">{profile.current_streak ?? 0}</div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
                    Streak
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
            </>
          )}
        </div>
      </div>
    </div>,
    portalEl
  );
}


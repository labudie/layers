/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabase";
import { AtUsernameDisplay } from "@/lib/AtHandle";
import { stripAtHandle } from "@/lib/username-display";

export type AppSiteChromeProps = {
  title: ReactNode;
  /** Right side of header (badge, actions). Empty placeholder when omitted. */
  right?: ReactNode;
  /** Shown inside the drawer after main links (e.g. ← Back). */
  drawerFooterExtra?: ReactNode;
  /** Optional row directly under the header (e.g. home countdown). */
  belowHeader?: ReactNode;
  children: ReactNode;
  className?: string;
};

const drawerNavClass =
  "flex items-center gap-3 rounded-xl px-4 py-3.5 text-[15px] font-semibold text-white/90 transition-colors hover:bg-white/[0.08] active:bg-white/[0.06]";
const drawerIconClass =
  "flex h-9 w-9 shrink-0 items-center justify-center text-lg opacity-90";

export function AppSiteChrome({
  title,
  right,
  drawerFooterExtra,
  belowHeader,
  children,
  className = "",
}: AppSiteChromeProps) {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [profileUsername, setProfileUsername] = useState<string | null>(null);
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null);
  const [profileStreak, setProfileStreak] = useState(0);
  const [profileTotalSolved, setProfileTotalSolved] = useState(0);

  const loadNavProfile = useCallback(async () => {
    const sb = supabase();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      setUserId(null);
      setSignedIn(false);
      setProfileUsername(null);
      setProfileAvatarUrl(null);
      setProfileStreak(0);
      setProfileTotalSolved(0);
      return;
    }
    setUserId(user.id);
    setSignedIn(true);
    const { data: prof } = await sb
      .from("profiles")
      .select("username, avatar_url, current_streak, total_solved")
      .eq("id", user.id)
      .maybeSingle();
    const row = prof as {
      username?: string | null;
      avatar_url?: string | null;
      current_streak?: number | null;
      total_solved?: number | null;
    } | null;
    setProfileUsername(row?.username?.trim() ?? null);
    setProfileAvatarUrl(row?.avatar_url?.trim() ?? null);
    setProfileStreak(Math.max(0, Math.floor(Number(row?.current_streak) || 0)));
    setProfileTotalSolved(Math.max(0, Math.floor(Number(row?.total_solved) || 0)));
  }, []);

  useEffect(() => {
    // Hydrate drawer header from Supabase session (client-only).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional mount fetch for nav chrome
    void loadNavProfile();
  }, [loadNavProfile]);

  useEffect(() => {
    const sb = supabase();
    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange(() => {
      void loadNavProfile();
    });
    return () => subscription.unsubscribe();
  }, [loadNavProfile]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  const profileHandle = stripAtHandle(profileUsername ?? "");
  const profileHref =
    signedIn && profileHandle.length > 0
      ? `/profile/${encodeURIComponent(profileHandle)}`
      : "/login";

  async function signOut() {
    await supabase().auth.signOut();
    setDrawerOpen(false);
    router.refresh();
    router.push("/");
  }

  return (
    <div
      className={`flex min-h-dvh w-full flex-col bg-[var(--background)] text-[var(--text)] ${className}`.trim()}
    >
      <div
        className={`fixed inset-0 z-[130] transition-[opacity,visibility] duration-200 ease-out ${
          drawerOpen
            ? "visible opacity-100"
            : "pointer-events-none invisible opacity-0"
        }`}
        aria-hidden={!drawerOpen}
      >
        <button
          type="button"
          aria-label="Close menu"
          className="absolute inset-0 bg-[#0f0520]/65 backdrop-blur-[3px]"
          onClick={() => setDrawerOpen(false)}
        />
        <nav
          ref={drawerRef}
          className={`absolute left-0 top-0 flex h-full w-[min(20rem,88vw)] max-w-[320px] flex-col border-r border-white/10 bg-[#0a0518] shadow-[8px_0_40px_rgba(0,0,0,0.45)] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
            drawerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          aria-label="Main menu"
        >
          <div className="flex flex-1 flex-col overflow-y-auto px-3 pb-4 pt-6">
            <div className="flex flex-col items-stretch px-2 pb-4">
              <div className="mx-auto h-16 w-16 shrink-0 overflow-hidden rounded-full border-2 border-white/15 bg-[var(--accent)]/20">
                {signedIn && profileAvatarUrl ? (
                  <img
                    src={profileAvatarUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-2xl text-white/40">
                    👤
                  </div>
                )}
              </div>
              {signedIn ? (
                <>
                  <div className="mt-3 text-center">
                    <span className="text-lg font-bold text-white">
                      <AtUsernameDisplay
                        raw={profileUsername}
                        fallback={
                          userId ? `player_${userId.slice(0, 8)}` : "Player"
                        }
                      />
                    </span>
                  </div>
                  <div className="mt-3 flex justify-center gap-5 text-sm text-white/70">
                    <span>
                      <span className="font-semibold text-[var(--accent2)]">
                        {profileStreak}
                      </span>{" "}
                      day streak
                    </span>
                    <span>
                      <span className="font-semibold text-[var(--accent2)]">
                        {profileTotalSolved}
                      </span>{" "}
                      solved
                    </span>
                  </div>
                </>
              ) : (
                <p className="mt-3 text-center text-sm text-white/55">
                  Sign in to save progress
                </p>
              )}
            </div>

            <div className="mx-2 border-t border-white/10" />

            <div className="mt-2 flex flex-col gap-0.5">
              <Link
                href="/"
                className={drawerNavClass}
                onClick={() => setDrawerOpen(false)}
              >
                <span className={drawerIconClass} aria-hidden>
                  🏠
                </span>
                Home
              </Link>
              <Link
                href="/leaderboard"
                className={drawerNavClass}
                onClick={() => setDrawerOpen(false)}
              >
                <span className={drawerIconClass} aria-hidden>
                  🏆
                </span>
                Leaderboard
              </Link>
              <Link
                href="/submit"
                className={drawerNavClass}
                onClick={() => setDrawerOpen(false)}
              >
                <span className={drawerIconClass} aria-hidden>
                  🎨
                </span>
                Submit Your Work
              </Link>
              <Link
                href={profileHref}
                className={drawerNavClass}
                onClick={() => setDrawerOpen(false)}
              >
                <span className={drawerIconClass} aria-hidden>
                  👤
                </span>
                Profile
              </Link>
              <Link
                href="/settings"
                className={drawerNavClass}
                onClick={() => setDrawerOpen(false)}
              >
                <span className={drawerIconClass} aria-hidden>
                  ⚙️
                </span>
                Settings
              </Link>
            </div>

            {drawerFooterExtra ? (
              <>
                <div className="mx-2 mt-3 border-t border-white/10" />
                <div className="mt-2 px-2 text-sm">{drawerFooterExtra}</div>
              </>
            ) : null}

            <div className="mx-2 mt-3 border-t border-white/10" />

            {signedIn ? (
              <button
                type="button"
                className={`${drawerNavClass} mt-2 text-red-300 hover:bg-red-500/15 hover:text-red-200`}
                onClick={() => void signOut()}
              >
                <span className={drawerIconClass} aria-hidden>
                  🚪
                </span>
                Sign Out
              </button>
            ) : (
              <Link
                href="/login"
                className={`${drawerNavClass} mt-2 text-[var(--accent2)]`}
                onClick={() => setDrawerOpen(false)}
              >
                <span className={drawerIconClass} aria-hidden>
                  →
                </span>
                Sign in
              </Link>
            )}
          </div>
        </nav>
      </div>

      <header className="grid shrink-0 grid-cols-[auto_1fr_auto] items-center gap-2 px-4 pt-4 md:px-5">
        <button
          type="button"
          aria-label="Open menu"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
          className="flex h-10 w-10 shrink-0 items-center justify-center justify-self-start rounded-full border border-white/10 bg-[rgba(26,10,46,0.75)] text-lg font-semibold text-white shadow-sm transition hover:bg-white/10"
        >
          ☰
        </button>
        <div className="min-w-0 justify-self-center text-center text-xl font-extrabold tracking-tight">
          {title}
        </div>
        <div className="flex min-h-10 min-w-10 shrink-0 items-center justify-end justify-self-end">
          {right ?? <span className="inline-block h-10 w-10 shrink-0" aria-hidden />}
        </div>
      </header>

      {belowHeader}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

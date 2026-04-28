/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabase";
import { AtUsernameDisplay } from "@/lib/AtHandle";
import { stripAtHandle } from "@/lib/username-display";

export type AppSiteChromeProps = {
  title: ReactNode;
  /** Right side of header (badge, actions). Empty placeholder when omitted. */
  right?: ReactNode;
  /** Optional row directly under the header (e.g. home countdown). */
  belowHeader?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Classes for the main content wrapper below the header (default flex-1 column). */
  contentClassName?: string;
};

const drawerNavClass =
  "drawer-nav-stagger tap-press flex items-center gap-3 rounded-xl px-4 py-3.5 text-[15px] font-semibold text-white/90 transition-[background-color,color,transform,filter] duration-150 [transition-timing-function:var(--smooth)] hover:bg-white/[0.08] hover:brightness-105 active:bg-white/[0.06]";
const drawerIconClass =
  "flex h-9 w-9 shrink-0 items-center justify-center text-lg opacity-90";

const drawerIconSvgProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function IconHome() {
  return (
    <svg {...drawerIconSvgProps}>
      <path d="M3 10.5L12 3l9 7.5" />
      <path d="M5 9.8V21h14V9.8" />
      <path d="M10 21v-6h4v6" />
    </svg>
  );
}

function IconTrophy() {
  return (
    <svg {...drawerIconSvgProps}>
      <path d="M8 4h8v3a4 4 0 0 1-8 0V4z" />
      <path d="M10 14h4" />
      <path d="M12 11v3" />
      <path d="M8 18h8" />
      <path d="M6 6H4a3 3 0 0 0 3 3" />
      <path d="M18 6h2a3 3 0 0 1-3 3" />
    </svg>
  );
}

function IconPlusCircle() {
  return (
    <svg {...drawerIconSvgProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8" />
      <path d="M8 12h8" />
    </svg>
  );
}

function IconUser() {
  return (
    <svg {...drawerIconSvgProps}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg {...drawerIconSvgProps}>
      <circle cx="12" cy="12" r="2.7" />
      <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1.9 1.9 0 1 1-2.7 2.7l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 1 1-4 0v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a1.9 1.9 0 1 1-2.7-2.7l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 1 1 0-4h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a1.9 1.9 0 1 1 2.7-2.7l.1.1a1 1 0 0 0 1.1.2h.1a1 1 0 0 0 .6-.9V4a2 2 0 1 1 4 0v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1.9 1.9 0 1 1 2.7 2.7l-.1.1a1 1 0 0 0-.2 1.1v.1a1 1 0 0 0 .9.6H20a2 2 0 1 1 0 4h-.2a1 1 0 0 0-.9.6z" />
    </svg>
  );
}

function IconLogOut() {
  return (
    <svg {...drawerIconSvgProps}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

export function AppSiteChrome({
  title,
  right,
  belowHeader,
  children,
  className = "",
  contentClassName = "",
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
      {/* Unmount when closed so no fixed layer (and no full-screen backdrop `button`) can exist in
          the DOM to steal scroll/touches — opacity/visibility alone is not enough on some WebKit builds. */}
      {drawerOpen ? (
      <div
        className="fixed inset-0 z-[130]"
        aria-hidden={false}
      >
        <button
          type="button"
          aria-label="Close menu"
          className="absolute inset-0 bg-[#0f0520]/65 backdrop-blur-[3px]"
          onClick={() => setDrawerOpen(false)}
        />
        <nav
          ref={drawerRef}
          data-drawer-open="true"
          className="absolute left-0 top-0 flex h-full w-[min(20rem,88vw)] max-w-[320px] translate-x-0 flex-col border-r border-white/10 bg-[#0a0518] shadow-[8px_0_40px_rgba(0,0,0,0.45)]"
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
              {(
                [
                  { href: "/", label: "Home", icon: <IconHome /> },
                  { href: "/leaderboard", label: "Leaderboard", icon: <IconTrophy /> },
                  { href: "/submit", label: "Submit", icon: <IconPlusCircle /> },
                  {
                    href: profileHref,
                    label: "Profile",
                    icon: <IconUser />,
                  },
                  { href: "/settings", label: "Settings", icon: <IconSettings /> },
                ] as const
              ).map((item, index) => (
                <Link
                  key={item.href === profileHref ? `profile-${profileHref}` : item.href}
                  href={item.href}
                  className={drawerNavClass}
                  style={
                    {
                      "--drawer-delay": `${index * 30}ms`,
                    } as CSSProperties
                  }
                  onClick={() => setDrawerOpen(false)}
                >
                  <span className={drawerIconClass} aria-hidden>
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              ))}
            </div>

            <div className="mx-2 mt-3 border-t border-white/10" />

            {signedIn ? (
              <button
                type="button"
                style={{ "--drawer-delay": "150ms" } as CSSProperties}
                className={`${drawerNavClass} mt-2 text-[#ef4444] hover:bg-red-500/15 hover:text-[#ef4444]`}
                onClick={() => void signOut()}
              >
                <span className={drawerIconClass} aria-hidden>
                  <IconLogOut />
                </span>
                Sign Out
              </button>
            ) : (
              <Link
                href="/login"
                style={{ "--drawer-delay": "150ms" } as CSSProperties}
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
      ) : null}

      <header className="relative flex min-h-[52px] shrink-0 items-center justify-center px-4 pb-3 pt-4 md:min-h-[56px] md:px-5">
        <button
          type="button"
          aria-label="Open menu"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
          className="tap-press absolute left-4 top-1/2 z-10 flex h-11 min-h-[44px] w-11 min-w-[44px] -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-[rgba(26,10,46,0.75)] text-lg font-semibold text-white shadow-sm transition-[background-color,transform,filter] duration-150 [transition-timing-function:var(--smooth)] hover:bg-white/10 hover:brightness-105 md:left-5"
        >
          ☰
        </button>
        <div className="pointer-events-none max-w-[min(16rem,calc(100%-6.5rem))] truncate text-center text-xl font-extrabold tracking-tight">
          {title === "Layers" ? (
            <img src="/layers-lockup.svg" alt="Layers" height="22" />
          ) : (
            title
          )}
        </div>
        <div className="absolute right-4 top-1/2 z-10 flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-end md:right-5">
          {right ?? (
            <span
              className="pointer-events-none inline-block h-11 w-11 shrink-0"
              aria-hidden
            />
          )}
        </div>
      </header>

      {belowHeader}

      <div
        className={`flex min-h-0 min-w-0 flex-1 flex-col ${contentClassName}`.trim()}
      >
        {children}
      </div>
    </div>
  );
}

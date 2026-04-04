"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { stripAtHandle } from "@/lib/username-display";
import { needsUsernameOnboarding } from "@/lib/profile-onboarding";

type NavState = {
  userId: string | null;
  username: string | null;
  avatarUrl: string | null;
};

export function AppBottomNav() {
  const pathname = usePathname();
  const [nav, setNav] = useState<NavState>({
    userId: null,
    username: null,
    avatarUrl: null,
  });

  const refresh = useCallback(async () => {
    const sb = supabase();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      setNav({ userId: null, username: null, avatarUrl: null });
      return;
    }
    const { data: row } = await sb
      .from("profiles")
      .select("username, avatar_url")
      .eq("id", user.id)
      .maybeSingle();
    const r = row as { username?: string | null; avatar_url?: string | null } | null;
    setNav({
      userId: user.id,
      username: r?.username ?? null,
      avatarUrl: r?.avatar_url ?? null,
    });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refresh loads profile into nav state
    void refresh();
  }, [refresh, pathname]);

  useEffect(() => {
    const sb = supabase();
    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange(() => {
      void refresh();
    });
    return () => subscription.unsubscribe();
  }, [refresh]);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const profileActive = pathname.startsWith("/profile");

  const handle = stripAtHandle(nav.username ?? "");
  const profileHref =
    nav.userId && !needsUsernameOnboarding(nav.username)
      ? `/profile/${encodeURIComponent(handle)}`
      : "/login";

  const initial = (handle.slice(0, 1) || "?").toUpperCase();

  const itemClass = (active: boolean) =>
    `flex flex-col items-center justify-end gap-0.5 min-w-0 flex-1 pt-1 ${
      active ? "text-[var(--accent2)]" : "text-white/55"
    }`;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[100] border-t border-white/10 bg-[#0f0520] pb-[max(0.35rem,env(safe-area-inset-bottom,0px))] pt-1 shadow-[0_-4px_24px_rgba(0,0,0,0.35)]"
      aria-label="Main navigation"
    >
      <div className="mx-auto grid h-[3.25rem] max-w-lg grid-cols-5 items-end px-1">
        <Link
          href={profileHref}
          className={itemClass(profileActive)}
          aria-label="Profile"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-[var(--accent)]/25">
            {nav.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={nav.avatarUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-xs font-extrabold text-[var(--accent2)]">{initial}</span>
            )}
          </span>
          <span className="max-w-full truncate text-[10px] font-semibold">Profile</span>
        </Link>

        <Link href="/" className={itemClass(isActive("/"))} aria-label="Home">
          <span className="text-lg leading-none" aria-hidden>
            🏠
          </span>
          <span className="text-[10px] font-semibold">Home</span>
        </Link>

        <div className="flex flex-col items-center justify-end gap-0.5 pb-0.5">
          <Link
            href="/submit"
            className="-mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)] text-2xl font-light leading-none text-white shadow-lg ring-2 ring-[#0f0520] transition hover:bg-[var(--accent2)]"
            aria-label="Submit your work"
          >
            +
          </Link>
          <span
            className={`text-[10px] font-semibold ${isActive("/submit") ? "text-[var(--accent2)]" : "text-white/55"}`}
          >
            Submit
          </span>
        </div>

        <Link
          href="/leaderboard"
          className={itemClass(isActive("/leaderboard"))}
          aria-label="Leaderboard"
        >
          <span className="text-lg leading-none" aria-hidden>
            🏆
          </span>
          <span className="text-[10px] font-semibold">Board</span>
        </Link>

        <Link
          href="/settings"
          className={itemClass(isActive("/settings"))}
          aria-label="Settings"
        >
          <span className="text-lg leading-none" aria-hidden>
            ⚙️
          </span>
          <span className="text-[10px] font-semibold">Settings</span>
        </Link>
      </div>
    </nav>
  );
}

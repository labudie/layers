"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, type MouseEvent } from "react";

function NavItem({
  href,
  icon,
  label,
  exact = false,
}: {
  href: string;
  icon: string;
  label: string;
  exact?: boolean;
}) {
  const pathname = usePathname();
  const active = exact
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
  const onClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (href === "/" && active && typeof window !== "undefined") {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("layers:home-retap-refresh"));
      }
    },
    [active, href],
  );

  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[0.65rem] font-semibold leading-tight ${
        active ? "text-white" : "text-white/55 hover:text-white/85"
      }`}
    >
      <span className="text-xl leading-none" aria-hidden>
        {icon}
      </span>
      <span className="max-w-full truncate px-0.5 text-center">{label}</span>
    </Link>
  );
}

export function MobileBottomNav() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/15 bg-zinc-950/98 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-md md:hidden"
      role="navigation"
      aria-label="Main mobile"
    >
      <div className="mx-auto flex max-w-3xl items-stretch justify-evenly px-1">
        <NavItem href="/" icon="🏠" label="Home" exact />
        <NavItem href="/leaderboard" icon="🏆" label="Leaderboard" />
        <NavItem href="/settings" icon="⚙️" label="Settings" />
      </div>
    </nav>
  );
}

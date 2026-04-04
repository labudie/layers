import Link from "next/link";
import type { ReactNode } from "react";
import { AtHandle, AtUsernameDisplay } from "@/lib/AtHandle";
import { stripAtHandle } from "@/lib/username-display";

/** Purple handle links: no underline until hover. */
export const profileHandleLinkClass =
  "text-[var(--accent)] no-underline hover:underline decoration-[var(--accent)] underline-offset-2";

type UsernameLinkProps = {
  username: string | null | undefined;
  fallbackDisplay: string;
  children?: ReactNode;
};

/** Links to /profile/[handle] when username is set; otherwise renders children or plain display. */
export function ProfileUsernameLink({
  username,
  fallbackDisplay,
  children,
}: UsernameLinkProps) {
  const handle = stripAtHandle(username ?? "");
  if (!handle.length) {
    return (
      <>
        {children ?? (
          <AtUsernameDisplay raw="" fallback={fallbackDisplay} />
        )}
      </>
    );
  }
  return (
    <Link
      href={`/profile/${encodeURIComponent(handle)}`}
      className={profileHandleLinkClass}
    >
      {children ?? (
        <AtUsernameDisplay raw={username ?? handle} fallback={fallbackDisplay} />
      )}
    </Link>
  );
}

export function CreatorProfileLink({ raw }: { raw: string | null | undefined }) {
  const b = stripAtHandle(raw ?? "");
  if (!b.length) return "—";
  return (
    <Link
      href={`/profile/${encodeURIComponent(b)}`}
      className={profileHandleLinkClass}
    >
      <AtHandle>@{b}</AtHandle>
    </Link>
  );
}

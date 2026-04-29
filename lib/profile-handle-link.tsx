"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { AtHandle, AtUsernameDisplay } from "@/lib/AtHandle";
import { stripAtHandle } from "@/lib/username-display";
import { ProfileBottomSheet } from "@/app/components/ProfileBottomSheet";

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
  const [sheetOpen, setSheetOpen] = useState(false);
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
    <>
      <button
        type="button"
        className={`${profileHandleLinkClass} cursor-pointer border-none bg-transparent p-0 font-inherit`}
        onClick={() => setSheetOpen(true)}
      >
        {children ?? (
          <AtUsernameDisplay raw={username ?? handle} fallback={fallbackDisplay} />
        )}
      </button>
      <ProfileBottomSheet
        username={handle}
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </>
  );
}

export function CreatorProfileLink({
  raw,
  children,
}: {
  raw: string | null | undefined;
  children?: ReactNode;
}) {
  const b = stripAtHandle(raw ?? "");
  const [sheetOpen, setSheetOpen] = useState(false);
  if (!b.length) return "—";
  return (
    <>
      <button
        type="button"
        className={`${profileHandleLinkClass} cursor-pointer border-none bg-transparent p-0 font-inherit`}
        onClick={() => setSheetOpen(true)}
      >
        {children ?? <AtHandle>@{b}</AtHandle>}
      </button>
      <ProfileBottomSheet
        username={b}
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </>
  );
}

import type { ReactNode } from "react";
import { formatAtUsername, stripAtHandle } from "@/lib/username-display";

export function AtHandle({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={className ? `at-handle ${className}` : "at-handle"}>
      {children}
    </span>
  );
}

export function AtUsernameDisplay({
  raw,
  fallback,
}: {
  raw: string | null | undefined;
  fallback: string;
}) {
  return <AtHandle>{formatAtUsername(raw, fallback)}</AtHandle>;
}

export function AtCreatorDisplay({ raw }: { raw: string | null | undefined }) {
  const b = stripAtHandle(raw ?? "");
  if (!b.length) return "—";
  return <AtHandle>@{b}</AtHandle>;
}

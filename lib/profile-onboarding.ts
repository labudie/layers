import { stripAtHandle } from "@/lib/username-display";

/** True when the user must pick a username on /onboarding before using the app. */
export function needsUsernameOnboarding(username: string | null | undefined): boolean {
  const s = stripAtHandle(username ?? "").trim();
  return s.length === 0;
}

"use client";

import { useRouter } from "next/navigation";
import { AppSiteChrome } from "@/app/components/AppSiteChrome";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  isValidUsernameNormalized,
  normalizeUsernameForStorage,
  sanitizeUsernameLiveInput,
  USERNAME_SPACE_ERROR,
} from "@/lib/username-input";
import { sanitizeUserTextField } from "@/lib/supabase-field-sanitize";
import { claimUnlinkedCreatorChallenges } from "@/lib/claim-creator-challenges";
import { needsUsernameOnboarding } from "@/lib/profile-onboarding";

type CheckState = "idle" | "checking" | "available" | "taken" | "invalid";

export default function OnboardingPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [googleAvatar, setGoogleAvatar] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [raw, setRaw] = useState("");
  const [spaceError, setSpaceError] = useState(false);
  const [check, setCheck] = useState<CheckState>("idle");
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sb = supabase();
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (!user) {
        if (!cancelled) setAuthChecked(true);
        router.replace("/login");
        return;
      }

      const { data: row } = await sb
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .maybeSingle();
      const username = (row as { username?: string | null } | null)?.username;
      if (!needsUsernameOnboarding(username)) {
        if (!cancelled) setAuthChecked(true);
        router.replace("/");
        return;
      }
      if (!cancelled) {
        setUserId(user.id);
        const meta = user.user_metadata as
          | { avatar_url?: string | null; picture?: string | null }
          | undefined;
        setGoogleAvatar(meta?.avatar_url ?? meta?.picture ?? null);
        setAuthChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const normalized = normalizeUsernameForStorage(sanitizeUserTextField(raw, 128));

  const runAvailabilityCheck = useCallback(
    async (candidate: string, uid: string) => {
      if (!isValidUsernameNormalized(candidate)) {
        setCheck("invalid");
        return;
      }
      setCheck("checking");
      const sb = supabase();
      const { data, error } = await sb
        .from("profiles")
        .select("id")
        .eq("username", candidate)
        .maybeSingle();
      if (error) {
        setCheck("idle");
        return;
      }
      if (data && (data as { id: string }).id !== uid) {
        setCheck("taken");
        return;
      }
      setCheck("available");
    },
    [],
  );

  useEffect(() => {
    if (!userId) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!normalized.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset UI when input cleared
      setCheck("idle");
      return;
    }
    debounceRef.current = setTimeout(() => {
      void runAvailabilityCheck(normalized, userId);
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [normalized, userId, runAvailabilityCheck]);

  function onChangeInput(v: string) {
    const { value, hadSpace } = sanitizeUsernameLiveInput(v);
    setRaw(value);
    setSpaceError(hadSpace);
  }

  const canSubmit =
    userId &&
    isValidUsernameNormalized(normalized) &&
    check === "available" &&
    !saving;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !userId) return;
    setSaving(true);
    const sb = supabase();
    const candidate = normalized;
    const { data: taken } = await sb
      .from("profiles")
      .select("id")
      .eq("username", candidate)
      .maybeSingle();
    if (taken && (taken as { id: string }).id !== userId) {
      setCheck("taken");
      setSaving(false);
      return;
    }
    const { error } = await sb.from("profiles").upsert(
      {
        id: userId,
        username: candidate,
        ...(googleAvatar ? { avatar_url: googleAvatar } : {}),
      },
      { onConflict: "id" },
    );
    if (error) {
      setLoadError(error.message);
      setSaving(false);
      return;
    }
    await claimUnlinkedCreatorChallenges(sb, userId, candidate);
    router.refresh();
    await router.replace("/");
  }

  if (!authChecked) {
    return (
      <AppSiteChrome title="Layers">
        <div className="flex flex-1 items-center justify-center px-4 py-10 text-sm text-white/60">
          Loading...
        </div>
      </AppSiteChrome>
    );
  }

  return (
    <AppSiteChrome title="Layers">
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-extrabold tracking-tight text-white">
          Welcome to Layers
        </h1>
        <p className="mt-2 text-sm text-white/65">Choose your username</p>

        <form className="mt-8 text-left" onSubmit={(e) => void onSubmit(e)}>
          <label className="block text-xs font-bold uppercase tracking-wider text-white/50">
            Username
          </label>
          <div className="mt-2 flex items-stretch overflow-hidden rounded-xl border border-white/15 bg-black/35">
            <span className="flex items-center border-r border-white/10 bg-white/5 px-3 text-lg font-semibold text-white/70">
              @
            </span>
            <input
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={raw}
              onChange={(e) => onChangeInput(e.target.value)}
              className="min-w-0 flex-1 bg-transparent px-3 py-3 text-base text-white outline-none"
              placeholder="your_handle"
            />
            <span className="flex w-10 shrink-0 items-center justify-center text-lg">
              {check === "checking" ? (
                <span className="text-white/40">…</span>
              ) : check === "available" ? (
                <span className="text-emerald-400" aria-label="Available">
                  ✓
                </span>
              ) : check === "taken" || check === "invalid" ? (
                <span className="text-red-400" aria-label="Not available">
                  ✕
                </span>
              ) : null}
            </span>
          </div>
          <p className="mt-2 text-xs text-white/45">
            Only letters, numbers, underscores and hyphens allowed. Usernames are
            lowercase only.
          </p>
          {spaceError ? (
            <p className="mt-2 text-sm text-amber-200">{USERNAME_SPACE_ERROR}</p>
          ) : null}
          {check === "taken" ? (
            <p className="mt-2 text-sm text-red-200">That username is already taken.</p>
          ) : null}
          {check === "invalid" && normalized.length > 0 ? (
            <p className="mt-2 text-sm text-red-200">
              Use 2–32 characters (letters, numbers, _ and - only).
            </p>
          ) : null}
          {loadError ? (
            <p className="mt-2 text-sm text-red-200">{loadError}</p>
          ) : null}

          <button
            type="submit"
            disabled={!canSubmit}
            className="mt-8 w-full rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-bold text-white transition hover:bg-[var(--accent2)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Saving…" : "Let's Play →"}
          </button>
        </form>
        </div>
      </div>
    </AppSiteChrome>
  );
}

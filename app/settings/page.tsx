"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppSiteChrome } from "@/app/components/AppSiteChrome";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { BADGE_DEFS, type BadgeId } from "@/lib/badges";
import {
  readGameSoundEnabled,
  writeGameSoundEnabled,
} from "@/lib/game-sound";
import { AtUsernameDisplay } from "@/lib/AtHandle";
import {
  isValidUsernameNormalized,
  normalizeUsernameForStorage,
  sanitizeUsernameLiveInput,
  USERNAME_SPACE_ERROR,
} from "@/lib/username-input";

export default function SettingsPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [notifEmail, setNotifEmail] = useState(false);
  const [notifDaily, setNotifDaily] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [stats, setStats] = useState({
    current_streak: 0,
    longest_streak: 0,
    total_solved: 0,
    perfect_days: 0,
  });
  const [earnedBadges, setEarnedBadges] = useState<BadgeId[]>([]);
  const [gameSoundOn, setGameSoundOn] = useState(true);
  const [usernameFieldError, setUsernameFieldError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent === true;
      if (!silent) setLoading(true);
      setError(null);
      try {
        const sb = supabase();
        const {
          data: { user },
        } = await sb.auth.getUser();
        if (!user) {
          router.replace("/login");
          return;
        }
        setUserId(user.id);
        setEmail(user.email ?? null);

        const { data: profile, error: profileError } = await sb
          .from("profiles")
          .select(
            "username, avatar_url, current_streak, longest_streak, total_solved, perfect_days, badges",
          )
          .eq("id", user.id)
          .maybeSingle();

        if (profileError) {
          setError(profileError.message);
        } else {
          const row = profile as {
            username?: string | null;
            avatar_url?: string | null;
            current_streak?: number | null;
            longest_streak?: number | null;
            total_solved?: number | null;
            perfect_days?: number | null;
            badges?: string[] | null;
          } | null;
          setDisplayName(row?.username ?? "");
          setAvatarUrl(row?.avatar_url ?? null);
          setStats({
            current_streak: row?.current_streak ?? 0,
            longest_streak: row?.longest_streak ?? 0,
            total_solved: row?.total_solved ?? 0,
            perfect_days: row?.perfect_days ?? 0,
          });
          setEarnedBadges(((row?.badges ?? []) as BadgeId[]).slice(0, 32));
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [router],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setGameSoundOn(readGameSoundEnabled());
  }, []);

  async function saveProfile() {
    if (!userId) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const normalized = normalizeUsernameForStorage(displayName);
      if (!isValidUsernameNormalized(normalized)) {
        setError("Username must be 2–32 characters (letters, numbers, _ and - only).");
        return;
      }
      const { error: upsertError } = await supabase().from("profiles").upsert(
        {
          id: userId,
          username: normalized,
          avatar_url: avatarUrl,
        },
        { onConflict: "id" }
      );
      if (upsertError) {
        setError(upsertError.message);
        return;
      }
      setDisplayName(normalized);
      setSuccess("Profile saved.");
      window.setTimeout(() => setSuccess(null), 2000);
    } finally {
      setSaving(false);
    }
  }

  async function onAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    setUploading(true);
    setError(null);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const safeExt = ["jpg", "jpeg", "png", "webp", "gif"].includes(ext)
        ? ext
        : "jpg";
      const path = `${userId}/${Date.now()}.${safeExt}`;
      const sb = supabase();
      const { error: upErr } = await sb.storage
        .from("avatars")
        .upload(path, file, { upsert: true, cacheControl: "3600" });
      if (upErr) {
        setError(upErr.message);
        return;
      }
      const { data: pub } = sb.storage.from("avatars").getPublicUrl(path);
      setAvatarUrl(pub.publicUrl);
      const { data: existing } = await sb
        .from("profiles")
        .select("username")
        .eq("id", userId)
        .maybeSingle();
      const prevUsername =
        (existing as { username?: string | null } | null)?.username ?? "";
      const normalized = normalizeUsernameForStorage(
        prevUsername || displayName,
      );
      if (!isValidUsernameNormalized(normalized)) {
        setError("Set a valid username (2–32 characters) before uploading a photo.");
        return;
      }
      const { error: upsertError } = await sb.from("profiles").upsert(
        {
          id: userId,
          username: normalized,
          avatar_url: pub.publicUrl,
        },
        { onConflict: "id" }
      );
      if (upsertError) {
        setError(upsertError.message);
        return;
      }
      setSuccess("Photo updated.");
      window.setTimeout(() => setSuccess(null), 2000);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleSignOut() {
    await supabase().auth.signOut();
    router.refresh();
    router.push("/");
  }

  function comingSoon() {
    window.alert("Coming soon");
  }

  useEffect(() => {
    if (!editingName) return;
    nameInputRef.current?.focus();
    nameInputRef.current?.select();
  }, [editingName]);

  return (
    <AppSiteChrome
      title="Settings"
      className="min-h-0 overflow-visible"
      contentClassName="min-h-0 overflow-visible"
    >
      <div
        style={{
          height: "100dvh",
          overflowY: "scroll",
          WebkitOverflowScrolling: "touch",
          position: "relative",
        }}
      >
        <div className="mx-auto w-full min-w-0 max-w-2xl px-4 pt-5 pb-[100px] md:px-5 md:pt-6 md:pb-[100px]">
        {loading ? (
          <div className="mt-10 text-white/70">Loading…</div>
        ) : (
          <div className="space-y-5">
            <section className="rounded-2xl border border-white/10 bg-[rgba(26,10,46,0.62)] p-5">
              <div className="flex flex-col items-center text-center">
                <label className="group relative cursor-pointer">
                  <div className="h-20 w-20 rounded-full border-2 border-[var(--accent)]/55 bg-black/40 p-[2px]">
                    <div className="h-full w-full rounded-full bg-black/40">
                      {avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={avatarUrl}
                          alt=""
                          className="h-full w-full rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-2xl text-white/35">
                          👤
                        </div>
                      )}
                    </div>
                  </div>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => void onAvatarChange(e)}
                    disabled={uploading}
                  />
                </label>
                <div className="mt-2 text-xs font-medium text-white/55">
                  {uploading ? "Uploading photo..." : "Tap to change photo"}
                </div>

                <div className="mt-3 flex flex-col items-center gap-1">
                  <div className="flex items-center gap-2">
                  {editingName ? (
                    <input
                      ref={nameInputRef}
                      type="text"
                      autoComplete="username"
                      autoCapitalize="none"
                      value={displayName}
                      onChange={(e) => {
                        const { value, hadSpace } = sanitizeUsernameLiveInput(
                          e.target.value,
                        );
                        setDisplayName(value);
                        setUsernameFieldError(
                          hadSpace ? USERNAME_SPACE_ERROR : null,
                        );
                      }}
                      onBlur={() => {
                        setEditingName(false);
                        void saveProfile();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          setEditingName(false);
                          void saveProfile();
                        }
                      }}
                      className="at-handle w-48 rounded-lg border border-white/15 bg-black/30 px-3 py-1.5 text-center text-base text-white outline-none"
                      placeholder="your_username"
                    />
                  ) : (
                    <div className="text-lg font-semibold text-white">
                      <AtUsernameDisplay raw={displayName} fallback="Player" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditingName((x) => !x)}
                    className="text-sm font-semibold text-[var(--accent2)] hover:underline"
                  >
                    Edit
                  </button>
                  </div>
                  {editingName ? (
                    <p className="max-w-xs text-center text-xs text-white/45">
                      Only letters, numbers, underscores and hyphens allowed.
                      Usernames are lowercase only.
                    </p>
                  ) : null}
                  {usernameFieldError ? (
                    <p className="max-w-xs text-center text-xs text-amber-200">
                      {usernameFieldError}
                    </p>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="-mx-1 overflow-x-auto pb-1">
              <div className="flex min-w-max gap-2 px-1">
                <div className="rounded-full border border-white/12 bg-white/6 px-4 py-2 text-sm font-semibold text-white/90">
                  🔥 {stats.current_streak} day streak
                </div>
                <div className="rounded-full border border-white/12 bg-white/6 px-4 py-2 text-sm font-semibold text-white/90">
                  ⚡ {stats.total_solved} solved
                </div>
                <div className="rounded-full border border-white/12 bg-white/6 px-4 py-2 text-sm font-semibold text-white/90">
                  🏆 {stats.perfect_days} perfect days
                </div>
                <div className="rounded-full border border-white/12 bg-white/6 px-4 py-2 text-sm font-semibold text-white/90">
                  📅 {stats.longest_streak} best streak
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-[rgba(26,10,46,0.62)] p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-bold text-white/90">Badges</div>
                <Link
                  href="/badges"
                  className="text-sm font-semibold text-[var(--accent2)] hover:underline"
                >
                  View all →
                </Link>
              </div>
              <div className="-mx-1 overflow-x-auto pb-1">
                <div className="flex min-w-max gap-2 px-1">
                  {BADGE_DEFS.map((badge) => {
                    const earned = earnedBadges.includes(badge.id);
                    return (
                      <span
                        key={badge.id}
                        title={badge.name}
                        className={`inline-flex h-10 w-10 items-center justify-center rounded-full border text-base ${
                          earned
                            ? "border-[var(--accent)]/45 bg-[var(--accent)]/20"
                            : "border-white/12 bg-white/5 text-white/35 grayscale"
                        }`}
                      >
                        {badge.icon}
                      </span>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div>
                <div className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-white/45">
                  Account
                </div>
                <div className="rounded-2xl border border-white/10 bg-[rgba(26,10,46,0.62)]">
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-white/85">Email</span>
                    <span className="max-w-[60%] truncate text-sm text-white/55">
                      {email ?? "—"}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-white/45">
                  Gameplay
                </div>
                <div className="rounded-2xl border border-white/10 bg-[rgba(26,10,46,0.62)]">
                  <label className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-white/85">Guess sounds</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={gameSoundOn}
                      onClick={() => {
                        const next = !gameSoundOn;
                        setGameSoundOn(next);
                        writeGameSoundEnabled(next);
                      }}
                      className={`settings-toggle-track relative inline-flex h-7 w-12 items-center rounded-full ${
                        gameSoundOn ? "bg-[#7c3aed]" : "bg-white/20"
                      }`}
                    >
                      <span
                        className={`settings-toggle-thumb inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ${
                          gameSoundOn ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </label>
                </div>
              </div>

              <div>
                <div className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-white/45">
                  Notifications
                </div>
                <div className="rounded-2xl border border-white/10 bg-[rgba(26,10,46,0.62)]">
                  <label className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                    <span className="text-sm text-white/85">Email notifications</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={notifEmail}
                      onClick={() => setNotifEmail((v) => !v)}
                      className={`settings-toggle-track relative inline-flex h-7 w-12 items-center rounded-full ${
                        notifEmail ? "bg-[#7c3aed]" : "bg-white/20"
                      }`}
                    >
                      <span
                        className={`settings-toggle-thumb inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ${
                          notifEmail ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </label>
                  <label className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-white/85">Daily reminder</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={notifDaily}
                      onClick={() => setNotifDaily((v) => !v)}
                      className={`settings-toggle-track relative inline-flex h-7 w-12 items-center rounded-full ${
                        notifDaily ? "bg-[#7c3aed]" : "bg-white/20"
                      }`}
                    >
                      <span
                        className={`settings-toggle-thumb inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ${
                          notifDaily ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </label>
                </div>
              </div>

              <div>
                <div className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-white/45">
                  Legal
                </div>
                <div
                  className="rounded-2xl border border-white/10 bg-[rgba(26,10,46,0.62)]"
                  data-no-tap-haptic
                >
                  <Link
                    href="/terms"
                    className="settings-row-tap tap-press flex min-h-[48px] items-center justify-between border-b border-white/10 px-4 py-3 text-sm text-white/90 hover:bg-white/5 active:bg-white/[0.07]"
                  >
                    <span>Terms &amp; Conditions</span>
                    <span className="text-white/40">›</span>
                  </Link>
                  <Link
                    href="/privacy"
                    className="settings-row-tap tap-press flex min-h-[48px] items-center justify-between px-4 py-3 text-sm text-white/90 hover:bg-white/5 active:bg-white/[0.07]"
                  >
                    <span>Privacy Policy</span>
                    <span className="text-white/40">›</span>
                  </Link>
                </div>
              </div>

              <div>
                <div className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-white/45">
                  Support
                </div>
                <div className="rounded-2xl border border-white/10 bg-[rgba(26,10,46,0.62)]">
                  <button
                    type="button"
                    onClick={comingSoon}
                    className="settings-row-tap flex min-h-[48px] w-full items-center justify-between border-b border-white/10 px-4 py-3 text-sm text-white/90 hover:bg-white/5 active:bg-white/[0.07]"
                  >
                    <span>Send feedback</span>
                    <span className="text-white/40">→</span>
                  </button>
                  <button
                    type="button"
                    onClick={comingSoon}
                    className="settings-row-tap flex min-h-[48px] w-full items-center justify-between px-4 py-3 text-sm text-white/90 hover:bg-white/5 active:bg-white/[0.07]"
                  >
                    <span>Rate the app</span>
                    <span className="text-white/40">→</span>
                  </button>
                </div>
              </div>

              <div className="pt-1 text-center">
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="text-sm font-semibold text-red-300 hover:text-red-200"
                >
                  Sign Out
                </button>
              </div>

              <div className="space-y-2">
                {error ? (
                  <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                    {error}
                  </p>
                ) : null}
                {success ? (
                  <p className="rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white/90">
                    {saving ? "Saving..." : success}
                  </p>
                ) : null}
              </div>
            </section>

          </div>
        )}
        </div>
      </div>
    </AppSiteChrome>
  );
}

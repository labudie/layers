"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { BADGE_DEFS, type BadgeId } from "@/lib/badges";

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
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
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
        "username, avatar_url, current_streak, longest_streak, total_solved, perfect_days, badges"
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
      setEarnedBadges(((row?.badges ?? []) as BadgeId[]).slice(0, 12));
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveProfile() {
    if (!userId) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const trimmed = displayName.trim();
      const { error: upsertError } = await supabase().from("profiles").upsert(
        {
          id: userId,
          username: trimmed,
          avatar_url: avatarUrl,
        },
        { onConflict: "id" }
      );
      if (upsertError) {
        setError(upsertError.message);
        return;
      }
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
      const { error: upsertError } = await sb.from("profiles").upsert(
        {
          id: userId,
          username:
            prevUsername ||
            displayName.trim() ||
            `player_${userId.slice(0, 8)}`,
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

  useEffect(() => {
    if (!editingName) return;
    nameInputRef.current?.focus();
    nameInputRef.current?.select();
  }, [editingName]);

  return (
    <div className="min-h-screen w-full bg-[var(--background)] text-[var(--text)]">
      <div className="mx-auto w-full max-w-2xl px-4 py-5 md:px-5 md:py-6">
        <header className="mb-5 flex items-center justify-between rounded-2xl border border-white/10 bg-[rgba(26,10,46,0.7)] px-4 py-3">
          <div className="text-lg font-extrabold tracking-tight">Layers</div>
          <Link
            href="/"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-base font-bold text-white hover:bg-white/10"
            aria-label="Back"
          >
            ←
          </Link>
        </header>

        {loading ? (
          <div className="mt-10 text-white/70">Loading…</div>
        ) : (
          <div className="space-y-5">
            <section className="rounded-2xl border border-white/10 bg-[rgba(26,10,46,0.62)] p-5">
              <div className="flex flex-col items-center text-center">
                <label className="group relative cursor-pointer">
                  <div className="h-20 w-20 overflow-hidden rounded-full border-2 border-[var(--accent)]/55 bg-black/40 p-[2px]">
                    <div className="h-full w-full overflow-hidden rounded-full bg-black/40">
                      {avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={avatarUrl}
                          alt=""
                          className="h-full w-full object-cover"
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

                <div className="mt-3 flex items-center gap-2">
                  {editingName ? (
                    <input
                      ref={nameInputRef}
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
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
                      className="w-48 rounded-lg border border-white/15 bg-black/30 px-3 py-1.5 text-center text-base font-semibold text-white outline-none"
                      placeholder="Display name"
                    />
                  ) : (
                    <div className="text-lg font-semibold text-white">
                      {displayName.trim() || "Player"}
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
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-[rgba(26,10,46,0.62)]">
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
                  Notifications
                </div>
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-[rgba(26,10,46,0.62)]">
                  <label className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                    <span className="text-sm text-white/85">Email notifications</span>
                    <input
                      type="checkbox"
                      checked={notifEmail}
                      onChange={(e) => setNotifEmail(e.target.checked)}
                      className="h-5 w-5 rounded border-white/30"
                    />
                  </label>
                  <label className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-white/85">Daily reminder</span>
                    <input
                      type="checkbox"
                      checked={notifDaily}
                      onChange={(e) => setNotifDaily(e.target.checked)}
                      className="h-5 w-5 rounded border-white/30"
                    />
                  </label>
                </div>
              </div>

              <div>
                <div className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-white/45">
                  Legal
                </div>
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-[rgba(26,10,46,0.62)]">
                  <Link
                    href="/terms"
                    className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-sm text-white/90 hover:bg-white/5"
                  >
                    <span>Terms &amp; Conditions</span>
                    <span className="text-white/40">›</span>
                  </Link>
                  <Link
                    href="/privacy"
                    className="flex items-center justify-between px-4 py-3 text-sm text-white/90 hover:bg-white/5"
                  >
                    <span>Privacy Policy</span>
                    <span className="text-white/40">›</span>
                  </Link>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-red-500/35 bg-red-950/20">
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="w-full px-4 py-3 text-sm font-semibold text-red-200 hover:bg-red-900/25"
                >
                  Sign out
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
  );
}

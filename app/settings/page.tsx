"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
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
  const [stats, setStats] = useState({
    current_streak: 0,
    longest_streak: 0,
    total_solved: 0,
    perfect_days: 0,
  });
  const [earnedBadges, setEarnedBadges] = useState<BadgeId[]>([]);

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

  return (
    <div className="min-h-screen w-full bg-[var(--background)] text-[var(--text)]">
      <div className="mx-auto w-full max-w-xl px-4 py-8 md:px-5">
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
          >
            ← Back
          </Link>
        </div>

        <h1 className="text-3xl font-extrabold tracking-tight">Settings</h1>
        <p className="mt-2 text-sm text-white/55">
          Profile, account, notifications, legal, and sign out.
        </p>

        {loading ? (
          <div className="mt-10 text-white/70">Loading…</div>
        ) : (
          <div className="mt-8 space-y-8">
            <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <h2 className="text-lg font-extrabold">Progress</h2>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
                  <div className="text-xs uppercase tracking-wider text-white/50">
                    Current streak
                  </div>
                  <div className="mt-1 text-lg font-bold text-orange-200">
                    🔥 {stats.current_streak}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
                  <div className="text-xs uppercase tracking-wider text-white/50">
                    Longest streak
                  </div>
                  <div className="mt-1 text-lg font-bold text-white">
                    {stats.longest_streak}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
                  <div className="text-xs uppercase tracking-wider text-white/50">
                    Total solved
                  </div>
                  <div className="mt-1 text-lg font-bold text-white">
                    {stats.total_solved}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
                  <div className="text-xs uppercase tracking-wider text-white/50">
                    Perfect days
                  </div>
                  <div className="mt-1 text-lg font-bold text-white">
                    {stats.perfect_days}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-white/90">My Badges</h3>
                <Link
                  href="/badges"
                  className="text-xs font-semibold text-[var(--accent2)] hover:underline"
                >
                  View all badges →
                </Link>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {BADGE_DEFS.filter((b) => earnedBadges.includes(b.id)).length === 0 ? (
                  <span className="text-sm text-white/55">No badges earned yet.</span>
                ) : (
                  BADGE_DEFS.filter((b) => earnedBadges.includes(b.id)).map((badge) => (
                    <span
                      key={badge.id}
                      title={badge.name}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--accent)]/40 bg-[var(--accent)]/20 text-sm"
                    >
                      {badge.icon}
                    </span>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <h2 className="text-lg font-extrabold">Profile</h2>
              <p className="mt-1 text-sm text-white/55">
                Display name and profile photo (stored in Supabase Storage bucket{" "}
                <code className="text-white/80">avatars</code>).
              </p>
              <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="flex shrink-0 flex-col items-center gap-2">
                  <div className="h-24 w-24 overflow-hidden rounded-full border border-white/15 bg-black/40">
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatarUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-3xl text-white/35">
                        👤
                      </div>
                    )}
                  </div>
                  <label className="cursor-pointer rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15">
                    {uploading ? "Uploading…" : "Upload photo"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      onChange={(e) => void onAvatarChange(e)}
                      disabled={uploading}
                    />
                  </label>
                </div>
                <div className="min-w-0 flex-1">
                  <label className="text-sm font-semibold text-white/80">
                    Display name
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-white outline-none placeholder:text-white/30"
                    placeholder="Your name"
                  />
                  <button
                    type="button"
                    onClick={() => void saveProfile()}
                    disabled={saving}
                    className="mt-3 rounded-xl bg-white px-4 py-2 text-sm font-bold text-black disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save profile"}
                  </button>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <h2 className="text-lg font-extrabold">Account</h2>
              <p className="mt-1 text-sm text-white/55">Email address (read only)</p>
              <p className="mt-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/90">
                {email ?? "—"}
              </p>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <h2 className="text-lg font-extrabold">App</h2>
              <p className="mt-1 text-sm text-white/55">
                Notification preferences (coming soon).
              </p>
              <label className="mt-4 flex cursor-pointer items-center justify-between gap-3 border-b border-white/10 py-3">
                <span className="text-sm font-medium text-white/85">
                  Email notifications
                </span>
                <input
                  type="checkbox"
                  checked={notifEmail}
                  onChange={(e) => setNotifEmail(e.target.checked)}
                  className="h-5 w-5 rounded border-white/30"
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between gap-3 py-3">
                <span className="text-sm font-medium text-white/85">
                  Daily reminder
                </span>
                <input
                  type="checkbox"
                  checked={notifDaily}
                  onChange={(e) => setNotifDaily(e.target.checked)}
                  className="h-5 w-5 rounded border-white/30"
                />
              </label>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <h2 className="text-lg font-extrabold">Legal</h2>
              <div className="mt-4 flex flex-col gap-2">
                <Link
                  href="/terms"
                  className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-semibold text-white/90 hover:bg-white/10"
                >
                  Terms &amp; Conditions →
                </Link>
                <Link
                  href="/privacy"
                  className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-semibold text-white/90 hover:bg-white/10"
                >
                  Privacy Policy →
                </Link>
              </div>
            </section>

            <section className="rounded-2xl border border-red-500/30 bg-red-950/20 p-5">
              <h2 className="text-lg font-extrabold text-red-300">Danger zone</h2>
              <p className="mt-1 text-sm text-white/55">
                Sign out of your account on this device.
              </p>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="mt-4 w-full rounded-xl border border-red-500/50 bg-red-950/40 px-4 py-3 text-sm font-bold text-red-200 hover:bg-red-950/60"
              >
                Sign out
              </button>
            </section>

            {error ? (
              <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {error}
              </p>
            ) : null}
            {success ? (
              <p className="rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white/90">
                {success}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

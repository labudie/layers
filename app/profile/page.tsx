"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Profile = {
  id: string;
  username: string | null;
};

export default function ProfilePage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      setSuccess(null);

      const sb = supabase();
      const { data: authData } = await sb.auth.getUser();
      const user = authData.user;

      if (!user) {
        if (!cancelled) router.replace("/login");
        return;
      }

      const user_id = user.id;
      setUserId(user_id);

      const { data: profileData, error: profileError } = await sb
        .from("profiles")
        .select("id, username")
        .eq("id", user_id)
        .maybeSingle();

      if (cancelled) return;

      if (profileError) {
        setError(profileError.message);
        setUsername("");
        return;
      }

      setUsername(((profileData as Profile | null) ?? null)?.username ?? "");
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function onSave() {
    if (!userId) return;
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const trimmed = username.trim();
      const sb = supabase();
      const { error: upsertError } = await sb
        .from("profiles")
        .upsert(
          {
            id: userId,
            username: trimmed,
          },
          { onConflict: "id" }
        );

      if (upsertError) {
        setError(upsertError.message);
        return;
      }

      setSuccess("Saved!");
      window.setTimeout(() => setSuccess(null), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen w-full bg-black text-white">
      <div className="mx-auto w-full max-w-xl px-4 py-8 md:px-5">
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
          >
            ← Back
          </Link>
        </div>

        <h1 className="text-3xl font-extrabold tracking-tight">Profile</h1>
        <p className="mt-2 text-sm text-white/60">
          Set your display name for the leaderboard.
        </p>

        {loading ? (
          <div className="mt-10 text-white/70">Loading…</div>
        ) : (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
            <div>
              <label className="text-sm font-semibold text-white/80">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-2 w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-white outline-none placeholder:text-white/30"
                placeholder="player_123456"
              />
            </div>

            {error ? (
              <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {error}
              </p>
            ) : null}

            {success ? (
              <p className="mt-3 rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white/90">
                {success}
              </p>
            ) : null}

            <button
              type="button"
              onClick={() => void onSave()}
              disabled={saving}
              className="mt-5 w-full rounded-xl bg-white px-5 py-3 text-sm font-bold text-black disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


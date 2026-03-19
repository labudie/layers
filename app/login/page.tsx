"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase";

export default function LoginPage() {
  async function signInWithGoogle() {
    const supabase = createSupabaseBrowserClient();
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";

    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback`,
      },
    });
  }

  return (
    <main className="min-h-screen w-full bg-black text-white flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="text-2xl font-extrabold tracking-tight">layers</div>
        <div className="mt-2 text-sm text-white/70">
          Sign in to save your progress and play today’s challenge.
        </div>

        <button
          type="button"
          onClick={signInWithGoogle}
          className="mt-6 w-full rounded-xl bg-white px-5 py-3 text-sm font-bold text-black"
        >
          Continue with Google
        </button>

        <div className="mt-4 text-xs text-white/45">
          You’ll be redirected to Google and back.
        </div>
      </div>
    </main>
  );
}


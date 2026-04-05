import Link from "next/link";
import { cookies } from "next/headers";
import { AppSiteChrome } from "@/app/components/AppSiteChrome";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase";
import { BADGE_DEFS, type BadgeId } from "@/lib/badges";

export default async function BadgesPage() {
  const supabase = createSupabaseServerClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("badges")
    .eq("id", user.id)
    .maybeSingle();

  const earned = new Set(((profile as { badges?: string[] | null } | null)?.badges ??
    []) as BadgeId[]);

  return (
    <AppSiteChrome title="Badges">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-5">
        <h1 className="text-3xl font-extrabold tracking-tight">Badges</h1>
        <p className="mt-2 text-sm text-white/60">
          Collect badges by playing daily, keeping streaks, and sharing great work.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {BADGE_DEFS.map((badge) => {
            const isEarned = earned.has(badge.id);
            return (
              <div
                key={badge.id}
                className={`rounded-2xl border p-4 transition ${
                  isEarned
                    ? "border-[var(--accent)]/40 bg-[var(--accent)]/12 text-white"
                    : "border-white/10 bg-white/5 text-white/45 grayscale"
                }`}
              >
                <div className="text-2xl">{badge.icon}</div>
                <div className="mt-2 text-base font-bold">{badge.name}</div>
                <div className="mt-1 text-sm">{badge.description}</div>
                <div className="mt-3 text-xs font-semibold uppercase tracking-wider">
                  {isEarned ? "Earned" : "Locked"}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AppSiteChrome>
  );
}

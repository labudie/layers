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
                className={`relative overflow-hidden rounded-2xl border p-4 transition ${
                  isEarned
                    ? "border-[var(--accent)]/40 bg-[var(--accent)]/12 text-white"
                    : "border-white/10 bg-white/5 text-white/40 grayscale"
                }`}
              >
                <div className="text-2xl">{badge.icon}</div>
                <div className="mt-2 text-base font-bold">{badge.name}</div>
                <div className="mt-1 text-sm">{badge.description}</div>
                <div className="mt-3 text-xs font-semibold uppercase tracking-wider">
                  {isEarned ? "Earned" : "Locked"}
                </div>
                {!isEarned ? (
                  <div
                    className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-black/35 backdrop-blur-[1px]"
                    aria-hidden
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="h-11 w-11 text-white/55 drop-shadow-md"
                    >
                      <path
                        fillRule="evenodd"
                        d="M12 1.5a5.25 5.25 0 0 0-5.25 5.25v3a3 3 0 0 0-3 3v6.75A3.75 3.75 0 0 0 7.5 23.25h9a3.75 3.75 0 0 0 3.75-3.75V12.75a3 3 0 0 0-3-3v-3A5.25 5.25 0 0 0 12 1.5Zm3.75 8.25v-3a3.75 3.75 0 1 0-7.5 0v3h7.5Z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </AppSiteChrome>
  );
}

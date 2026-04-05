import Link from "next/link";
import { cookies } from "next/headers";
import { AppSiteChrome } from "@/app/components/AppSiteChrome";
import { createSupabaseServerClient } from "@/lib/supabase";
import { BADGE_DEFS, type BadgeId } from "@/lib/badges";
import { stripAtHandle } from "@/lib/username-display";
import { ProfileWorkGrid, type WorkItem } from "@/app/profile/ProfileWorkGrid";

function formatJoinDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = iso.slice(0, 10);
  const parsed = new Date(`${d}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type ProfileRow = {
  id: string;
  username: string | null;
  avatar_url: string | null;
  created_at: string | null;
  total_solved: number | null;
  longest_streak: number | null;
  perfect_days: number | null;
  badges: string[] | null;
};

type SubmissionRow = {
  id: number;
  title: string | null;
  software: string | null;
  image_url: string | null;
  scheduled_challenge_id: string | null;
};

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username: rawParam } = await params;
  const decoded = decodeURIComponent(rawParam);
  const handle = stripAtHandle(decoded);
  const drawerBackHome = (
    <Link
      href="/"
      className="inline-flex rounded-xl px-2 py-1.5 text-sm font-semibold text-white/75 hover:bg-white/10 hover:text-white"
    >
      ← Home
    </Link>
  );

  if (!handle.length) {
    return (
      <AppSiteChrome title="Profile" drawerFooterExtra={drawerBackHome}>
        <div className="mx-auto max-w-lg px-4 py-10">
          <p className="mt-6 text-center text-lg font-semibold text-white/75">
            Profile not found
          </p>
        </div>
      </AppSiteChrome>
    );
  }

  const supabase = createSupabaseServerClient(await cookies());

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select(
      "id, username, avatar_url, created_at, total_solved, longest_streak, perfect_days, badges"
    )
    .eq("username", handle)
    .maybeSingle();

  if (profileError || !profileData) {
    return (
      <AppSiteChrome title="Profile" drawerFooterExtra={drawerBackHome}>
        <div className="mx-auto max-w-lg px-4 py-10">
          <p className="mt-6 text-center text-lg font-semibold text-white/75">
            Profile not found
          </p>
        </div>
      </AppSiteChrome>
    );
  }

  const profile = profileData as ProfileRow;
  const earned = new Set((profile.badges ?? []) as BadgeId[]);

  const { data: submissionRows } = await supabase
    .from("submissions")
    .select("id, title, software, image_url, scheduled_challenge_id")
    .eq("user_id", profile.id)
    .eq("status", "approved")
    .order("created_at", { ascending: false });

  const subs = (submissionRows as SubmissionRow[] | null) ?? [];
  const challengeIds = subs
    .map((s) => s.scheduled_challenge_id)
    .filter((id): id is string => Boolean(id));

  const countMap = new Map<string, number>();
  if (challengeIds.length > 0) {
    const { data: countRows } = await supabase.rpc(
      "get_download_counts_for_challenges",
      { p_challenge_ids: challengeIds }
    );
    const rows = (countRows ?? []) as Array<{
      challenge_id: string;
      download_count: number;
    }>;
    for (const r of rows) {
      countMap.set(r.challenge_id, Number(r.download_count) || 0);
    }
  }

  const workItems: WorkItem[] = subs
    .filter((s) => s.image_url)
    .map((s) => ({
      id: s.id,
      title: s.title,
      software: s.software,
      image_url: s.image_url as string,
      download_count: s.scheduled_challenge_id
        ? countMap.get(s.scheduled_challenge_id) ?? 0
        : 0,
    }));

  const displayHandle = profile.username ?? handle;

  return (
    <AppSiteChrome
      title={`@${stripAtHandle(displayHandle)}`}
      drawerFooterExtra={drawerBackHome}
    >
      <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-5">
        <section className="rounded-2xl border border-white/10 bg-[rgba(26,10,46,0.62)] p-6">
          <div className="flex flex-col items-center text-center">
            <div className="h-24 w-24 overflow-hidden rounded-full border-[3px] border-[var(--accent)] bg-black/40 p-[3px] shadow-[0_0_24px_rgba(124,58,237,0.25)]">
              <div className="h-full w-full overflow-hidden rounded-full bg-black/40">
                {profile.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.avatar_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-3xl text-white/35">
                    👤
                  </div>
                )}
              </div>
            </div>
            <h1
              className="mt-4 text-2xl font-bold text-white"
              style={{
                fontFamily:
                  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              }}
            >
              @{stripAtHandle(displayHandle)}
            </h1>
            <p className="mt-1 text-sm text-white/55">
              Joined {formatJoinDate(profile.created_at)}
            </p>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
              <div className="text-lg font-extrabold text-white">
                {profile.total_solved ?? 0}
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-white/45">
                Solved
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
              <div className="text-lg font-extrabold text-white">
                {profile.longest_streak ?? 0}
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-white/45">
                Best streak
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
              <div className="text-lg font-extrabold text-white">
                {profile.perfect_days ?? 0}
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-white/45">
                Perfect days
              </div>
            </div>
          </div>

          <div className="mt-8">
            <div className="text-sm font-bold uppercase tracking-wider text-white/50">
              Badges
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {BADGE_DEFS.map((badge) => {
                const has = earned.has(badge.id);
                return (
                  <span
                    key={badge.id}
                    title={badge.name}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${
                      has
                        ? "border-[var(--accent)]/45 bg-[var(--accent)]/15 text-white"
                        : "border-white/10 bg-white/5 text-white/35 grayscale"
                    }`}
                  >
                    <span>{badge.icon}</span>
                    <span className="font-medium">{badge.name}</span>
                  </span>
                );
              })}
            </div>
          </div>

          <ProfileWorkGrid items={workItems} />
        </section>
      </div>
    </AppSiteChrome>
  );
}

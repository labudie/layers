import type { CSSProperties } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { AppSiteChrome } from "@/app/components/AppSiteChrome";
import { LeaderboardTabBar } from "@/app/components/LeaderboardTabBar";
import type { LeaderboardTabId } from "@/app/components/LeaderboardTabBar";
import { LeaderboardTabPanel } from "@/app/components/LeaderboardTabPanel";
import {
  narrowToLatestActiveDate,
  utcActiveDateWindow,
} from "@/lib/challenge-active-date-window";
import { createSupabaseServerClient } from "@/lib/supabase";
import {
  CreatorProfileLink,
  ProfileUsernameLink,
} from "@/lib/profile-handle-link";

type ResultRow = {
  user_id: string;
  challenge_id: string;
  solved: boolean | null;
  attempts_used: number | null;
  created_at: string | null;
};

type ProfileRow = {
  id: string;
  username: string | null;
  total_solved: number | null;
  longest_streak: number | null;
};

type CreatorRow = {
  creator_name: string | null;
  total_submissions: number | null;
  total_downloads: number | null;
  total_players: number | null;
};

function shortUsername(userId: string) {
  const id = userId?.trim() ?? "";
  if (!id) return "—";
  return id.length <= 8 ? id : id.slice(0, 8);
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const tab: LeaderboardTabId =
    params.tab === "all-time" || params.tab === "creators"
      ? params.tab
      : "daily";

  const supabase = createSupabaseServerClient(await cookies());
  const { start, end } = utcActiveDateWindow();

  const { data: windowChallenges, error: windowChallengesError } = await supabase
    .from("challenges")
    .select("id, active_date")
    .gte("active_date", start)
    .lte("active_date", end)
    .order("active_date", { ascending: false });

  const raw =
    !windowChallengesError && windowChallenges?.length
      ? (windowChallenges as { id: string; active_date: string | null }[])
      : [];
  const narrowedRows = narrowToLatestActiveDate(raw);
  const leaderboardDay = narrowedRows[0]?.active_date ?? "—";
  const challengeIdsForToday = narrowedRows.map((c) => c.id);

  let rows: ResultRow[] = [];
  if (challengeIdsForToday.length) {
    const { data, error } = await supabase
      .from("results")
      .select("user_id, challenge_id, solved, attempts_used, created_at")
      .in("challenge_id", challengeIdsForToday)
      .order("attempts_used", { ascending: true })
      .order("created_at", { ascending: true });

    if (!error && data?.length) {
      rows = data as ResultRow[];
    }
  }

  const empty = !rows.length;

  // Load usernames for the players we need (fallback to user_id prefix).
  const usernameMap = new Map<string, string | null>();
  if (rows.length) {
    const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
    const { data: profileRows, error: profilesError } = await supabase
      .from("profiles")
      .select("id, username")
      .in("id", userIds);

    if (!profilesError && profileRows?.length) {
      (profileRows as ProfileRow[]).forEach((p) => {
        usernameMap.set(p.id, p.username);
      });
    }
  }

  const { data: allTimeProfiles } = await supabase
    .from("profiles")
    .select("id, username, total_solved, longest_streak")
    .order("total_solved", { ascending: false })
    .order("longest_streak", { ascending: false })
    .order("username", { ascending: true });

  const { data: creatorRows } = await supabase
    .from("creator_leaderboard")
    .select("creator_name, total_submissions, total_downloads, total_players")
    .order("total_submissions", { ascending: false })
    .order("total_downloads", { ascending: false })
    .order("total_players", { ascending: false });

  return (
    <AppSiteChrome
      title="Leaderboard"
      drawerFooterExtra={
        <Link
          href="/"
          className="inline-flex rounded-xl px-2 py-1.5 text-sm font-semibold text-white/75 hover:bg-white/10 hover:text-white"
        >
          ← Home
        </Link>
      }
    >
      <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-5">
        <h1 className="text-3xl font-extrabold tracking-tight">Leaderboard</h1>
        <p className="mt-2 text-sm text-white/60">
          Today&apos;s results (active date: {leaderboardDay})
        </p>

        <LeaderboardTabBar current={tab} />

        <LeaderboardTabPanel key={tab} tab={tab}>
        {tab === "daily" ? (
          empty ? (
            <p className="mt-10 text-center text-lg font-semibold text-white/75">
              No results yet
            </p>
          ) : (
            <div className="mt-8 overflow-hidden rounded-2xl border border-white/10">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5 text-xs font-semibold uppercase tracking-wider text-white/50">
                    <th className="px-4 py-3">Rank</th>
                    <th className="px-4 py-3">Username</th>
                    <th className="px-4 py-3">Attempts</th>
                    <th className="px-4 py-3">Solved</th>
                  </tr>
                </thead>
                <tbody className="leaderboard-stagger">
                  {rows.map((row, i) => {
                    const username = usernameMap.get(row.user_id);

                    return (
                      <tr
                        key={`${row.user_id}-${row.created_at ?? ""}-${i}`}
                        className="lb-stagger-row border-b border-white/5 last:border-0"
                        style={{ "--lb-i": i } as CSSProperties}
                      >
                        <td className="px-4 py-3 font-mono font-semibold text-white/90">
                          {i + 1}
                        </td>
                        <td className="px-4 py-3 text-sm text-white/90">
                          <ProfileUsernameLink
                            username={username ?? undefined}
                            fallbackDisplay={shortUsername(row.user_id)}
                          />
                        </td>
                        <td className="px-4 py-3 text-white/80">
                          {row.attempts_used ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-white/80">
                          {row.solved === true
                            ? "Yes"
                            : row.solved === false
                              ? "No"
                              : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : tab === "all-time" ? (
          !(allTimeProfiles?.length ?? 0) ? (
            <p className="mt-10 text-center text-lg font-semibold text-white/75">
              No players yet
            </p>
          ) : (
            <div className="mt-8 overflow-hidden rounded-2xl border border-white/10">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5 text-xs font-semibold uppercase tracking-wider text-white/50">
                    <th className="px-4 py-3">Rank</th>
                    <th className="px-4 py-3">Username</th>
                    <th className="px-4 py-3">Total Solved</th>
                    <th className="px-4 py-3">Longest Streak</th>
                  </tr>
                </thead>
                <tbody className="leaderboard-stagger">
                  {(allTimeProfiles as ProfileRow[]).map((row, i) => {
                    return (
                      <tr
                        key={`${row.id}-${i}`}
                        className="lb-stagger-row border-b border-white/5 last:border-0"
                        style={{ "--lb-i": i } as CSSProperties}
                      >
                        <td className="px-4 py-3 font-mono font-semibold text-white/90">
                          {i + 1}
                        </td>
                        <td className="px-4 py-3 text-sm text-white/90">
                          <ProfileUsernameLink
                            username={row.username ?? undefined}
                            fallbackDisplay={shortUsername(row.id)}
                          />
                        </td>
                        <td className="px-4 py-3 text-white/80">
                          {row.total_solved ?? 0}
                        </td>
                        <td className="px-4 py-3 text-white/80">
                          {row.longest_streak ?? 0}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : !(creatorRows?.length ?? 0) ? (
          <p className="mt-10 text-center text-lg font-semibold text-white/75">
            No creators yet
          </p>
        ) : (
          <div className="mt-8 overflow-hidden rounded-2xl border border-white/10">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/5 text-xs font-semibold uppercase tracking-wider text-white/50">
                  <th className="px-4 py-3">Rank</th>
                  <th className="px-4 py-3">Creator</th>
                  <th className="px-4 py-3">Submissions</th>
                  <th className="px-4 py-3">Downloads</th>
                </tr>
              </thead>
              <tbody className="leaderboard-stagger">
                {(creatorRows as CreatorRow[]).map((row, i) => {
                  return (
                    <tr
                      key={`${row.creator_name ?? "creator"}-${i}`}
                      className="lb-stagger-row border-b border-white/5 last:border-0"
                      style={{ "--lb-i": i } as CSSProperties}
                    >
                      <td className="px-4 py-3 font-mono font-semibold text-white/90">
                        {i + 1}
                      </td>
                      <td className="px-4 py-3 text-sm text-white/90">
                        <CreatorProfileLink raw={row.creator_name} />
                      </td>
                      <td className="px-4 py-3 text-white/80">
                        {row.total_submissions ?? 0}
                      </td>
                      <td className="px-4 py-3 text-white/80">
                        {row.total_downloads ?? 0}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        </LeaderboardTabPanel>
      </div>
    </AppSiteChrome>
  );
}

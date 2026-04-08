import type { CSSProperties } from "react";
import { cookies } from "next/headers";
import { AppSiteChrome } from "@/app/components/AppSiteChrome";
import { LeaderboardPullToRefresh } from "@/app/components/LeaderboardPullToRefresh";
import {
  LeaderboardSwipeArea,
  LeaderboardTabBar,
} from "@/app/components/LeaderboardTabBar";
import type { LeaderboardTabId } from "@/app/components/LeaderboardTabBar";
import { LeaderboardTabPanel } from "@/app/components/LeaderboardTabPanel";
import { createSupabaseServerClient } from "@/lib/supabase";
import {
  CreatorProfileLink,
  ProfileUsernameLink,
} from "@/lib/profile-handle-link";

type DailyProfileEmbed = {
  username: string | null;
  avatar_url: string | null;
};

type DailyChallengeEmbed = {
  title: string | null;
  active_date: string | null;
};

/** Normalized `results` row with embedded profile + challenge (Supabase may return a 1-item array per FK). */
type DailyLeaderboardRow = {
  id: string | number;
  user_id: string;
  solved: boolean | null;
  attempts_used: number | null;
  created_at: string | null;
  profiles: DailyProfileEmbed | null;
  challenges: DailyChallengeEmbed | null;
};

function unwrapOne<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

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

  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });

  const { data: dailyRowsRaw, error: dailyError } = await supabase
    .from("results")
    .select(
      `
      id,
      user_id,
      solved,
      attempts_used,
      created_at,
      profiles (username, avatar_url),
      challenges (title, active_date)
    `,
    )
    .eq("challenges.active_date", today)
    .order("attempts_used", { ascending: true })
    .order("created_at", { ascending: true });

  if (dailyError) {
    console.error("[leaderboard] daily results", dailyError);
  }

  const dailyRows: DailyLeaderboardRow[] = (dailyRowsRaw ?? []).map((r) => {
    const row = r as {
      id: string | number;
      user_id: string;
      solved: boolean | null;
      attempts_used: number | null;
      created_at: string | null;
      profiles: DailyProfileEmbed | DailyProfileEmbed[] | null;
      challenges: DailyChallengeEmbed | DailyChallengeEmbed[] | null;
    };
    return {
      id: row.id,
      user_id: row.user_id,
      solved: row.solved,
      attempts_used: row.attempts_used,
      created_at: row.created_at,
      profiles: unwrapOne(row.profiles),
      challenges: unwrapOne(row.challenges),
    };
  });
  const empty = !dailyRows.length;
  const leaderboardDay = today;

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
    <AppSiteChrome title="Leaderboard">
      <LeaderboardPullToRefresh>
      <div className="mx-auto w-full max-w-2xl px-4 pt-6 pb-[100px] md:px-5 md:pb-[100px]">
        <h1 className="text-3xl font-extrabold tracking-tight">Leaderboard</h1>
        <p className="mt-2 text-sm text-white/60">
          Today&apos;s results (active date: {leaderboardDay})
        </p>

        <LeaderboardSwipeArea currentTab={tab}>
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
                    <th className="px-4 py-3">Challenge</th>
                    <th className="px-4 py-3">Solved</th>
                    <th className="px-4 py-3">Attempts</th>
                  </tr>
                </thead>
                <tbody className="leaderboard-stagger">
                  {dailyRows.map((row, i) => {
                    const username = row.profiles?.username ?? null;
                    const avatarUrl = row.profiles?.avatar_url ?? null;
                    const challengeTitle = row.challenges?.title ?? "Untitled";
                    return (
                    <tr
                      key={`${row.id}-${row.created_at ?? ""}-${i}`}
                      className="lb-stagger-row border-b border-white/5 transition-colors last:border-0 active:bg-white/[0.06]"
                      style={{ "--lb-i": i } as CSSProperties}
                    >
                      <td className="px-4 py-3 font-mono font-semibold text-white/90">
                        {i + 1}
                      </td>
                      <td className="px-4 py-3 text-sm text-white/90">
                        <div className="flex min-w-0 items-center gap-2">
                          {avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={avatarUrl}
                              alt=""
                              className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-white/15"
                            />
                          ) : null}
                          <span className="min-w-0">
                            <ProfileUsernameLink
                              username={username ?? undefined}
                              fallbackDisplay={shortUsername(row.user_id)}
                            />
                          </span>
                        </div>
                      </td>
                      <td className="max-w-[10rem] truncate px-4 py-3 text-white/80">
                        {challengeTitle}
                      </td>
                      <td className="px-4 py-3 text-white/80">
                        {row.solved === true
                          ? "Yes"
                          : row.solved === false
                            ? "No"
                            : "—"}
                      </td>
                      <td className="px-4 py-3 text-white/80">
                        {row.attempts_used ?? "—"}
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
                        className="lb-stagger-row border-b border-white/5 transition-colors last:border-0 active:bg-white/[0.06]"
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
                      className="lb-stagger-row border-b border-white/5 transition-colors last:border-0 active:bg-white/[0.06]"
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
        </LeaderboardSwipeArea>
      </div>
      </LeaderboardPullToRefresh>
    </AppSiteChrome>
  );
}

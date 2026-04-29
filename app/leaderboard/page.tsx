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

/** Aggregated daily row (one per user) built from `results` + `profiles`. */
type DailyLeaderboardRow = {
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  /** Capped at `DAILY_CHALLENGE_TOTAL`. */
  solved_count: number;
  /** Sum of `attempts_used` across all of today’s result rows for this user. */
  total_guesses: number;
  /** Earliest `created_at` among those rows (ms); for sorting only. */
  first_completion_at: number | null;
};

const DAILY_CHALLENGE_TOTAL = 5;

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

  const { data: todayChallenges } = await supabase
    .from("challenges")
    .select("id")
    .eq("active_date", today);

  const todayIds = (todayChallenges ?? []).map((c) => c.id);
  console.log("[daily] today challenges", todayIds);

  let dailyRows: DailyLeaderboardRow[] = [];

  if (todayIds.length > 0) {
    const { data: resultsData } = await supabase
      .from("results")
      .select("user_id, solved, attempts_used, challenge_id, created_at")
      .in("challenge_id", todayIds);

    console.log("[daily] results found", resultsData?.length);

    type ResultPick = {
      user_id: string;
      solved: boolean | null;
      attempts_used: number | null;
      challenge_id: string;
      created_at: string | null;
    };

    const resultsList = (resultsData ?? []) as ResultPick[];

    const userIds = [
      ...new Set(
        resultsList.map((r) => r.user_id).filter((id): id is string => Boolean(id))
      ),
    ];

    const profilesById = new Map<
      string,
      { username: string | null; avatar_url: string | null }
    >();

    if (userIds.length > 0) {
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, username, avatar_url")
        .in("id", userIds);

      for (const p of profilesData ?? []) {
        const row = p as {
          id: string;
          username: string | null;
          avatar_url: string | null;
        };
        profilesById.set(row.id, {
          username: row.username,
          avatar_url: row.avatar_url,
        });
      }
    }

    const byUser = new Map<
      string,
      {
        solved_count: number;
        total_guesses: number;
        first_completion_at: number | null;
      }
    >();

    for (const r of resultsList) {
      const uid = r.user_id;
      if (!uid) continue;

      let agg = byUser.get(uid);
      if (!agg) {
        agg = {
          solved_count: 0,
          total_guesses: 0,
          first_completion_at: null,
        };
        byUser.set(uid, agg);
      }

      if (r.solved === true) {
        agg.solved_count += 1;
      }

      const attempts =
        r.attempts_used === null || r.attempts_used === undefined
          ? NaN
          : Number(r.attempts_used);
      if (Number.isFinite(attempts)) {
        agg.total_guesses += attempts;
      }

      const createdMs = r.created_at ? Date.parse(r.created_at) : NaN;
      if (Number.isFinite(createdMs)) {
        agg.first_completion_at =
          agg.first_completion_at === null
            ? createdMs
            : Math.min(agg.first_completion_at, createdMs);
      }
    }

    dailyRows = [...byUser.entries()].map(([user_id, v]) => {
      const p = profilesById.get(user_id);
      return {
        user_id,
        username: p?.username ?? null,
        avatar_url: p?.avatar_url ?? null,
        solved_count: Math.min(DAILY_CHALLENGE_TOTAL, v.solved_count),
        total_guesses: v.total_guesses,
        first_completion_at: v.first_completion_at,
      };
    });

    dailyRows.sort((a, b) => {
      if (b.solved_count !== a.solved_count) {
        return b.solved_count - a.solved_count;
      }
      if (a.total_guesses !== b.total_guesses) {
        return a.total_guesses - b.total_guesses;
      }
      const fa = a.first_completion_at ?? Number.POSITIVE_INFINITY;
      const fb = b.first_completion_at ?? Number.POSITIVE_INFINITY;
      if (fa !== fb) return fa - fb;
      return a.user_id.localeCompare(b.user_id);
    });
  }

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
        {tab === "daily" ? (
          <p className="mt-1 text-xs text-white/45">
            Ranked by challenges solved, then fewest total guesses
          </p>
        ) : null}

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
                    <th className="px-4 py-3">Player</th>
                    <th className="px-4 py-3">Solved</th>
                    <th className="px-4 py-3">Guesses</th>
                  </tr>
                </thead>
                <tbody className="leaderboard-stagger">
                  {dailyRows.map((row, i) => (
                    <tr
                      key={row.user_id}
                      className="lb-stagger-row border-b border-white/5 transition-colors last:border-0 active:bg-white/[0.06]"
                      style={{ "--lb-i": i } as CSSProperties}
                    >
                      <td className="px-4 py-3 font-mono font-semibold text-white/90">
                        {i + 1}
                      </td>
                      <td className="px-4 py-3 text-sm text-white/90">
                        <div className="flex min-w-0 items-center gap-2">
                          {row.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={row.avatar_url}
                              alt=""
                              className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-white/15"
                            />
                          ) : null}
                          <span className="min-w-0">
                            <ProfileUsernameLink
                              username={row.username ?? undefined}
                              fallbackDisplay={shortUsername(row.user_id)}
                            />
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-white/80">
                        <span className="font-bold text-white">
                          {row.solved_count}/{DAILY_CHALLENGE_TOTAL}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-white/80">
                        {row.total_guesses} guesses
                      </td>
                    </tr>
                  ))}
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
          <>
            {/* Mobile: card list — avoids clipped table headers on narrow screens */}
            <div className="mt-8 flex flex-col gap-2 px-4 sm:hidden">
              {(creatorRows as CreatorRow[]).map((row, i) => (
                <div
                  key={`${row.creator_name ?? "creator"}-m-${i}`}
                  className="lb-stagger-row flex min-w-0 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5 transition-colors active:bg-white/[0.08]"
                  style={{ "--lb-i": i } as CSSProperties}
                >
                  <span
                    className="flex w-12 shrink-0 justify-center font-mono text-sm font-semibold text-white/90"
                    aria-label={`Rank ${i + 1}`}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1 text-sm text-white/90">
                    <CreatorProfileLink raw={row.creator_name} />
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-[11px] font-semibold tabular-nums text-white/90"
                      title="Submissions"
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="shrink-0 text-white/55"
                        aria-hidden
                      >
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                      </svg>
                      {row.total_submissions ?? 0}
                    </span>
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-[11px] font-semibold tabular-nums text-white/90"
                      title="Downloads"
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="shrink-0 text-white/55"
                        aria-hidden
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      {row.total_downloads ?? 0}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: responsive headers + auto table layout */}
            <div className="mt-8 hidden overflow-x-auto rounded-2xl border border-white/10 px-4 sm:block">
              <table className="w-full min-w-0 table-auto text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5 text-xs font-semibold uppercase tracking-wider text-white/50">
                    <th
                      className="w-12 min-w-[48px] max-w-[48px] shrink-0 px-2 py-3 sm:px-4"
                      scope="col"
                    >
                      Rank
                    </th>
                    <th className="min-w-0 px-2 py-3 sm:px-4" scope="col">
                      Creator
                    </th>
                    <th
                      className="whitespace-nowrap px-2 py-3 text-right sm:px-4"
                      scope="col"
                    >
                      <span className="sm:hidden">SUBM.</span>
                      <span className="hidden sm:inline">Submissions</span>
                    </th>
                    <th
                      className="whitespace-nowrap px-2 py-3 text-right sm:px-4"
                      scope="col"
                    >
                      <span className="sm:hidden">DL</span>
                      <span className="hidden sm:inline">Downloads</span>
                    </th>
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
                        <td className="w-12 min-w-[48px] max-w-[48px] shrink-0 px-2 py-3 text-center font-mono font-semibold text-white/90 sm:px-4">
                          {i + 1}
                        </td>
                        <td className="min-w-0 px-2 py-3 sm:px-4">
                          <div className="min-w-0 truncate">
                            <CreatorProfileLink raw={row.creator_name} />
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-2 py-3 text-right tabular-nums text-white/80 sm:px-4">
                          {row.total_submissions ?? 0}
                        </td>
                        <td className="whitespace-nowrap px-2 py-3 text-right tabular-nums text-white/80 sm:px-4">
                          {row.total_downloads ?? 0}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
          </LeaderboardTabPanel>
        </LeaderboardSwipeArea>
      </div>
      </LeaderboardPullToRefresh>
    </AppSiteChrome>
  );
}

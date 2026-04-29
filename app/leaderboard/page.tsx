/* eslint-disable @next/next/no-img-element */
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
import { stripAtHandle } from "@/lib/username-display";

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
  current_streak: number | null;
  avatar_url: string | null;
};

type CreatorRow = {
  creator_name: string | null;
  total_submissions: number | null;
  total_downloads: number | null;
  total_players: number | null;
};

const ROW_PAD = "py-2 px-1";
const ROW_BORDER = "border-b-[0.5px] border-white/[0.04]";

function creatorKey(raw: string | null | undefined) {
  return stripAtHandle(raw ?? "").trim().toLowerCase();
}

function shortUsername(userId: string) {
  const id = userId?.trim() ?? "";
  if (!id) return "—";
  return id.length <= 8 ? id : id.slice(0, 8);
}

function trunc8Handle(raw: string | null | undefined, fallbackId: string) {
  const h = stripAtHandle(raw ?? "").trim() || shortUsername(fallbackId);
  return h.length <= 8 ? h : `${h.slice(0, 8)}`;
}

/** `ymd` is en-CA Eastern calendar date (YYYY-MM-DD). */
function formatEasternLongDate(ymd: string) {
  const [ys, ms, ds] = ymd.split("-");
  const y = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return ymd;
  }
  const instant = new Date(Date.UTC(y, m - 1, d, 16, 0, 0));
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "America/New_York",
  }).format(instant);
}

function rankTextClass(rank: number) {
  if (rank === 1) return "text-[#f59e0b]";
  if (rank === 2) return "text-[#9ca3af]";
  if (rank === 3) return "text-[#b45309]";
  return "text-white/70";
}

function LeaderboardAvatar({
  url,
  label,
  sizePx,
  className = "",
}: {
  url: string | null | undefined;
  label: string;
  sizePx: number;
  className?: string;
}) {
  const initial = (label.trim().slice(0, 1) || "?").toUpperCase();
  return (
    <div
      className={`shrink-0 overflow-hidden rounded-full border-[0.5px] border-white/10 bg-[#1a0a2e] ${className}`}
      style={{ width: sizePx, height: sizePx }}
    >
      {url ? (
        <img
          src={url}
          alt=""
          className="h-full w-full object-cover"
          width={sizePx}
          height={sizePx}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs font-bold text-white/80">
          {initial}
        </div>
      )}
    </div>
  );
}

const PODIUM = {
  1: {
    avatar: 44,
    border: "#f59e0b",
    podiumH: 40,
    label: "#f59e0b" as const,
  },
  2: {
    avatar: 36,
    border: "#9ca3af",
    podiumH: 28,
    label: "#9ca3af" as const,
  },
  3: {
    avatar: 32,
    border: "#b45309",
    podiumH: 20,
    label: "#b45309" as const,
  },
} as const;

function DailyPodiumSlot({
  rank,
  row,
}: {
  rank: 1 | 2 | 3;
  row: DailyLeaderboardRow;
}) {
  const cfg = PODIUM[rank];
  const handle = trunc8Handle(row.username, row.user_id);
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center">
      <ProfileUsernameLink
        username={row.username ?? undefined}
        fallbackDisplay={shortUsername(row.user_id)}
      >
        <span
          className="inline-flex rounded-full"
          style={{ boxShadow: `0 0 0 2px ${cfg.border}` }}
        >
          <LeaderboardAvatar
            url={row.avatar_url}
            label={row.username ?? row.user_id}
            sizePx={cfg.avatar}
            className="border-0"
          />
        </span>
      </ProfileUsernameLink>
      <div
        className="mt-2 w-full truncate text-center text-xs font-semibold text-white/90"
        title={stripAtHandle(row.username ?? "") || row.user_id}
      >
        {handle}
      </div>
      <div className="mt-0.5 text-center text-[10px] leading-tight text-white/55">
        {row.solved_count}/{DAILY_CHALLENGE_TOTAL} · {row.total_guesses} guesses
      </div>
      <div
        className="mt-3 flex w-full max-w-[5.5rem] flex-col items-center justify-center rounded-t-md bg-[#1a0a2e] sm:max-w-[6.5rem]"
        style={{
          height: cfg.podiumH,
          borderRadius: "6px 6px 0 0",
        }}
      >
        <span
          className="text-sm font-bold tabular-nums"
          style={{ color: cfg.label }}
        >
          {rank}
        </span>
      </div>
    </div>
  );
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

  let dailyRows: DailyLeaderboardRow[] = [];

  if (todayIds.length > 0) {
    const { data: resultsData } = await supabase
      .from("results")
      .select("user_id, solved, attempts_used, challenge_id, created_at")
      .in("challenge_id", todayIds);

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

  const { data: allTimeProfiles } = await supabase
    .from("profiles")
    .select(
      "id, username, total_solved, longest_streak, current_streak, avatar_url"
    )
    .order("total_solved", { ascending: false })
    .order("longest_streak", { ascending: false })
    .order("username", { ascending: true });

  const { data: creatorRows } = await supabase
    .from("creator_leaderboard")
    .select("creator_name, total_submissions, total_downloads, total_players")
    .order("total_downloads", { ascending: false })
    .order("total_submissions", { ascending: false })
    .order("total_players", { ascending: false });

  const { data: challengeThumbRows } = await supabase
    .from("challenges")
    .select("creator_name, image_url, active_date")
    .not("image_url", "is", null)
    .order("active_date", { ascending: false });

  const thumbByCreator = new Map<string, string>();
  for (const raw of challengeThumbRows ?? []) {
    const ch = raw as {
      creator_name?: string | null;
      image_url?: string | null;
    };
    const key = creatorKey(ch.creator_name);
    const url = ch.image_url?.trim();
    if (!key || !url || thumbByCreator.has(key)) continue;
    thumbByCreator.set(key, url);
  }

  const tabSubline =
    tab === "daily"
      ? `${formatEasternLongDate(today)} · Daily results`
      : tab === "all-time"
        ? "Since launch · All players"
        : "Ranked by downloads";

  return (
    <AppSiteChrome title="Leaderboard">
      <LeaderboardPullToRefresh>
        <div className="mx-auto w-full max-w-2xl px-4 pt-6 pb-[100px] md:px-5 md:pb-[100px]">
          <p className="text-sm text-white/60">{tabSubline}</p>

          <LeaderboardSwipeArea currentTab={tab}>
            <LeaderboardTabBar current={tab} />

            <LeaderboardTabPanel key={tab} tab={tab}>
              {tab === "daily" ? (
                empty ? (
                  <p className="mt-10 text-center text-lg font-semibold text-white/75">
                    No results yet
                  </p>
                ) : (
                  <div className="mt-6">
                    {dailyRows.length >= 3 ? (
                      <>
                        <div className="flex items-end justify-center gap-2 sm:gap-6">
                          <DailyPodiumSlot rank={2} row={dailyRows[1]} />
                          <DailyPodiumSlot rank={1} row={dailyRows[0]} />
                          <DailyPodiumSlot rank={3} row={dailyRows[2]} />
                        </div>
                        <div
                          className="my-4 h-[0.5px] bg-white/[0.05]"
                          aria-hidden
                        />
                      </>
                    ) : null}
                    <div>
                      {(dailyRows.length >= 3
                        ? dailyRows.slice(3)
                        : dailyRows
                      ).map((row, i) => {
                        const rank = dailyRows.length >= 3 ? i + 4 : i + 1;
                        return (
                          <div
                            key={row.user_id}
                            className={`lb-stagger-row flex min-w-0 items-center gap-2 ${ROW_PAD} ${ROW_BORDER} last:border-b-0`}
                            style={{ "--lb-i": i } as CSSProperties}
                          >
                            <span
                              className={`w-5 shrink-0 text-center text-xs font-semibold tabular-nums ${rankTextClass(rank)}`}
                            >
                              {rank}
                            </span>
                            <ProfileUsernameLink
                              username={row.username ?? undefined}
                              fallbackDisplay={shortUsername(row.user_id)}
                            >
                              <LeaderboardAvatar
                                url={row.avatar_url}
                                label={row.username ?? row.user_id}
                                sizePx={28}
                              />
                            </ProfileUsernameLink>
                            <span className="min-w-0 flex-1 truncate text-sm text-white/90">
                              <ProfileUsernameLink
                                username={row.username ?? undefined}
                                fallbackDisplay={shortUsername(row.user_id)}
                              />
                            </span>
                            <span className="shrink-0 text-right text-sm tabular-nums text-white/85">
                              {row.solved_count}/{DAILY_CHALLENGE_TOTAL}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )
              ) : tab === "all-time" ? (
                !(allTimeProfiles?.length ?? 0) ? (
                  <p className="mt-10 text-center text-lg font-semibold text-white/75">
                    No players yet
                  </p>
                ) : (
                  <div className="mt-6">
                    {(allTimeProfiles as ProfileRow[]).map((row, i) => {
                      const rank = i + 1;
                      const streak = Math.max(
                        0,
                        Math.floor(Number(row.current_streak) || 0),
                      );
                      return (
                        <div
                          key={`${row.id}-${i}`}
                          className={`lb-stagger-row flex min-w-0 items-center gap-2 ${ROW_PAD} ${ROW_BORDER} last:border-b-0`}
                          style={{ "--lb-i": i } as CSSProperties}
                        >
                          <span
                            className={`w-5 shrink-0 text-center text-xs font-semibold tabular-nums ${rankTextClass(rank)}`}
                          >
                            {rank}
                          </span>
                          <ProfileUsernameLink
                            username={row.username ?? undefined}
                            fallbackDisplay={shortUsername(row.id)}
                          >
                            <LeaderboardAvatar
                              url={row.avatar_url}
                              label={row.username ?? row.id}
                              sizePx={28}
                            />
                          </ProfileUsernameLink>
                          <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-sm text-white/90">
                            <span className="min-w-0 truncate">
                              <ProfileUsernameLink
                                username={row.username ?? undefined}
                                fallbackDisplay={shortUsername(row.id)}
                              />
                            </span>
                            {streak >= 3 ? (
                              <span
                                className="shrink-0 rounded px-[5px] py-0.5 text-[9px] font-semibold text-[#a855f7]"
                                style={{
                                  background: "#7c3aed22",
                                  borderRadius: 4,
                                  padding: "2px 5px",
                                }}
                              >
                                🔥{streak}
                              </span>
                            ) : null}
                          </span>
                          <span className="shrink-0 text-right text-sm tabular-nums text-white/85">
                            {row.total_solved ?? 0} solved
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : !(creatorRows?.length ?? 0) ? (
                <p className="mt-10 text-center text-lg font-semibold text-white/75">
                  No creators yet
                </p>
              ) : (
                <div className="mt-6">
                  {(creatorRows as CreatorRow[]).map((row, i) => {
                    const rank = i + 1;
                    const key = creatorKey(row.creator_name);
                    const thumb = key ? thumbByCreator.get(key) : undefined;
                    const subs = row.total_submissions ?? 0;
                    const dls = row.total_downloads ?? 0;
                    return (
                      <div
                        key={`${row.creator_name ?? "creator"}-${i}`}
                        className={`lb-stagger-row flex min-w-0 items-center gap-2 ${ROW_PAD} ${ROW_BORDER} last:border-b-0`}
                        style={{ "--lb-i": i } as CSSProperties}
                      >
                        <span
                          className={`w-5 shrink-0 text-center text-xs font-semibold tabular-nums ${rankTextClass(rank)}`}
                        >
                          {rank}
                        </span>
                        <CreatorProfileLink raw={row.creator_name}>
                          <span
                            className="inline-flex h-9 w-9 shrink-0 overflow-hidden rounded-md border-[0.5px] border-white/10 bg-[#1a0a2e]"
                            style={{ borderRadius: 6 }}
                          >
                            {thumb ? (
                              <img
                                src={thumb}
                                alt=""
                                className="h-full w-full object-cover"
                                width={36}
                                height={36}
                              />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center text-xs font-bold text-white/80">
                                {(stripAtHandle(row.creator_name ?? "").slice(0, 1) ||
                                  "?").toUpperCase()}
                              </span>
                            )}
                          </span>
                        </CreatorProfileLink>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-bold text-white">
                            <CreatorProfileLink raw={row.creator_name} />
                          </div>
                          <div className="truncate text-xs text-[#6b7280]">
                            {subs} challenges featured
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-sm font-semibold tabular-nums text-[#a855f7]">
                            ↓{dls}
                          </div>
                          <div className="text-xs tabular-nums text-[#6b7280]">
                            {subs}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </LeaderboardTabPanel>
          </LeaderboardSwipeArea>
        </div>
      </LeaderboardPullToRefresh>
    </AppSiteChrome>
  );
}

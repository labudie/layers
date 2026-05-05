/* eslint-disable @next/next/no-img-element */
import type { CSSProperties } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppSiteChrome } from "@/app/components/AppSiteChrome";
import { LeaderboardPullToRefresh } from "@/app/components/LeaderboardPullToRefresh";
import { LeaderboardScrollUnlock } from "@/app/components/LeaderboardScrollUnlock";
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

type ProfileEmbed = {
  username: string | null;
  avatar_url: string | null;
  current_streak: number;
};

const PROFILE_ID_BATCH = 150;

function logSupabaseError(scope: string, err: { message?: string; code?: string; details?: string }) {
  console.error(
    scope,
    err.message ?? "(no message)",
    err.code ? `code=${err.code}` : "",
    err.details ? `details=${err.details}` : "",
  );
}

type AllTimeLeaderboardRow = {
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  current_streak: number;
  days_played: number;
  total_guesses: number;
};

type CreatorLeaderboardRow = {
  creator_name: string | null;
  username: string | null;
  avatar_url: string | null;
  featured_count: number;
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

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const rawTab = params.tab;
  if (
    rawTab === "daily" ||
    (rawTab != null &&
      rawTab !== "" &&
      rawTab !== "all-time" &&
      rawTab !== "creators")
  ) {
    redirect("/leaderboard?tab=all-time");
  }
  const tab: LeaderboardTabId =
    rawTab === "creators" ? "creators" : "all-time";

  const supabase = createSupabaseServerClient(await cookies());

  let allTimeRows: AllTimeLeaderboardRow[] = [];
  let creatorRows: CreatorLeaderboardRow[] = [];

  try {
    const { data: resultsData, error: resultsError } = await supabase
      .from("results")
      .select("user_id, attempts_used")
      .order("created_at", { ascending: false });

    if (resultsError) {
      logSupabaseError("[leaderboard] results fetch failed", resultsError);
    } else {
      const resultRows = (resultsData ?? []) as Array<{
        user_id: string;
        attempts_used: number | null;
      }>;

      const resultUserIds = [
        ...new Set(
          resultRows.map((r) => r.user_id?.trim()).filter((id): id is string =>
            Boolean(id),
          ),
        ),
      ];

      const profilesByUserId = new Map<string, ProfileEmbed>();
      for (let i = 0; i < resultUserIds.length; i += PROFILE_ID_BATCH) {
        const chunk = resultUserIds.slice(i, i + PROFILE_ID_BATCH);
        const { data: profs, error: profErr } = await supabase
          .from("profiles")
          .select("id, username, avatar_url, current_streak")
          .in("id", chunk);
        if (profErr) {
          logSupabaseError("[leaderboard] profiles (results) fetch failed", profErr);
          break;
        }
        for (const row of profs ?? []) {
          const r = row as {
            id: string;
            username: string | null;
            avatar_url: string | null;
            current_streak: number | null;
          };
          profilesByUserId.set(r.id, {
            username: r.username,
            avatar_url: r.avatar_url,
            current_streak: Math.max(
              0,
              Math.floor(Number(r.current_streak) || 0),
            ),
          });
        }
      }

      const byUser = new Map<
        string,
        {
          days_played: number;
          total_guesses: number;
          username: string | null;
          avatar_url: string | null;
          current_streak: number;
        }
      >();

      for (const raw of resultRows) {
        const uid = raw.user_id?.trim();
        if (!uid) continue;

        const p = profilesByUserId.get(uid);
        const attempts = Math.max(
          0,
          Math.floor(Number(raw.attempts_used) || 0),
        );

        let agg = byUser.get(uid);
        if (!agg) {
          agg = {
            days_played: 0,
            total_guesses: 0,
            username: p?.username ?? null,
            avatar_url: p?.avatar_url ?? null,
            current_streak: p?.current_streak ?? 0,
          };
          byUser.set(uid, agg);
        }
        agg.days_played += 1;
        agg.total_guesses += attempts;
      }

      allTimeRows = [...byUser.entries()].map(([user_id, v]) => ({
        user_id,
        username: v.username,
        avatar_url: v.avatar_url,
        current_streak: v.current_streak,
        days_played: v.days_played,
        total_guesses: v.total_guesses,
      }));

      allTimeRows.sort((a, b) => {
        if (b.days_played !== a.days_played) {
          return b.days_played - a.days_played;
        }
        if (a.total_guesses !== b.total_guesses) {
          return a.total_guesses - b.total_guesses;
        }
        if (b.current_streak !== a.current_streak) {
          return b.current_streak - a.current_streak;
        }
        return a.user_id.localeCompare(b.user_id);
      });
    }

    const { data: challengesData, error: challengesError } = await supabase
      .from("challenges")
      .select("creator_name, creator_user_id")
      .not("creator_name", "is", null);

    if (challengesError) {
      logSupabaseError("[leaderboard] challenges fetch failed", challengesError);
    } else {
      const challengeRows = (challengesData ?? []) as Array<{
        creator_name: string | null;
        creator_user_id: string | null;
      }>;

      const byCreator = new Map<
        string,
        {
          creator_name: string | null;
          profile_user_id: string | null;
          featured_count: number;
        }
      >();

      for (const raw of challengeRows) {
        const trimmed = raw.creator_name?.trim();
        if (!trimmed) continue;

        const key = creatorKey(trimmed);
        if (!key) continue;

        const uid = raw.creator_user_id?.trim() || null;

        const cur = byCreator.get(key);
        if (!cur) {
          byCreator.set(key, {
            creator_name: raw.creator_name,
            profile_user_id: uid,
            featured_count: 1,
          });
        } else {
          cur.featured_count += 1;
          if (!cur.profile_user_id && uid) {
            cur.profile_user_id = uid;
          }
        }
      }

      const profileIds = [
        ...new Set(
          [...byCreator.values()]
            .map((v) => v.profile_user_id?.trim())
            .filter((id): id is string => Boolean(id)),
        ),
      ];

      const profilesByCreatorUser = new Map<
        string,
        { username: string | null; avatar_url: string | null }
      >();
      for (let i = 0; i < profileIds.length; i += PROFILE_ID_BATCH) {
        const chunk = profileIds.slice(i, i + PROFILE_ID_BATCH);
        const { data: profs, error: profErr } = await supabase
          .from("profiles")
          .select("id, username, avatar_url")
          .in("id", chunk);
        if (profErr) {
          logSupabaseError(
            "[leaderboard] profiles (challenges) fetch failed",
            profErr,
          );
          break;
        }
        for (const row of profs ?? []) {
          const r = row as {
            id: string;
            username: string | null;
            avatar_url: string | null;
          };
          profilesByCreatorUser.set(r.id, {
            username: r.username,
            avatar_url: r.avatar_url,
          });
        }
      }

      creatorRows = [...byCreator.values()]
        .map((v) => {
          const p = v.profile_user_id
            ? profilesByCreatorUser.get(v.profile_user_id)
            : undefined;
          return {
            creator_name: v.creator_name,
            username: p?.username ?? null,
            avatar_url: p?.avatar_url ?? null,
            featured_count: v.featured_count,
          } satisfies CreatorLeaderboardRow;
        })
        .sort((a, b) => {
          if (b.featured_count !== a.featured_count) {
            return b.featured_count - a.featured_count;
          }
          return creatorKey(a.creator_name).localeCompare(
            creatorKey(b.creator_name),
          );
        })
        .slice(0, 50);
    }
  } catch (e) {
    console.error("[leaderboard] Supabase fetch failed", e);
  }

  const tabSubline =
    tab === "all-time"
      ? "Since launch · All players"
      : "Ranked by challenges featured in-game";

  return (
    <AppSiteChrome title="Leaderboard">
      <LeaderboardPullToRefresh>
        <LeaderboardScrollUnlock />
        <div className="mx-auto w-full max-w-2xl px-4 pt-6 pb-[100px] md:px-5 md:pb-[100px]">
          <p className="text-sm text-white/60">{tabSubline}</p>

          <LeaderboardSwipeArea currentTab={tab}>
            <LeaderboardTabBar current={tab} />

            <LeaderboardTabPanel key={tab} tab={tab}>
              {tab === "all-time" ? (
                !allTimeRows.length ? (
                  <p className="mt-10 text-center text-lg font-semibold text-white/75">
                    No players yet
                  </p>
                ) : (
                  <div className="mt-6">
                    {allTimeRows.map((row, i) => {
                      const rank = i + 1;
                      const streak = row.current_streak;
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
                          <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-sm text-white/90">
                            <span className="min-w-0 truncate">
                              <ProfileUsernameLink
                                username={row.username ?? undefined}
                                fallbackDisplay={shortUsername(row.user_id)}
                              />
                            </span>
                            {streak >= 3 ? (
                              <span className="shrink-0 text-[9px] font-semibold text-[#a855f7]">
                                🔥{streak}
                              </span>
                            ) : null}
                          </span>
                          <span className="shrink-0 text-right text-sm tabular-nums">
                            <span className="text-[#f8f4ff]">
                              {row.days_played}{" "}
                              {row.days_played === 1 ? "day" : "days"}
                            </span>
                            <span className="text-white/35"> · </span>
                            <span className="text-[#a0a0b0]">
                              {row.total_guesses}{" "}
                              {row.total_guesses === 1 ? "guess" : "guesses"}
                            </span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : !creatorRows.length ? (
                <p className="mt-10 text-center text-lg font-semibold text-white/75">
                  No creators yet
                </p>
              ) : (
                <div className="mt-6">
                  {creatorRows.map((row, i) => {
                    const rank = i + 1;
                    const handle = stripAtHandle(row.creator_name ?? "");
                    const labelForAvatar =
                      row.username?.trim() || handle || "?";
                    const fallback = handle || "—";

                    return (
                      <div
                        key={`${creatorKey(row.creator_name)}-${i}`}
                        className={`lb-stagger-row flex min-w-0 items-center gap-2 ${ROW_PAD} ${ROW_BORDER} last:border-b-0`}
                        style={{ "--lb-i": i } as CSSProperties}
                      >
                        <span
                          className={`w-5 shrink-0 text-center text-xs font-semibold tabular-nums ${rankTextClass(rank)}`}
                        >
                          {rank}
                        </span>
                        {stripAtHandle(row.username ?? "").length ? (
                          <>
                            <ProfileUsernameLink
                              username={row.username ?? undefined}
                              fallbackDisplay={fallback}
                            >
                              <LeaderboardAvatar
                                url={row.avatar_url}
                                label={labelForAvatar}
                                sizePx={28}
                              />
                            </ProfileUsernameLink>
                            <span className="min-w-0 flex-1 truncate text-sm text-white/90">
                              <ProfileUsernameLink
                                username={row.username ?? undefined}
                                fallbackDisplay={fallback}
                              />
                            </span>
                          </>
                        ) : (
                          <>
                            <CreatorProfileLink raw={row.creator_name}>
                              <LeaderboardAvatar
                                url={row.avatar_url}
                                label={labelForAvatar}
                                sizePx={28}
                              />
                            </CreatorProfileLink>
                            <span className="min-w-0 flex-1 truncate text-sm text-white/90">
                              <CreatorProfileLink raw={row.creator_name} />
                            </span>
                          </>
                        )}
                        <span className="shrink-0 text-right text-sm font-medium tabular-nums text-[#f8f4ff]">
                          {row.featured_count}{" "}
                          {row.featured_count === 1
                            ? "challenge featured"
                            : "challenges featured"}
                        </span>
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

import { createSupabaseServerClient } from "@/lib/supabase";
import {
  easternDaysInclusive,
  easternWeekRangeContaining,
  subtractEasternDays,
  toEasternYmd,
} from "@/lib/admin-eastern-dates";

type Sb = ReturnType<typeof createSupabaseServerClient>;

export type SponsorPerformanceRow = {
  id: string;
  active_date: string | null;
  position: number | null;
  title: string | null;
  sponsor_name: string | null;
  totalGuesses: number;
  uniquePlayers: number;
  downloads: number;
  solveRatePct: number | null;
};

export type CohortMatrixCell = { pct: number | null; na: boolean };

export type AnalyticsExportRow = {
  date: string;
  dau: number;
  new_users: number;
  total_guesses: number;
  sponsored_challenge_impressions: number;
};

export type AdvancedAdminAnalytics = {
  retentionDay1Pct: number | null;
  retentionDay7Pct: number | null;
  retentionDay30Pct: number | null;
  dauLastPlayed: number;
  mauLastPlayed: number;
  stickinessPct: number | null;
  weeklyNewUsersThisWeek: number;
  weeklyNewUsersLastWeek: number;
  weeklyGrowthPct: number | null;
  sponsorRows: SponsorPerformanceRow[];
  cohortWeekLabels: string[];
  cohortMatrix: CohortMatrixCell[][];
  cohortJoinCounts: number[];
  exportRows: AnalyticsExportRow[];
};

type ProfileLite = {
  id: string;
  created_at: string | null;
  last_played_date: string | null;
  current_streak: number | null;
};

function pct(n: number, d: number): number | null {
  if (d <= 0) return null;
  return Math.round((n / d) * 1000) / 10;
}

/**
 * With only `last_played_date` + `current_streak`, infer whether the user played on Eastern day `D`
 * (streak counts consecutive Eastern play days ending at `last`).
 */
function playedOnEasternDay(
  lastYmd: string | null,
  streak: number,
  dayYmd: string,
): boolean {
  if (!lastYmd || lastYmd < dayYmd) return false;
  if (lastYmd === dayYmd) return true;
  const need = easternDaysInclusive(dayYmd, lastYmd);
  return streak >= need;
}

function playedTodayAndOnCohortDay(
  lastYmd: string | null,
  streak: number,
  todayYmd: string,
  cohortDayYmd: string,
): boolean {
  if (lastYmd !== todayYmd) return false;
  const span = easternDaysInclusive(cohortDayYmd, todayYmd);
  return streak >= span;
}

async function fetchAllProfiles(sb: Sb): Promise<ProfileLite[]> {
  const pageSize = 1000;
  const out: ProfileLite[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data: page, error } = await sb
      .from("profiles")
      .select("id, created_at, last_played_date, current_streak")
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) {
      console.error("[admin-studio-analytics] profiles page", error);
      break;
    }
    if (!page?.length) break;
    out.push(...(page as ProfileLite[]));
    if (page.length < pageSize) break;
  }
  return out;
}

function buildWeekGrid(todayYmd: string) {
  const offsets = [-5, -4, -3, -2, -1, 0] as const;
  return offsets.map((o) => easternWeekRangeContaining(todayYmd, o));
}

export async function loadAdvancedAdminAnalytics(
  sb: Sb,
  todayYmd: string,
): Promise<AdvancedAdminAnalytics> {
  const yesterday = subtractEasternDays(todayYmd, 1);
  const day7 = subtractEasternDays(todayYmd, 7);
  const day30 = subtractEasternDays(todayYmd, 30);
  const mauStart = subtractEasternDays(todayYmd, 29);

  const profiles = await fetchAllProfiles(sb);

  let denomD1 = 0;
  let numD1 = 0;
  let denomD7 = 0;
  let numD7 = 0;
  let denomD30 = 0;
  let numD30 = 0;

  let dauLastPlayed = 0;
  let mauLastPlayed = 0;

  const weekRanges = buildWeekGrid(todayYmd);
  const thisWeek = weekRanges[5];
  const lastWeek = weekRanges[4];

  let weeklyNewUsersThisWeek = 0;
  let weeklyNewUsersLastWeek = 0;

  for (const p of profiles) {
    const joinYmd = toEasternYmd(p.created_at ?? undefined);
    const last = p.last_played_date?.trim() || null;
    const streak = Math.max(0, Math.floor(Number(p.current_streak) || 0));

    if (joinYmd) {
      if (joinYmd >= thisWeek.start && joinYmd <= thisWeek.end) weeklyNewUsersThisWeek++;
      if (joinYmd >= lastWeek.start && joinYmd <= lastWeek.end) weeklyNewUsersLastWeek++;
    }

    if (last === todayYmd) dauLastPlayed++;
    if (last && last >= mauStart && last <= todayYmd) mauLastPlayed++;

    if (playedOnEasternDay(last, streak, yesterday)) denomD1++;
    if (playedTodayAndOnCohortDay(last, streak, todayYmd, yesterday)) numD1++;

    if (playedOnEasternDay(last, streak, day7)) denomD7++;
    if (playedTodayAndOnCohortDay(last, streak, todayYmd, day7)) numD7++;

    if (playedOnEasternDay(last, streak, day30)) denomD30++;
    if (playedTodayAndOnCohortDay(last, streak, todayYmd, day30)) numD30++;
  }

  const stickinessPct = pct(dauLastPlayed, mauLastPlayed);

  let weeklyGrowthPct: number | null = null;
  if (weeklyNewUsersLastWeek > 0) {
    weeklyGrowthPct =
      Math.round(
        ((weeklyNewUsersThisWeek - weeklyNewUsersLastWeek) / weeklyNewUsersLastWeek) * 1000,
      ) / 10;
  } else if (weeklyNewUsersThisWeek > 0) {
    weeklyGrowthPct = null;
  } else {
    weeklyGrowthPct = null;
  }

  const cohortWeekLabels = weekRanges.map((w) => w.label);
  const cohortJoinCounts = weekRanges.map((w) => {
    let n = 0;
    for (const p of profiles) {
      const j = toEasternYmd(p.created_at ?? undefined);
      if (j && j >= w.start && j <= w.end) n++;
    }
    return n;
  });

  const cohortMatrix: CohortMatrixCell[][] = weekRanges.map((cohortW, rowIdx) => {
    return weekRanges.map((actW) => {
      if (actW.end < cohortW.start) return { pct: null, na: true };
      const denom = cohortJoinCounts[rowIdx];
      if (denom <= 0) return { pct: null, na: false };
      let active = 0;
      for (const p of profiles) {
        const j = toEasternYmd(p.created_at ?? undefined);
        if (!j || j < cohortW.start || j > cohortW.end) continue;
        const last = p.last_played_date?.trim() || null;
        if (last && last >= actW.start && last <= actW.end) active++;
      }
      return { pct: pct(active, denom), na: false };
    });
  });

  const { data: sponsoredChallenges, error: spErr } = await sb
    .from("challenges")
    .select("id, active_date, position, title, sponsor_name, is_sponsored")
    .eq("is_sponsored", true)
    .order("active_date", { ascending: false });

  if (spErr) {
    console.error("[admin-studio-analytics] sponsored challenges", spErr);
  }

  const sponsored = (sponsoredChallenges ?? []) as Array<{
    id: string;
    active_date: string | null;
    position: number | null;
    title: string | null;
    sponsor_name: string | null;
  }>;

  async function distinctGuessUsersForChallenge(challengeId: string): Promise<number> {
    const s = new Set<string>();
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await sb
        .from("guesses")
        .select("user_id")
        .eq("challenge_id", challengeId)
        .range(offset, offset + 999);
      if (error || !data?.length) break;
      for (const row of data as Array<{ user_id?: string }>) {
        if (row.user_id) s.add(row.user_id);
      }
      if (data.length < 1000) break;
    }
    return s.size;
  }

  async function resultsSolveStatsForChallenge(challengeId: string): Promise<{
    total: number;
    solved: number;
  }> {
    let total = 0;
    let solved = 0;
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await sb
        .from("results")
        .select("solved")
        .eq("challenge_id", challengeId)
        .range(offset, offset + 999);
      if (error || !data?.length) break;
      for (const row of data as Array<{ solved?: boolean | null }>) {
        total++;
        if (row.solved === true) solved++;
      }
      if (data.length < 1000) break;
    }
    return { total, solved };
  }

  const sponsorRows: SponsorPerformanceRow[] = await Promise.all(
    sponsored.map(async (ch) => {
      const [guessCountRes, uniquePlayers, dlRes, solveStats] = await Promise.all([
        sb.from("guesses").select("*", { count: "exact", head: true }).eq("challenge_id", ch.id),
        distinctGuessUsersForChallenge(ch.id),
        sb.from("image_downloads").select("*", { count: "exact", head: true }).eq("challenge_id", ch.id),
        resultsSolveStatsForChallenge(ch.id),
      ]);

      const solveRatePct = pct(solveStats.solved, solveStats.total);

      return {
        id: ch.id,
        active_date: ch.active_date,
        position: ch.position,
        title: ch.title,
        sponsor_name: ch.sponsor_name,
        totalGuesses: guessCountRes.count ?? 0,
        uniquePlayers,
        downloads: dlRes.count ?? 0,
        solveRatePct,
      };
    }),
  );

  const exportDayList: string[] = [];
  let cursor = todayYmd;
  for (let i = 0; i < 90; i++) {
    exportDayList.push(cursor);
    cursor = subtractEasternDays(cursor, 1);
  }
  exportDayList.reverse();

  const newUsersByDay = new Map<string, number>();
  for (const d of exportDayList) newUsersByDay.set(d, 0);
  for (const p of profiles) {
    const j = toEasternYmd(p.created_at ?? undefined);
    if (j && newUsersByDay.has(j)) newUsersByDay.set(j, (newUsersByDay.get(j) ?? 0) + 1);
  }

  const dauByDay = new Map<string, Set<string>>();
  const guessesByDay = new Map<string, number>();
  for (const d of exportDayList) {
    dauByDay.set(d, new Set());
    guessesByDay.set(d, 0);
  }

  const sponsoredIds = new Set(sponsored.map((c) => c.id));
  const sponsoredImprByDay = new Map<string, number>();
  for (const d of exportDayList) sponsoredImprByDay.set(d, 0);
  const challengeActiveById = new Map<string, string | null>();
  for (const c of sponsored) challengeActiveById.set(c.id, c.active_date);

  const resultsSince = new Date(Date.now() - 92 * 86400000).toISOString();
  for (let offset = 0; ; offset += 1000) {
    const { data: page, error } = await sb
      .from("results")
      .select("user_id, created_at")
      .gte("created_at", resultsSince)
      .order("created_at", { ascending: true })
      .range(offset, offset + 999);
    if (error || !page?.length) break;
    for (const row of page as Array<{ user_id?: string; created_at?: string | null }>) {
      const ymd = toEasternYmd(row.created_at ?? undefined);
      const uid = row.user_id;
      if (ymd && uid && dauByDay.has(ymd)) dauByDay.get(ymd)!.add(uid);
    }
    if (page.length < 1000) break;
  }

  for (let offset = 0; ; offset += 1000) {
    const { data: page, error } = await sb
      .from("guesses")
      .select("challenge_id, created_at")
      .gte("created_at", resultsSince)
      .order("created_at", { ascending: true })
      .range(offset, offset + 999);
    if (error) {
      console.error("[admin-studio-analytics] guesses export page", error);
      break;
    }
    if (!page?.length) break;
    for (const row of page as Array<{ challenge_id?: string; created_at?: string | null }>) {
      const ymd = toEasternYmd(row.created_at ?? undefined);
      const cid = row.challenge_id;
      if (ymd && guessesByDay.has(ymd)) {
        guessesByDay.set(ymd, (guessesByDay.get(ymd) ?? 0) + 1);
      }
      if (cid && sponsoredIds.has(cid)) {
        const ad = challengeActiveById.get(cid) ?? null;
        const bucket =
          ad && sponsoredImprByDay.has(ad) ? ad : ymd && sponsoredImprByDay.has(ymd) ? ymd : null;
        if (bucket) {
          sponsoredImprByDay.set(bucket, (sponsoredImprByDay.get(bucket) ?? 0) + 1);
        }
      }
    }
    if (page.length < 1000) break;
  }

  const exportRows: AnalyticsExportRow[] = exportDayList.map((date) => ({
    date,
    dau: dauByDay.get(date)?.size ?? 0,
    new_users: newUsersByDay.get(date) ?? 0,
    total_guesses: guessesByDay.get(date) ?? 0,
    sponsored_challenge_impressions: sponsoredImprByDay.get(date) ?? 0,
  }));

  return {
    retentionDay1Pct: pct(numD1, denomD1),
    retentionDay7Pct: pct(numD7, denomD7),
    retentionDay30Pct: pct(numD30, denomD30),
    dauLastPlayed,
    mauLastPlayed,
    stickinessPct,
    weeklyNewUsersThisWeek,
    weeklyNewUsersLastWeek,
    weeklyGrowthPct,
    sponsorRows,
    cohortWeekLabels,
    cohortMatrix,
    cohortJoinCounts,
    exportRows,
  };
}

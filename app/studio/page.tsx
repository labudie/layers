import Link from "next/link";
import { cookies } from "next/headers";
import { AppSiteChrome } from "@/app/components/AppSiteChrome";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  isoLowerBoundForLast14EasternSignups,
  last14EasternDaysEnding,
  nextEasternYmd,
  toEasternYmd,
} from "@/lib/admin-eastern-dates";
import { todayYYYYMMDDUSEastern } from "@/lib/today-us-eastern";
import { createSupabaseServerClient } from "@/lib/supabase";
import { AdminChallengeFormClient } from "@/app/studio/AdminChallengeFormClient";
import { AdminSubmissionImage } from "@/app/studio/AdminSubmissionImage";
import { DeleteButton } from "@/app/studio/DeleteButton";
import {
  AtCreatorDisplay,
  AtUsernameDisplay,
} from "@/lib/AtHandle";

const ADMIN_EMAIL = "rjlabudie@gmail.com".toLowerCase();

type ChallengeAdminRow = {
  id: string;
  title: string | null;
  creator_name: string | null;
  software: string | null;
  category: string | null;
  layer_count: number | null;
  day_number: number | null;
  active_date: string | null;
  position: number | null;
  is_sponsored: boolean | null;
  sponsor_name: string | null;
  image_url: string | null;
};

type AddChallengeState = {
  error: string | null;
  publishedCount?: number;
  publishedTitles?: string[];
};

type SubmissionAdminRow = {
  id: number;
  user_id: string;
  title: string | null;
  creator_name: string | null;
  software: string | null;
  category: string | null;
  layer_count: number | null;
  image_url: string | null;
  status: "pending" | "approved" | "rejected" | null;
  scheduled_challenge_id: string | null;
  scheduled_active_date: string | null;
  scheduled_position: number | null;
  created_at: string | null;
};

type AdminUserRow = {
  id: string;
  username: string | null;
  avatar_url: string | null;
  current_streak: number | null;
  longest_streak: number | null;
  total_solved: number | null;
  perfect_days: number | null;
  last_played_date: string | null;
  created_at: string | null;
};

type AdminAnalytics = {
  totalUsers: number;
  activeToday: number;
  activeWeek: number;
  totalGuesses: number;
  streakGte3: number;
  streakGte7: number;
  streakGte30: number;
  avgStreak: number;
  totalChallenges: number;
  daysAhead: number;
  totalImageDownloads: number;
  topDownloadTitle: string | null;
  topDownloadCount: number;
  topPlayers: Array<{
    id: string;
    username: string | null;
    total_solved: number;
  }>;
  signupsByDay: Array<{ date: string; count: number }>;
};

async function loadAdminAnalytics(
  sb: ReturnType<typeof createSupabaseServerClient>,
  today: string,
): Promise<AdminAnalytics> {
  const weekAgoIso = new Date(Date.now() - 7 * 86400000).toISOString();
  const twoDaysAgoIso = new Date(Date.now() - 2 * 86400000).toISOString();
  const signupSinceIso = isoLowerBoundForLast14EasternSignups(today);
  const dayLabels = last14EasternDaysEnding(today);

  const [
    totalUsersRes,
    totalGuessesRes,
    challengesRes,
    streak3Res,
    streak7Res,
    streak30Res,
    topPlayersRes,
    todayResultsRes,
    weekResultsRes,
  ] = await Promise.all([
    sb.from("profiles").select("*", { count: "exact", head: true }),
    sb.from("guesses").select("*", { count: "exact", head: true }),
    sb.from("challenges").select("id, title, active_date"),
    sb
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .gte("current_streak", 3),
    sb
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .gte("current_streak", 7),
    sb
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .gte("current_streak", 30),
    sb
      .from("profiles")
      .select("id, username, total_solved")
      .order("total_solved", { ascending: false })
      .limit(5),
    sb
      .from("results")
      .select("user_id, created_at")
      .gte("created_at", twoDaysAgoIso)
      .limit(8000),
    sb
      .from("results")
      .select("user_id")
      .gte("created_at", weekAgoIso)
      .limit(12000),
  ]);

  const signupRows: Array<{ created_at: string | null }> = [];
  const signupPage = 1000;
  for (let offset = 0; ; offset += signupPage) {
    const { data: page } = await sb
      .from("profiles")
      .select("created_at")
      .gte("created_at", signupSinceIso)
      .order("created_at", { ascending: true })
      .range(offset, offset + signupPage - 1);
    if (!page?.length) break;
    signupRows.push(...(page as Array<{ created_at: string | null }>));
    if (page.length < signupPage) break;
  }

  const totalUsers = totalUsersRes.count ?? 0;
  const totalGuesses = totalGuessesRes.count ?? 0;
  const challenges = (challengesRes.data ?? []) as Array<{
    id: string;
    title: string | null;
    active_date: string | null;
  }>;
  const totalChallenges = challenges.length;
  const daysAhead = new Set(
    challenges
      .map((c) => c.active_date)
      .filter((d): d is string => typeof d === "string" && d > today),
  ).size;

  const streakRows: Array<{ current_streak: number | null }> = [];
  for (let offset = 0; ; offset += signupPage) {
    const { data: page } = await sb
      .from("profiles")
      .select("current_streak")
      .order("id", { ascending: true })
      .range(offset, offset + signupPage - 1);
    if (!page?.length) break;
    streakRows.push(...(page as Array<{ current_streak: number | null }>));
    if (page.length < signupPage) break;
  }
  const streakVals = streakRows.map((r) =>
    Math.max(0, Math.floor(Number(r.current_streak) || 0)),
  );
  const avgStreak = streakVals.length
    ? streakVals.reduce((a, b) => a + b, 0) / streakVals.length
    : 0;

  const topPlayers = ((topPlayersRes.data ?? []) as AdminAnalytics["topPlayers"]).map((p) => ({
    id: p.id,
    username: p.username,
    total_solved: Math.max(0, Math.floor(Number(p.total_solved) || 0)),
  }));

  const activeTodaySet = new Set<string>();
  for (const row of todayResultsRes.data ?? []) {
    const uid = (row as { user_id?: string }).user_id;
    const created = (row as { created_at?: string }).created_at;
    if (!uid || !created) continue;
    if (toEasternYmd(created) === today) activeTodaySet.add(uid);
  }

  const activeWeekSet = new Set<string>();
  for (const row of weekResultsRes.data ?? []) {
    const uid = (row as { user_id?: string }).user_id;
    if (uid) activeWeekSet.add(uid);
  }

  const signupCounts = new Map<string, number>();
  for (const d of dayLabels) signupCounts.set(d, 0);
  for (const row of signupRows) {
    const created = row.created_at;
    const ymd = toEasternYmd(created ?? undefined);
    if (!ymd || !signupCounts.has(ymd)) continue;
    signupCounts.set(ymd, (signupCounts.get(ymd) ?? 0) + 1);
  }
  const signupsByDay = dayLabels.map((date) => ({
    date,
    count: signupCounts.get(date) ?? 0,
  }));

  const idToTitle = new Map<string, string | null>();
  for (const c of challenges) idToTitle.set(c.id, c.title);

  let totalImageDownloads = 0;
  let topDownloadTitle: string | null = null;
  let topDownloadCount = 0;
  const challengeIds = challenges.map((c) => c.id).filter(Boolean);
  const chunkSize = 400;
  for (let i = 0; i < challengeIds.length; i += chunkSize) {
    const chunk = challengeIds.slice(i, i + chunkSize);
    const { data: dlChunk } = await sb.rpc("get_download_counts_for_challenges", {
      p_challenge_ids: chunk,
    });
    const rows = (dlChunk ?? []) as Array<{
      challenge_id: string;
      download_count: number | string;
    }>;
    for (const r of rows) {
      const n = Number(r.download_count) || 0;
      totalImageDownloads += n;
      if (n > topDownloadCount) {
        topDownloadCount = n;
        topDownloadTitle = idToTitle.get(r.challenge_id) ?? null;
      }
    }
  }

  return {
    totalUsers,
    activeToday: activeTodaySet.size,
    activeWeek: activeWeekSet.size,
    totalGuesses,
    streakGte3: streak3Res.count ?? 0,
    streakGte7: streak7Res.count ?? 0,
    streakGte30: streak30Res.count ?? 0,
    avgStreak,
    totalChallenges,
    daysAhead,
    totalImageDownloads,
    topDownloadTitle,
    topDownloadCount,
    topPlayers,
    signupsByDay,
  };
}

/** Uses the same server Supabase client + session cookies as the rest of the page. */
async function assertAdminOrNull(): Promise<boolean> {
  const sb = createSupabaseServerClient(await cookies());
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return false;

  let email = (user.email ?? "").trim().toLowerCase();
  if (!email && typeof user.user_metadata?.email === "string") {
    email = user.user_metadata.email.trim().toLowerCase();
  }
  if (!email && Array.isArray(user.identities)) {
    for (const ident of user.identities as Array<{
      identity_data?: { email?: string };
    }>) {
      const ie = ident?.identity_data?.email;
      if (typeof ie === "string" && ie.trim()) {
        email = ie.trim().toLowerCase();
        break;
      }
    }
  }
  if (!email && user.id) {
    const { data: prof } = await sb
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .maybeSingle();
    const pe = (prof as { email?: string | null } | null)?.email;
    if (typeof pe === "string" && pe.trim()) email = pe.trim().toLowerCase();
  }

  return email === ADMIN_EMAIL;
}

async function getUpcomingChallenges(today: string) {
  const sb = createSupabaseServerClient(await cookies());

  const { data, error } = await sb
    .from("challenges")
    .select(
      "id,title,creator_name,software,category,layer_count,day_number,active_date,position,is_sponsored,sponsor_name,image_url"
    )
    .gte("active_date", today)
    .order("active_date", { ascending: true })
    .order("position", { ascending: true });

  if (error || !data) return [];
  return data as ChallengeAdminRow[];
}

async function getScheduleOverview(today: string) {
  const sb = createSupabaseServerClient(await cookies());
  const { data, error } = await sb.from("challenges").select("active_date");
  if (error || !data) {
    return { scheduledCounts: {} as Record<string, number>, readyAheadDays: 0 };
  }

  const scheduledCounts: Record<string, number> = {};
  for (const row of data as Array<{ active_date: string | null }>) {
    if (!row.active_date) continue;
    scheduledCounts[row.active_date] = (scheduledCounts[row.active_date] ?? 0) + 1;
  }

  const readyAheadDays = Object.entries(scheduledCounts).reduce((acc, [d, count]) => {
    if (d > today && count >= 5) return acc + 1;
    return acc;
  }, 0);

  return { scheduledCounts, readyAheadDays };
}

async function addChallengeAction(formData: FormData): Promise<AddChallengeState> {
  "use server";

  const allowed = await assertAdminOrNull();
  if (!allowed) return { error: "Access denied", publishedCount: 0, publishedTitles: [] };

  const activeDate = String(formData.get("active_date") ?? "").trim();
  const dayNumberRaw = formData.get("day_number");
  const dayNumber =
    typeof dayNumberRaw === "string" ? Number(dayNumberRaw) : Number(dayNumberRaw);
  const cardsJson = String(formData.get("cards_json") ?? "[]");

  if (!activeDate) {
    return { error: "Active Date is required.", publishedCount: 0, publishedTitles: [] };
  }
  if (!Number.isFinite(dayNumber)) {
    return { error: "Day Number must be a number.", publishedCount: 0, publishedTitles: [] };
  }

  try {
    // Auth session from request cookies so Postgres RLS runs as the signed-in admin.
    const sb = createSupabaseServerClient(await cookies());
    const cards = JSON.parse(cardsJson) as Array<{
      title: string;
      creator_name: string;
      software: string;
      category: string;
      layer_count: string;
      is_sponsored: boolean;
      sponsor_name: string;
      image_url: string;
    }>;

    const startRaw = formData.get("batch_start_position");
    const startParsed = Number(String(startRaw ?? "1").trim() || "1");
    const batchStart =
      Number.isFinite(startParsed) && startParsed >= 1 && startParsed <= 5
        ? Math.trunc(startParsed)
        : 1;

    if (!Array.isArray(cards) || cards.length === 0) {
      return {
        error: "At least one challenge card is required.",
        publishedCount: 0,
        publishedTitles: [],
      };
    }
    if (cards.length > 5) {
      return {
        error: "You can publish at most 5 challenges at once.",
        publishedCount: 0,
        publishedTitles: [],
      };
    }
    if (batchStart + cards.length - 1 > 5) {
      return {
        error: `Starting at position ${batchStart}, you can add at most ${5 - batchStart + 1} challenge(s) (positions 1–5).`,
        publishedCount: 0,
        publishedTitles: [],
      };
    }

    const insertPayload: Array<{
      title: string;
      creator_name: string | null;
      day_number: number;
      software: string;
      category: string;
      layer_count: number;
      active_date: string;
      position: number;
      is_sponsored: boolean;
      sponsor_name: string | null;
      image_url: string | null;
    }> = [];
    const publishedTitles: string[] = [];

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const title = String(card.title ?? "").trim();
      const software = String(card.software ?? "").trim();
      const category = String(card.category ?? "").trim();
      const layerCount = Number(card.layer_count);
      const creatorName = String(card.creator_name ?? "").trim();
      const isSponsored = Boolean(card.is_sponsored);
      const sponsorName = String(card.sponsor_name ?? "").trim();
      const imageUrl = String(card.image_url ?? "").trim();

      if (!title || !software || !category) {
        return {
          error: `Card ${i + 1}: Title, Software, and Category are required.`,
          publishedCount: 0,
          publishedTitles: [],
        };
      }
      if (!Number.isFinite(layerCount)) {
        return {
          error: `Card ${i + 1}: Layer Count must be a number.`,
          publishedCount: 0,
          publishedTitles: [],
        };
      }
      if (isSponsored && !sponsorName) {
        return {
          error: `Card ${i + 1}: Sponsor Name is required when sponsored is checked.`,
          publishedCount: 0,
          publishedTitles: [],
        };
      }
      if (!imageUrl) {
        return {
          error: `Card ${i + 1}: missing image URL.`,
          publishedCount: 0,
          publishedTitles: [],
        };
      }

      const position = batchStart + i;
      insertPayload.push({
        title,
        creator_name: creatorName || null,
        day_number: Math.trunc(dayNumber),
        software,
        category,
        layer_count: Math.trunc(layerCount),
        active_date: activeDate,
        position,
        is_sponsored: isSponsored,
        sponsor_name: isSponsored ? sponsorName || null : null,
        image_url: imageUrl,
      });
      publishedTitles.push(title);
    }

    const { error } = await sb.from("challenges").insert(insertPayload);

    if (error) {
      console.error("[admin][addChallenge] Supabase insert error", error);
      return { error: error.message, publishedCount: 0, publishedTitles: [] };
    }

    revalidatePath("/studio");
    return {
      error: null,
      publishedCount: publishedTitles.length,
      publishedTitles,
    };
  } catch (e) {
    console.error("[admin][addChallenge] Unexpected error", e);
    return {
      error: "Unexpected error while inserting challenge batch.",
      publishedCount: 0,
      publishedTitles: [],
    };
  }
}

async function computeDayNumberForDate(targetDate: string) {
  const sb = createSupabaseServerClient(await cookies());
  const { data: rows } = await sb
    .from("challenges")
    .select("active_date, day_number")
    .order("active_date", { ascending: true });

  const list =
    (rows as
      | Array<{
          active_date: string | null;
          day_number: number | null;
        }>
      | null) ?? [];

  const byDate = new Map<string, number | null>();
  for (const r of list) {
    const d = r.active_date ?? "";
    if (!d) continue;
    byDate.set(d, byDate.get(d) ?? r.day_number ?? null);
  }

  const dates = Array.from(byDate.keys()).sort();
  const existing = byDate.get(targetDate);
  if (typeof existing === "number" && Number.isFinite(existing)) {
    return existing;
  }
  const insertIdx = dates.findIndex((d) => d > targetDate);
  return insertIdx === -1 ? dates.length + 1 : insertIdx + 1;
}

async function approveSubmissionSaveForLaterAction(formData: FormData) {
  "use server";
  const allowed = await assertAdminOrNull();
  if (!allowed) return;
  const id = Number(formData.get("submission_id"));
  if (!Number.isFinite(id)) return;

  const sb = createSupabaseServerClient(await cookies());
  const { data: sub } = await sb
    .from("submissions")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  const row = sub as { id: number; status: "pending" | "approved" | "rejected" | null } | null;
  if (!row || row.status !== "pending") return;

  await sb
    .from("submissions")
    .update({
      status: "approved",
      reviewed_at: new Date().toISOString(),
      scheduled_challenge_id: null,
      scheduled_active_date: null,
      scheduled_position: null,
    })
    .eq("id", id);
  revalidatePath("/studio");
}

async function approveAndScheduleSubmissionAction(formData: FormData) {
  "use server";
  const allowed = await assertAdminOrNull();
  if (!allowed) return;

  const submissionId = Number(formData.get("submission_id"));
  const activeDate = String(formData.get("active_date") ?? "").trim();
  const position = Number(formData.get("position"));
  const today = todayYYYYMMDDUSEastern();
  if (!Number.isFinite(submissionId) || !activeDate) return;
  if (!Number.isFinite(position) || position < 1 || position > 5) return;
  if (activeDate <= today) return;

  const sb = createSupabaseServerClient(await cookies());
  const { data: sub } = await sb
    .from("submissions")
    .select(
      "id, title, creator_name, software, category, layer_count, image_url, status, scheduled_challenge_id"
    )
    .eq("id", submissionId)
    .maybeSingle();
  const row = sub as SubmissionAdminRow | null;
  if (!row || row.status !== "pending" || row.scheduled_challenge_id) return;

  const { data: existingAtSlot } = await sb
    .from("challenges")
    .select("id")
    .eq("active_date", activeDate)
    .eq("position", position)
    .maybeSingle();
  if (existingAtSlot) return;

  const dayNumber = await computeDayNumberForDate(activeDate);
  const { data: inserted, error: insertErr } = await sb
    .from("challenges")
    .insert({
      title: row.title ?? "Untitled",
      creator_name: row.creator_name ?? null,
      software: row.software ?? "Other",
      category: row.category ?? "Other",
      layer_count: row.layer_count ?? 0,
      image_url: row.image_url ?? null,
      active_date: activeDate,
      day_number: dayNumber,
      position,
      is_sponsored: false,
      sponsor_name: null,
    })
    .select("id")
    .maybeSingle();
  if (insertErr) return;

  await sb
    .from("submissions")
    .update({
      status: "approved",
      scheduled_challenge_id: (inserted as { id?: string } | null)?.id ?? null,
      scheduled_active_date: activeDate,
      scheduled_position: position,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", submissionId);

  revalidatePath("/studio");
}

async function assignApprovedSubmissionAction(formData: FormData) {
  "use server";
  const allowed = await assertAdminOrNull();
  if (!allowed) return;

  const submissionId = Number(formData.get("submission_id"));
  const activeDate = String(formData.get("active_date") ?? "").trim();
  const position = Number(formData.get("position"));
  const today = todayYYYYMMDDUSEastern();
  if (!Number.isFinite(submissionId) || !activeDate) return;
  if (!Number.isFinite(position) || position < 1 || position > 5) return;
  if (activeDate <= today) return;

  const sb = createSupabaseServerClient(await cookies());
  const { data: sub } = await sb
    .from("submissions")
    .select(
      "id, title, creator_name, software, category, layer_count, image_url, status, scheduled_challenge_id"
    )
    .eq("id", submissionId)
    .maybeSingle();
  const row = sub as SubmissionAdminRow | null;
  if (!row || row.status !== "approved" || row.scheduled_challenge_id) return;

  const { data: existingAtSlot } = await sb
    .from("challenges")
    .select("id")
    .eq("active_date", activeDate)
    .eq("position", position)
    .maybeSingle();
  if (existingAtSlot) return;

  const dayNumber = await computeDayNumberForDate(activeDate);
  const { data: inserted, error: insertErr } = await sb
    .from("challenges")
    .insert({
      title: row.title ?? "Untitled",
      creator_name: row.creator_name ?? null,
      software: row.software ?? "Other",
      category: row.category ?? "Other",
      layer_count: row.layer_count ?? 0,
      image_url: row.image_url ?? null,
      active_date: activeDate,
      day_number: dayNumber,
      position,
      is_sponsored: false,
      sponsor_name: null,
    })
    .select("id")
    .maybeSingle();
  if (insertErr) return;

  await sb
    .from("submissions")
    .update({
      scheduled_challenge_id: (inserted as { id?: string } | null)?.id ?? null,
      scheduled_active_date: activeDate,
      scheduled_position: position,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", submissionId);

  revalidatePath("/studio");
}

async function rejectSubmissionAction(formData: FormData) {
  "use server";
  const allowed = await assertAdminOrNull();
  if (!allowed) return;
  const id = Number(formData.get("submission_id"));
  if (!Number.isFinite(id)) return;
  const sb = createSupabaseServerClient(await cookies());
  await sb
    .from("submissions")
    .update({
      status: "rejected",
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);
  revalidatePath("/studio");
}

function formatAdminDate(date: string | null) {
  if (!date) return "—";
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const isAdmin = await assertAdminOrNull();
  const today = todayYYYYMMDDUSEastern();
  const params = (await searchParams) ?? {};
  const tab =
    params.tab === "submissions" ||
    params.tab === "users" ||
    params.tab === "analytics"
      ? params.tab
      : "schedule";

  if (!isAdmin) {
    redirect("/");
  }

  const { scheduledCounts, readyAheadDays } = await getScheduleOverview(today);
  const challenges =
    tab === "schedule" ? await getUpcomingChallenges(today) : [];
  const sb = createSupabaseServerClient(await cookies());

  let submissions: SubmissionAdminRow[] = [];
  if (tab === "submissions") {
    const { data: authForLog } = await sb.auth.getUser();
    const { data: allSubs, error: submissionsFetchError } = await sb
      .from("submissions")
      .select(
        "id, user_id, title, creator_name, software, category, layer_count, image_url, status, scheduled_challenge_id, scheduled_active_date, scheduled_position, created_at"
      )
      .order("created_at", { ascending: false });
    console.log("[admin][submissions fetch]", {
      rowCount: allSubs?.length ?? 0,
      error: submissionsFetchError,
      authUserId: authForLog.user?.id ?? null,
      authEmail: authForLog.user?.email ?? null,
      sampleIds: (allSubs ?? []).slice(0, 5).map((r) => r.id),
    });
    submissions = (allSubs as SubmissionAdminRow[] | null) ?? [];
  }
  const pendingSubs = submissions.filter((s) => s.status === "pending");
  const approvedPoolSubs = submissions.filter(
    (s) => s.status === "approved" && !s.scheduled_challenge_id
  );
  const approvedScheduledSubs = submissions.filter(
    (s) => s.status === "approved" && Boolean(s.scheduled_challenge_id)
  );
  const approvedCount = submissions.filter((s) => s.status === "approved").length;
  const rejectedCount = submissions.filter((s) => s.status === "rejected").length;

  let users: AdminUserRow[] = [];
  if (tab === "users") {
    const { data: profileRows, error: usersError } = await sb
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });
    if (usersError) {
      console.error("[admin][users]", usersError);
    } else {
      users = (profileRows ?? []) as AdminUserRow[];
    }
  }

  let analytics: AdminAnalytics | null = null;
  if (tab === "analytics") {
    try {
      analytics = await loadAdminAnalytics(sb, today);
    } catch (err) {
      console.error("[admin][analytics]", err);
      analytics = null;
    }
  }

  const minScheduleDate = nextEasternYmd(today);

  return (
    <AppSiteChrome
      title="Layers"
      className="bg-[#0f0520]"
      right={
        <span className="rounded-full border border-[var(--accent)]/35 bg-[var(--accent)]/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white">
          Admin
        </span>
      }
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-4 md:px-5 md:py-6">
        <div className="mb-4 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-100">
          {readyAheadDays} day{readyAheadDays === 1 ? "" : "s"} of content ready
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <Link
            href="/studio?tab=schedule"
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              tab === "schedule"
                ? "bg-[var(--accent)] text-white"
                : "border border-white/15 bg-white/5 text-white/80 hover:bg-white/10"
            }`}
          >
            Schedule
          </Link>
          <Link
            href="/studio?tab=submissions"
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              tab === "submissions"
                ? "bg-[var(--accent)] text-white"
                : "border border-white/15 bg-white/5 text-white/80 hover:bg-white/10"
            }`}
          >
            Submissions
          </Link>
          <Link
            href="/studio?tab=users"
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              tab === "users"
                ? "bg-[var(--accent)] text-white"
                : "border border-white/15 bg-white/5 text-white/80 hover:bg-white/10"
            }`}
          >
            Users
          </Link>
          <Link
            href="/studio?tab=analytics"
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              tab === "analytics"
                ? "bg-[var(--accent)] text-white"
                : "border border-white/15 bg-white/5 text-white/80 hover:bg-white/10"
            }`}
          >
            Analytics
          </Link>
        </div>

        {tab === "schedule" ? (
          <>
            <AdminChallengeFormClient
              today={today}
              action={addChallengeAction}
              scheduledCounts={scheduledCounts}
              upcomingChallenges={challenges}
            />

            <div className="mt-10">
              <div className="text-lg font-extrabold">Upcoming challenges</div>
              <div className="mt-1 text-sm text-white/60">
                Ordered by `active_date` then `position`
              </div>

              <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10">
                {challenges.length === 0 ? (
                  <div className="px-4 py-8 text-center text-white/70">
                    No upcoming challenges
                  </div>
                ) : (
                  <table className="min-w-[1120px] w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/5 text-xs font-semibold uppercase tracking-wider text-white/50">
                        <th className="px-4 py-3">Image</th>
                        <th className="px-4 py-3">Active date</th>
                        <th className="px-4 py-3">Day #</th>
                        <th className="px-4 py-3">Position</th>
                        <th className="px-4 py-3">Title</th>
                        <th className="px-4 py-3">Creator</th>
                        <th className="px-4 py-3">Software</th>
                        <th className="px-4 py-3">Category</th>
                        <th className="px-4 py-3">Layer count</th>
                        <th className="px-4 py-3">Sponsored</th>
                        <th className="px-4 py-3">Sponsor</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {challenges.map((ch, idx) => (
                        <tr
                          key={ch.id}
                          className={`border-b border-white/5 last:border-0 ${
                            idx % 2 === 0 ? "bg-white/[0.02]" : "bg-transparent"
                          }`}
                        >
                          <td className="px-4 py-3">
                            {ch.image_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={ch.image_url}
                                alt=""
                                className="h-10 w-10 rounded-md border border-white/10 object-cover"
                              />
                            ) : (
                              <div className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-black/20 text-xs text-white/45">
                                —
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono text-white/80">
                            {formatAdminDate(ch.active_date)}
                          </td>
                          <td className="px-4 py-3 font-mono text-white/80">
                            {ch.day_number ?? "—"}
                          </td>
                          <td className="px-4 py-3 font-mono text-white/80">
                            {ch.position ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-white/90">
                            {ch.title ?? "Untitled"}
                          </td>
                          <td className="px-4 py-3 text-white/80">
                            <AtCreatorDisplay raw={ch.creator_name} />
                          </td>
                          <td className="px-4 py-3 text-white/80">
                            {ch.software ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-white/80">
                            {ch.category ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-white/80">
                            {ch.layer_count ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-white/80">
                            {ch.is_sponsored ? "Yes" : "No"}
                          </td>
                          <td className="px-4 py-3 text-white/80">
                            {ch.is_sponsored ? ch.sponsor_name ?? "—" : "—"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
                              >
                                Edit
                              </button>
                              <DeleteButton id={ch.id} />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        ) : tab === "submissions" ? (
          <div className="rounded-2xl border border-white/10 bg-[rgba(26,10,46,0.65)] p-5">
            <div className="text-lg font-extrabold">Submissions</div>
            <div className="mt-1 text-sm text-white/60">
              {pendingSubs.length} pending, {approvedCount} approved, {rejectedCount} rejected
            </div>
            <div className="mt-6">
              <div className="text-sm font-bold text-white/90">Pending Queue</div>
              {pendingSubs.length === 0 ? (
                <div className="mt-3 text-sm text-white/70">No pending submissions.</div>
              ) : (
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  {pendingSubs.map((s) => (
                    <div
                      key={s.id}
                      className="rounded-2xl border border-white/10 bg-black/25 p-4"
                    >
                      {s.image_url ? (
                        <AdminSubmissionImage
                          src={s.image_url}
                          alt={s.title ?? "Submission"}
                          className="h-40 w-full rounded-xl border border-white/10 object-cover"
                        />
                      ) : null}
                      <div className="mt-3 text-base font-bold text-white">
                        {s.title ?? "Untitled"}
                      </div>
                      <div className="mt-1 text-sm text-white/70">
                        <AtCreatorDisplay raw={s.creator_name} /> ·{" "}
                        {s.layer_count ?? 0} layers
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <form action={approveSubmissionSaveForLaterAction}>
                          <input type="hidden" name="submission_id" value={s.id} />
                          <button
                            type="submit"
                            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-500"
                          >
                            Approve &amp; Save for Later
                          </button>
                        </form>
                        <form action={rejectSubmissionAction}>
                          <input type="hidden" name="submission_id" value={s.id} />
                          <button
                            type="submit"
                            className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-500"
                          >
                            Reject
                          </button>
                        </form>
                      </div>
                      <form
                        action={approveAndScheduleSubmissionAction}
                        className="mt-4 space-y-3 rounded-xl border border-white/10 bg-black/30 p-3"
                      >
                        <div className="text-xs font-bold uppercase tracking-wider text-white/50">
                          Approve &amp; schedule
                        </div>
                        <input type="hidden" name="submission_id" value={s.id} />
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div>
                            <label className="text-xs font-semibold text-white/70">Date</label>
                            <input
                              name="active_date"
                              type="date"
                              min={minScheduleDate}
                              required
                              className="mt-1 w-full rounded-lg border border-white/15 bg-black/35 px-3 py-2 text-sm text-white outline-none"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-white/70">Position</label>
                            <select
                              name="position"
                              required
                              defaultValue=""
                              className="mt-1 w-full rounded-lg border border-white/15 bg-black/35 px-3 py-2 text-sm text-white outline-none"
                            >
                              <option value="" disabled>
                                Select…
                              </option>
                              {[1, 2, 3, 4, 5].map((n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <button
                          type="submit"
                          className="w-full rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-bold text-white hover:bg-[var(--accent2)] sm:w-auto"
                        >
                          Approve &amp; Schedule
                        </button>
                      </form>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-8">
              <div className="text-sm font-bold text-white/90">
                Approved Submissions Pool (Unscheduled)
              </div>
              {approvedPoolSubs.length === 0 ? (
                <div className="mt-3 text-sm text-white/70">
                  No approved unscheduled submissions.
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  {approvedPoolSubs.map((s) => (
                    <div
                      key={`approved-${s.id}`}
                      className="rounded-2xl border border-white/10 bg-black/25 p-4"
                    >
                      {s.image_url ? (
                        <AdminSubmissionImage
                          src={s.image_url}
                          alt={s.title ?? "Submission"}
                          className="h-40 w-full rounded-xl border border-white/10 object-cover"
                        />
                      ) : null}
                      <div className="mt-3 text-base font-bold text-white">
                        {s.title ?? "Untitled"}
                      </div>
                      <div className="mt-1 text-sm text-white/70">
                        <AtCreatorDisplay raw={s.creator_name} /> ·{" "}
                        {s.layer_count ?? 0} layers
                      </div>

                      <details className="mt-4 rounded-xl border border-white/10 bg-black/30 open:border-[var(--accent)]/40">
                        <summary className="cursor-pointer list-none px-3 py-2 text-xs font-bold text-white/90 [&::-webkit-details-marker]:hidden">
                          <span className="underline decoration-white/30 underline-offset-2">
                            Schedule
                          </span>
                        </summary>
                        <form
                          action={assignApprovedSubmissionAction}
                          className="grid grid-cols-1 gap-3 border-t border-white/10 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
                        >
                          <input type="hidden" name="submission_id" value={s.id} />
                          <div>
                            <label className="text-xs font-semibold text-white/70">Date</label>
                            <input
                              name="active_date"
                              type="date"
                              min={minScheduleDate}
                              required
                              className="mt-1 w-full rounded-lg border border-white/15 bg-black/35 px-3 py-2 text-sm text-white outline-none"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-white/70">Position</label>
                            <select
                              name="position"
                              required
                              defaultValue=""
                              className="mt-1 w-full rounded-lg border border-white/15 bg-black/35 px-3 py-2 text-sm text-white outline-none"
                            >
                              <option value="" disabled>
                                Select…
                              </option>
                              {[1, 2, 3, 4, 5].map((n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                            </select>
                          </div>
                          <button
                            type="submit"
                            className="rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-bold text-white hover:bg-[var(--accent2)]"
                          >
                            Schedule
                          </button>
                        </form>
                      </details>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-8">
              <div className="text-sm font-bold text-white/90">
                Already Scheduled (Approved)
              </div>
              {approvedScheduledSubs.length === 0 ? (
                <div className="mt-3 text-sm text-white/70">
                  No approved submissions have been scheduled yet.
                </div>
              ) : (
                <div className="mt-4 space-y-2">
                  {approvedScheduledSubs.map((s) => (
                    <div
                      key={`scheduled-${s.id}`}
                      className="flex items-center justify-between rounded-xl border border-white/10 bg-black/25 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-white">
                          {s.title ?? "Untitled"}
                        </div>
                        <div className="text-xs text-white/60">
                          <AtCreatorDisplay raw={s.creator_name} /> ·{" "}
                          {s.scheduled_active_date ?? "—"} · position{" "}
                          {s.scheduled_position ?? "—"}
                        </div>
                      </div>
                      <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-200">
                        Scheduled
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : tab === "analytics" ? (
          !analytics ? (
            <div className="rounded-2xl border border-white/10 bg-[rgba(26,10,46,0.65)] px-4 py-8 text-center text-sm text-white/70">
              Could not load analytics.
            </div>
          ) : (
            <div className="space-y-10">
              <div>
                <div className="text-lg font-extrabold text-white">Analytics</div>
                <p className="mt-1 text-sm text-white/55">
                  &quot;Today&quot; and signup buckets use US Eastern ({today}). Data refreshes on each page load.
                </p>
              </div>

              <section>
                <div className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--accent)]">
                  User metrics
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-2xl border border-[var(--accent)]/25 bg-[rgba(26,10,46,0.75)] px-4 py-4 shadow-sm">
                    <div className="text-xs font-semibold uppercase tracking-wider text-white/50">
                      Total registered users
                    </div>
                    <div className="mt-2 text-2xl font-extrabold tabular-nums text-white">
                      {analytics.totalUsers.toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[var(--accent)]/25 bg-[rgba(26,10,46,0.75)] px-4 py-4 shadow-sm">
                    <div className="text-xs font-semibold uppercase tracking-wider text-white/50">
                      Active today
                    </div>
                    <div className="mt-2 text-2xl font-extrabold tabular-nums text-white">
                      {analytics.activeToday.toLocaleString()}
                    </div>
                    <div className="mt-1 text-xs text-white/45">Distinct users with a result row (Eastern day)</div>
                  </div>
                  <div className="rounded-2xl border border-[var(--accent)]/25 bg-[rgba(26,10,46,0.75)] px-4 py-4 shadow-sm">
                    <div className="text-xs font-semibold uppercase tracking-wider text-white/50">
                      Active last 7 days
                    </div>
                    <div className="mt-2 text-2xl font-extrabold tabular-nums text-white">
                      {analytics.activeWeek.toLocaleString()}
                    </div>
                    <div className="mt-1 text-xs text-white/45">Rolling window, distinct users</div>
                  </div>
                  <div className="rounded-2xl border border-[var(--accent)]/25 bg-[rgba(26,10,46,0.75)] px-4 py-4 shadow-sm">
                    <div className="text-xs font-semibold uppercase tracking-wider text-white/50">
                      Total guesses
                    </div>
                    <div className="mt-2 text-2xl font-extrabold tabular-nums text-white">
                      {analytics.totalGuesses.toLocaleString()}
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <div className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--accent)]">
                  Retention
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-2xl border border-[var(--accent)]/25 bg-[rgba(26,10,46,0.75)] px-4 py-4 shadow-sm">
                    <div className="text-xs font-semibold uppercase tracking-wider text-white/50">
                      Streak ≥ 3 days
                    </div>
                    <div className="mt-2 text-2xl font-extrabold tabular-nums text-white">
                      {analytics.streakGte3.toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[var(--accent)]/25 bg-[rgba(26,10,46,0.75)] px-4 py-4 shadow-sm">
                    <div className="text-xs font-semibold uppercase tracking-wider text-white/50">
                      Streak ≥ 7 days
                    </div>
                    <div className="mt-2 text-2xl font-extrabold tabular-nums text-white">
                      {analytics.streakGte7.toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[var(--accent)]/25 bg-[rgba(26,10,46,0.75)] px-4 py-4 shadow-sm">
                    <div className="text-xs font-semibold uppercase tracking-wider text-white/50">
                      Streak ≥ 30 days
                    </div>
                    <div className="mt-2 text-2xl font-extrabold tabular-nums text-white">
                      {analytics.streakGte30.toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[var(--accent)]/25 bg-[rgba(26,10,46,0.75)] px-4 py-4 shadow-sm">
                    <div className="text-xs font-semibold uppercase tracking-wider text-white/50">
                      Avg. current streak
                    </div>
                    <div className="mt-2 text-2xl font-extrabold tabular-nums text-white">
                      {analytics.avgStreak.toFixed(1)}
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <div className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--accent)]">
                  Content
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-2xl border border-[var(--accent)]/25 bg-[rgba(26,10,46,0.75)] px-4 py-4 shadow-sm">
                    <div className="text-xs font-semibold uppercase tracking-wider text-white/50">
                      Challenges published
                    </div>
                    <div className="mt-2 text-2xl font-extrabold tabular-nums text-white">
                      {analytics.totalChallenges.toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[var(--accent)]/25 bg-[rgba(26,10,46,0.75)] px-4 py-4 shadow-sm">
                    <div className="text-xs font-semibold uppercase tracking-wider text-white/50">
                      Days scheduled ahead
                    </div>
                    <div className="mt-2 text-2xl font-extrabold tabular-nums text-white">
                      {analytics.daysAhead.toLocaleString()}
                    </div>
                    <div className="mt-1 text-xs text-white/45">Distinct future `active_date` values</div>
                  </div>
                  <div className="rounded-2xl border border-[var(--accent)]/25 bg-[rgba(26,10,46,0.75)] px-4 py-4 shadow-sm">
                    <div className="text-xs font-semibold uppercase tracking-wider text-white/50">
                      Total image downloads
                    </div>
                    <div className="mt-2 text-2xl font-extrabold tabular-nums text-white">
                      {analytics.totalImageDownloads.toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[var(--accent)]/25 bg-[rgba(26,10,46,0.75)] px-4 py-4 shadow-sm">
                    <div className="text-xs font-semibold uppercase tracking-wider text-white/50">
                      Most downloaded challenge
                    </div>
                    <div className="mt-2 text-base font-extrabold leading-snug text-white">
                      {analytics.topDownloadCount > 0
                        ? analytics.topDownloadTitle ?? "Untitled"
                        : "—"}
                    </div>
                    <div className="mt-1 text-sm tabular-nums text-[var(--accent)]/90">
                      {analytics.topDownloadCount.toLocaleString()} downloads
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <div className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--accent)]">
                  Leaderboard snapshot
                </div>
                <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[rgba(26,10,46,0.65)]">
                  <table className="min-w-[480px] w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/5 text-xs font-semibold uppercase tracking-wider text-white/50">
                        <th className="px-4 py-3">#</th>
                        <th className="px-4 py-3">Username</th>
                        <th className="px-4 py-3 text-right">Total solved</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.topPlayers.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-4 py-6 text-center text-white/60">
                            No players yet
                          </td>
                        </tr>
                      ) : (
                        analytics.topPlayers.map((p, i) => (
                          <tr key={p.id} className="border-b border-white/5 last:border-0">
                            <td className="px-4 py-3 font-mono text-white/60">{i + 1}</td>
                            <td className="px-4 py-3 text-white/90">
                              <AtUsernameDisplay
                                raw={p.username}
                                fallback={`player_${p.id.slice(0, 8)}`}
                              />
                            </td>
                            <td className="px-4 py-3 text-right font-semibold tabular-nums text-white">
                              {p.total_solved.toLocaleString()}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section>
                <div className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--accent)]">
                  New signups (14 days)
                </div>
                <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[rgba(26,10,46,0.65)]">
                  <table className="min-w-[360px] w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/5 text-xs font-semibold uppercase tracking-wider text-white/50">
                        <th className="px-4 py-3">Day (US Eastern)</th>
                        <th className="px-4 py-3 text-right">New users</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.signupsByDay.map((row) => (
                        <tr key={row.date} className="border-b border-white/5 last:border-0">
                          <td className="px-4 py-2.5 font-mono text-white/85">{row.date}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-white/90">
                            {row.count.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[rgba(26,10,46,0.65)]">
            <table className="min-w-[1040px] w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/5 text-xs font-semibold uppercase tracking-wider text-white/50">
                  <th className="px-4 py-3">Username</th>
                  <th className="px-4 py-3">Avatar</th>
                  <th className="px-4 py-3">Joined</th>
                  <th className="px-4 py-3">Total solved</th>
                  <th className="px-4 py-3">Current streak</th>
                  <th className="px-4 py-3">Longest streak</th>
                  <th className="px-4 py-3">Perfect days</th>
                  <th className="px-4 py-3">Last played</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-white/5 last:border-0">
                    <td className="px-4 py-3 text-white/90">
                      <AtUsernameDisplay
                        raw={u.username}
                        fallback={`player_${u.id.slice(0, 8)}`}
                      />
                    </td>
                    <td className="px-4 py-3 text-white/80">
                      {u.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={u.avatar_url}
                          alt=""
                          className="h-8 w-8 rounded-full border border-white/15 object-cover"
                        />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-white/80">
                      {formatAdminDate(u.created_at ? u.created_at.slice(0, 10) : null)}
                    </td>
                    <td className="px-4 py-3 text-white/80">{u.total_solved ?? 0}</td>
                    <td className="px-4 py-3 text-white/80">{u.current_streak ?? 0}</td>
                    <td className="px-4 py-3 text-white/80">{u.longest_streak ?? 0}</td>
                    <td className="px-4 py-3 text-white/80">{u.perfect_days ?? 0}</td>
                    <td className="px-4 py-3 text-white/80">{u.last_played_date ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppSiteChrome>
  );
}


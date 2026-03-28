import Link from "next/link";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { todayYYYYMMDDUSEastern } from "@/lib/today-us-eastern";
import { createSupabaseServerClient } from "@/lib/supabase";
import { AdminChallengeFormClient } from "@/app/admin/AdminChallengeFormClient";
import { AdminSubmissionImage } from "@/app/admin/AdminSubmissionImage";
import { DeleteButton } from "@/app/admin/DeleteButton";
import { formatAtCreator, formatAtUsername } from "@/lib/username-display";

const ADMIN_EMAIL = "rjlabudie@gmail.com";

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
  email: string | null;
  created_at: string | null;
  total_solved: number | null;
  current_streak: number | null;
  last_played_date: string | null;
};

async function getSignedInEmail() {
  const sb = createSupabaseServerClient(await cookies());
  const { data } = await sb.auth.getUser();
  return data.user?.email ?? null;
}

async function assertAdminOrNull() {
  const email = await getSignedInEmail();
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

    revalidatePath("/admin");
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

async function approveSubmissionAction(formData: FormData) {
  "use server";
  const allowed = await assertAdminOrNull();
  if (!allowed) return;
  const id = Number(formData.get("submission_id"));
  if (!Number.isFinite(id)) return;

  const sb = createSupabaseServerClient(await cookies());
  const { data: sub } = await sb
    .from("submissions")
    .select(
      "id, status"
    )
    .eq("id", id)
    .maybeSingle();
  const row = sub as { id: number; status: "pending" | "approved" | "rejected" | null } | null;
  if (!row || row.status !== "pending") return;

  await sb
    .from("submissions")
    .update({
      status: "approved",
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);
  revalidatePath("/admin");
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

  revalidatePath("/admin");
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
  revalidatePath("/admin");
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
  const tab = params.tab === "submissions" || params.tab === "users" ? params.tab : "schedule";

  if (!isAdmin) {
    return (
      <div className="min-h-screen w-full bg-[var(--background)] text-[var(--text)] flex items-center justify-center px-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-6 text-center">
          Access denied
        </div>
      </div>
    );
  }

  const challenges = await getUpcomingChallenges(today);
  const sb = createSupabaseServerClient(await cookies());
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
  const submissions = (allSubs as SubmissionAdminRow[] | null) ?? [];
  const pendingSubs = submissions.filter((s) => s.status === "pending");
  const approvedPoolSubs = submissions.filter(
    (s) => s.status === "approved" && !s.scheduled_challenge_id
  );
  const approvedScheduledSubs = submissions.filter(
    (s) => s.status === "approved" && Boolean(s.scheduled_challenge_id)
  );
  const approvedCount = submissions.filter((s) => s.status === "approved").length;
  const rejectedCount = submissions.filter((s) => s.status === "rejected").length;

  const { data: usersRows } = await sb
    .from("profiles")
    .select("id, username, email, created_at, total_solved, current_streak, last_played_date")
    .order("last_played_date", { ascending: false, nullsFirst: false });
  const users = (usersRows as AdminUserRow[] | null) ?? [];
  const { scheduledCounts, readyAheadDays } = await getScheduleOverview(today);

  return (
    <div className="min-h-screen w-full bg-[#0f0520] text-[var(--text)]">
      <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-5 md:py-8">
        <header className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[rgba(26,10,46,0.75)] px-4 py-3 shadow-sm backdrop-blur-sm">
          <div className="text-xl font-extrabold tracking-tight">Layers</div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-[var(--accent)]/35 bg-[var(--accent)]/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white">
              Admin
            </span>
            <Link
              href="/"
              className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/10"
            >
              ← Back
            </Link>
          </div>
        </header>

        <div className="mb-4 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-100">
          {readyAheadDays} day{readyAheadDays === 1 ? "" : "s"} of content ready
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <Link
            href="/admin?tab=schedule"
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              tab === "schedule"
                ? "bg-[var(--accent)] text-white"
                : "border border-white/15 bg-white/5 text-white/80 hover:bg-white/10"
            }`}
          >
            Schedule
          </Link>
          <Link
            href="/admin?tab=submissions"
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              tab === "submissions"
                ? "bg-[var(--accent)] text-white"
                : "border border-white/15 bg-white/5 text-white/80 hover:bg-white/10"
            }`}
          >
            Submissions
          </Link>
          <Link
            href="/admin?tab=users"
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              tab === "users"
                ? "bg-[var(--accent)] text-white"
                : "border border-white/15 bg-white/5 text-white/80 hover:bg-white/10"
            }`}
          >
            Users
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
                            {formatAtCreator(ch.creator_name)}
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
                        {formatAtCreator(s.creator_name)} · {s.layer_count ?? 0}{" "}
                        layers
                      </div>
                      <div className="mt-4 flex items-center gap-2">
                        <form action={approveSubmissionAction}>
                          <input type="hidden" name="submission_id" value={s.id} />
                          <button
                            type="submit"
                            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-500"
                          >
                            Approve
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
                        <button
                          type="button"
                          className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs font-semibold text-white/90"
                        >
                          Skip
                        </button>
                      </div>
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
                        {formatAtCreator(s.creator_name)} · {s.layer_count ?? 0}{" "}
                        layers
                      </div>

                      <form action={assignApprovedSubmissionAction} className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_90px_auto] sm:items-end">
                        <input type="hidden" name="submission_id" value={s.id} />
                        <div>
                          <label className="text-xs font-semibold text-white/70">Future Date</label>
                          <input
                            name="active_date"
                            type="date"
                            min={(() => {
                              const d = new Date(`${today}T00:00:00`);
                              d.setDate(d.getDate() + 1);
                              return d.toISOString().slice(0, 10);
                            })()}
                            required
                            className="mt-1 w-full rounded-lg border border-white/15 bg-black/35 px-3 py-2 text-sm text-white outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-white/70">Pos (1-5)</label>
                          <input
                            name="position"
                            type="number"
                            min={1}
                            max={5}
                            required
                            className="mt-1 w-full rounded-lg border border-white/15 bg-black/35 px-3 py-2 text-sm text-white outline-none"
                          />
                        </div>
                        <button
                          type="submit"
                          className="rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-bold text-white hover:bg-[var(--accent2)]"
                        >
                          Assign
                        </button>
                      </form>
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
                          {formatAtCreator(s.creator_name)} ·{" "}
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
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[rgba(26,10,46,0.65)]">
            <table className="min-w-[900px] w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/5 text-xs font-semibold uppercase tracking-wider text-white/50">
                  <th className="px-4 py-3">Username</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Join date</th>
                  <th className="px-4 py-3">Total solved</th>
                  <th className="px-4 py-3">Current streak</th>
                  <th className="px-4 py-3">Last played</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-white/5 last:border-0">
                    <td className="px-4 py-3 text-white/90">
                      {formatAtUsername(
                        u.username,
                        `player_${u.id.slice(0, 8)}`
                      )}
                    </td>
                    <td className="px-4 py-3 text-white/80">{u.email ?? "—"}</td>
                    <td className="px-4 py-3 text-white/80">{formatAdminDate(u.created_at ? u.created_at.slice(0, 10) : null)}</td>
                    <td className="px-4 py-3 text-white/80">{u.total_solved ?? 0}</td>
                    <td className="px-4 py-3 text-white/80">{u.current_streak ?? 0}</td>
                    <td className="px-4 py-3 text-white/80">{u.last_played_date ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}


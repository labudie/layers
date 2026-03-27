import Link from "next/link";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { todayYYYYMMDDUSEastern } from "@/lib/today-us-eastern";
import { createSupabaseServerClient } from "@/lib/supabase";
import { AdminChallengeFormClient } from "@/app/admin/AdminChallengeFormClient";
import { DeleteButton } from "@/app/admin/DeleteButton";

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

      const position = i + 1;
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

export default async function AdminPage() {
  const isAdmin = await assertAdminOrNull();
  const today = todayYYYYMMDDUSEastern();

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

        <AdminChallengeFormClient
          today={today}
          action={addChallengeAction}
          scheduledCounts={scheduledCounts}
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
                        {ch.creator_name ?? "—"}
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
      </div>
    </div>
  );
}


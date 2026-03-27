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
  successAt?: number | null;
};

const initialAddChallengeState: AddChallengeState = {
  error: null,
  successAt: null,
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

async function addChallengeAction(
  _prevState: AddChallengeState,
  formData: FormData
): Promise<AddChallengeState> {
  "use server";

  const allowed = await assertAdminOrNull();
  if (!allowed) return { error: "Access denied", successAt: null };

  const title = String(formData.get("title") ?? "").trim();
  const creatorName = String(formData.get("creator_name") ?? "").trim();
  const software = String(formData.get("software") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const activeDate = String(formData.get("active_date") ?? "").trim();
  const dayNumberRaw = formData.get("day_number");
  const dayNumber =
    typeof dayNumberRaw === "string" ? Number(dayNumberRaw) : Number(dayNumberRaw);
  const layerCountRaw = formData.get("layer_count");
  const positionRaw = formData.get("position");

  const layerCount = Number(layerCountRaw);
  const position = Number(positionRaw);

  const isSponsored = formData.get("is_sponsored") === "true";
  const sponsorName = String(formData.get("sponsor_name") ?? "").trim();

  console.log("[admin][addChallenge] submitted", {
    title,
    creatorName,
    software,
    category,
    activeDate,
    layerCountRaw,
    positionRaw,
    isSponsored,
    sponsorName,
  });

  if (!title || !software || !category) {
    return { error: "Title, Software, and Category are required.", successAt: null };
  }
  if (!activeDate) {
    return { error: "Active Date is required.", successAt: null };
  }
  if (!Number.isFinite(dayNumber)) {
    return { error: "Day Number must be a number.", successAt: null };
  }
  if (!Number.isFinite(layerCount)) {
    return { error: "Layer Count must be a number.", successAt: null };
  }
  if (!Number.isFinite(position) || position < 1 || position > 5) {
    return { error: "Position must be between 1 and 5.", successAt: null };
  }
  if (isSponsored && !sponsorName) {
    return { error: "Sponsor Name is required when sponsored is checked.", successAt: null };
  }

  try {
    const sb = createSupabaseServerClient(await cookies());

    const sanitizeForFilename = (value: string) => {
      const v = value
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-_]/g, "")
        .slice(0, 80);
      return v || "challenge";
    };

    const imageFileRaw = formData.get("image");
    let imageUrl: string | null = null;

    if (
      imageFileRaw &&
      typeof imageFileRaw === "object" &&
      "arrayBuffer" in imageFileRaw
    ) {
      const imageFile = imageFileRaw as unknown as File;
      const contentType = imageFile.type || "image/png";

      const isPngOrJpg =
        contentType === "image/png" || contentType === "image/jpeg";

      if (isPngOrJpg && imageFile.size > 0) {
        const storagePath = `${activeDate}-${Math.trunc(
          position
        )}-${sanitizeForFilename(title)}.png`;

        console.log("[admin][addChallenge] uploading image", {
          storagePath,
          contentType,
        });

        const { error: uploadError } = await sb.storage
          .from("challenge-images")
          .upload(storagePath, imageFile, {
            contentType,
            upsert: true,
          });

        if (uploadError) {
          console.error("[admin][addChallenge] image upload error", uploadError);
          return { error: uploadError.message, successAt: null };
        }

        const { data } = sb.storage
          .from("challenge-images")
          .getPublicUrl(storagePath);

        imageUrl = data.publicUrl ?? null;
      }
    }

    const insertPayload = {
      title,
      creator_name: creatorName || null,
      day_number: Math.trunc(dayNumber),
      software,
      category,
      layer_count: Math.trunc(layerCount),
      active_date: activeDate,
      position: Math.trunc(position),
      is_sponsored: isSponsored,
      sponsor_name: isSponsored ? (sponsorName.trim() ? sponsorName : null) : null,
      image_url: imageUrl,
    };

    console.log("[admin][addChallenge] insert payload", insertPayload);

    const { error } = await sb.from("challenges").insert(insertPayload);

    if (error) {
      console.error("[admin][addChallenge] Supabase insert error", error);
      return { error: error.message, successAt: null };
    }

    revalidatePath("/admin");
    return { error: null, successAt: Date.now() };
  } catch (e) {
    console.error("[admin][addChallenge] Unexpected error", e);
    return { error: "Unexpected error while inserting challenge.", successAt: null };
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

        <AdminChallengeFormClient
          today={today}
          action={addChallengeAction}
          initialState={initialAddChallengeState}
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


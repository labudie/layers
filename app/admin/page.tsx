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
  software: string | null;
  category: string | null;
  layer_count: number | null;
  active_date: string | null;
  position: number | null;
  is_sponsored: boolean | null;
  sponsor_name: string | null;
};

type AddChallengeState = {
  error: string | null;
};

const initialAddChallengeState: AddChallengeState = { error: null };

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
      "id,title,software,category,layer_count,active_date,position,is_sponsored,sponsor_name"
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
  if (!allowed) return { error: "Access denied" };

  const title = String(formData.get("title") ?? "").trim();
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
    software,
    category,
    activeDate,
    layerCountRaw,
    positionRaw,
    isSponsored,
    sponsorName,
  });

  if (!title || !software || !category) {
    return { error: "Title, Software, and Category are required." };
  }
  if (!activeDate) {
    return { error: "Active Date is required." };
  }
  if (!Number.isFinite(dayNumber)) {
    return { error: "Day Number must be a number." };
  }
  if (!Number.isFinite(layerCount)) {
    return { error: "Layer Count must be a number." };
  }
  if (!Number.isFinite(position) || position < 1 || position > 5) {
    return { error: "Position must be between 1 and 5." };
  }
  if (isSponsored && !sponsorName) {
    return { error: "Sponsor Name is required when sponsored is checked." };
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
          return { error: uploadError.message };
        }

        const { data } = sb.storage
          .from("challenge-images")
          .getPublicUrl(storagePath);

        imageUrl = data.publicUrl ?? null;
      }
    }

    const insertPayload = {
      title,
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
      return { error: error.message };
    }

    revalidatePath("/admin");
    return { error: null };
  } catch (e) {
    console.error("[admin][addChallenge] Unexpected error", e);
    return { error: "Unexpected error while inserting challenge." };
  }
}

export default async function AdminPage() {
  const isAdmin = await assertAdminOrNull();
  const today = todayYYYYMMDDUSEastern();

  if (!isAdmin) {
    return (
      <div className="min-h-screen w-full bg-black text-white flex items-center justify-center px-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-6 text-center">
          Access denied
        </div>
      </div>
    );
  }

  const challenges = await getUpcomingChallenges(today);

  return (
    <div className="min-h-screen w-full bg-black text-white">
      <div className="mx-auto w-full max-w-3xl px-5 py-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <div className="text-2xl font-extrabold tracking-tight">
              Admin
            </div>
            <div className="mt-1 text-sm text-white/60">
              Add and manage daily challenges
            </div>
          </div>

          <Link
            href="/"
            className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
          >
            ← Home
          </Link>
        </div>

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
              <table className="min-w-[980px] w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5 text-xs font-semibold uppercase tracking-wider text-white/50">
                    <th className="px-4 py-3">Active date</th>
                    <th className="px-4 py-3">Position</th>
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3">Software</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Layer count</th>
                    <th className="px-4 py-3">Sponsored</th>
                    <th className="px-4 py-3">Sponsor</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {challenges.map((ch) => (
                    <tr
                      key={ch.id}
                      className="border-b border-white/5 last:border-0"
                    >
                      <td className="px-4 py-3 font-mono text-white/80">
                        {ch.active_date ?? "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-white/80">
                        {ch.position ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-white/90">
                        {ch.title ?? "Untitled"}
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
                        <DeleteButton id={ch.id} />
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


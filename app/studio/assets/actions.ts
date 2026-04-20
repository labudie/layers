"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase";
import { todayYYYYMMDDUSEastern } from "@/lib/today-us-eastern";

const ADMIN_EMAIL = "rjlabudie@gmail.com".toLowerCase();

type AdminGate =
  | { ok: true; sb: ReturnType<typeof createSupabaseServerClient> }
  | { ok: false; error: string };

async function getAdminSupabase(): Promise<AdminGate> {
  const sb = createSupabaseServerClient(await cookies());
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

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
    const { data: prof } = await sb.from("profiles").select("email").eq("id", user.id).maybeSingle();
    const pe = (prof as { email?: string | null } | null)?.email;
    if (typeof pe === "string" && pe.trim()) email = pe.trim().toLowerCase();
  }

  if (email !== ADMIN_EMAIL) return { ok: false, error: "Access denied." };
  return { ok: true, sb };
}

async function computeDayNumberForDate(
  sb: ReturnType<typeof createSupabaseServerClient>,
  targetDate: string,
): Promise<number> {
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

export type AssetUpsertFields = {
  title: string;
  creator_name: string;
  software: string;
  category: string;
  layer_count: number;
  is_sponsored: boolean;
  sponsor_name: string;
  image_url: string;
};

function validateAssetFields(f: AssetUpsertFields): string | null {
  const title = String(f.title ?? "").trim();
  const software = String(f.software ?? "").trim();
  const category = String(f.category ?? "").trim();
  const layerCount = Number(f.layer_count);
  const sponsorName = String(f.sponsor_name ?? "").trim();
  if (!title || !software || !category) return "Title, software, and category are required.";
  if (!Number.isFinite(layerCount) || layerCount < 0) return "Layer count must be a valid number.";
  if (f.is_sponsored && !sponsorName) return "Sponsor name is required when sponsored.";
  if (!String(f.image_url ?? "").trim()) return "Image URL is required.";
  return null;
}

export async function insertReadyAssetAction(
  fields: AssetUpsertFields,
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const gate = await getAdminSupabase();
  if (!gate.ok) return { ok: false, error: gate.error };
  const err = validateAssetFields(fields);
  if (err) return { ok: false, error: err };

  const { sb } = gate;
  const { data, error } = await sb
    .from("assets")
    .insert({
      title: fields.title.trim(),
      creator_name: fields.creator_name.trim() || null,
      software: fields.software.trim(),
      category: fields.category.trim(),
      layer_count: Math.trunc(Number(fields.layer_count)),
      is_sponsored: Boolean(fields.is_sponsored),
      sponsor_name: fields.is_sponsored ? fields.sponsor_name.trim() || null : null,
      image_url: fields.image_url.trim(),
      status: "ready",
      source: "admin",
      uploaded_by: (await gate.sb.auth.getUser()).data.user?.id ?? null,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[assets] insertReady", error);
    return { ok: false, error: error.message };
  }
  const id = (data as { id?: string } | null)?.id;
  revalidatePath("/studio/assets");
  return { ok: true, id };
}

export async function updateAssetAction(
  id: string,
  fields: Partial<AssetUpsertFields> & { status?: string },
): Promise<{ ok: boolean; error?: string }> {
  const gate = await getAdminSupabase();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { sb } = gate;

  const { data: existing, error: exErr } = await sb.from("assets").select("*").eq("id", id).maybeSingle();
  if (exErr || !existing) return { ok: false, error: "Asset not found." };
  const ex = existing as Record<string, unknown>;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (fields.title !== undefined) patch.title = String(fields.title).trim();
  if (fields.creator_name !== undefined) patch.creator_name = String(fields.creator_name).trim() || null;
  if (fields.software !== undefined) patch.software = String(fields.software).trim();
  if (fields.category !== undefined) patch.category = String(fields.category).trim();
  if (fields.layer_count !== undefined) patch.layer_count = Math.trunc(Number(fields.layer_count));
  if (fields.is_sponsored !== undefined) patch.is_sponsored = Boolean(fields.is_sponsored);
  if (fields.sponsor_name !== undefined) {
    patch.sponsor_name = String(fields.sponsor_name).trim() || null;
  }
  if (fields.image_url !== undefined) patch.image_url = String(fields.image_url).trim() || null;
  if (fields.status !== undefined) patch.status = fields.status;

  const merged: AssetUpsertFields = {
    title: String(patch.title ?? ex.title ?? ""),
    creator_name: String(patch.creator_name ?? ex.creator_name ?? ""),
    software: String(patch.software ?? ex.software ?? ""),
    category: String(patch.category ?? ex.category ?? ""),
    layer_count: Number(patch.layer_count ?? ex.layer_count ?? 0),
    is_sponsored: Boolean(patch.is_sponsored ?? ex.is_sponsored),
    sponsor_name: String(patch.sponsor_name ?? ex.sponsor_name ?? ""),
    image_url: String(patch.image_url ?? ex.image_url ?? ""),
  };
  const err = validateAssetFields(merged);
  if (err) return { ok: false, error: err };

  const { error } = await sb.from("assets").update(patch).eq("id", id);
  if (error) {
    console.error("[assets] update", error);
    return { ok: false, error: error.message };
  }
  revalidatePath("/studio/assets");
  return { ok: true };
}

export async function approveSubmissionToAssetAction(
  submissionId: number,
): Promise<{ ok: boolean; error?: string }> {
  const gate = await getAdminSupabase();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { sb } = gate;
  if (!Number.isFinite(submissionId)) return { ok: false, error: "Invalid submission." };

  const { data: sub, error: subErr } = await sb
    .from("submissions")
    .select("*")
    .eq("id", submissionId)
    .maybeSingle();
  if (subErr || !sub) return { ok: false, error: "Submission not found." };
  const row = sub as Record<string, unknown>;
  if (String(row.status ?? "") !== "pending") {
    return { ok: false, error: "Submission is already reviewed." };
  }

  const baseFields: AssetUpsertFields = {
    title: String(row.title ?? "").trim(),
    creator_name: String(row.creator_name ?? "").trim(),
    software: String(row.software ?? "").trim(),
    category: String(row.category ?? "").trim(),
    layer_count: Math.trunc(Number(row.layer_count ?? 0)),
    is_sponsored: Boolean(row.is_sponsored),
    sponsor_name: String(row.sponsor_name ?? "").trim(),
    image_url: String(row.image_url ?? "").trim(),
  };
  const err = validateAssetFields(baseFields);
  if (err) return { ok: false, error: err };

  const userId = (await sb.auth.getUser()).data.user?.id ?? null;
  const { error: insertErr } = await sb.from("assets").insert({
    ...baseFields,
    creator_name: baseFields.creator_name || null,
    sponsor_name: baseFields.is_sponsored ? baseFields.sponsor_name || null : null,
    status: "ready",
    source: "community",
    submission_id: submissionId,
    uploaded_by: userId,
  });
  if (insertErr) return { ok: false, error: insertErr.message };

  const { error: updErr } = await sb
    .from("submissions")
    .update({
      status: "approved",
      reviewed_at: new Date().toISOString(),
      reviewed_by: userId,
      review_note: null,
    })
    .eq("id", submissionId);
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath("/studio/assets");
  revalidatePath("/studio");
  return { ok: true };
}

export async function rejectSubmissionAction(
  submissionId: number,
  note: string,
): Promise<{ ok: boolean; error?: string }> {
  const gate = await getAdminSupabase();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { sb } = gate;
  if (!Number.isFinite(submissionId)) return { ok: false, error: "Invalid submission." };
  const userId = (await sb.auth.getUser()).data.user?.id ?? null;
  const { error } = await sb
    .from("submissions")
    .update({
      status: "rejected",
      reviewed_at: new Date().toISOString(),
      reviewed_by: userId,
      review_note: note.trim() || null,
    })
    .eq("id", submissionId)
    .eq("status", "pending");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/studio/assets");
  revalidatePath("/studio");
  return { ok: true };
}

export async function deleteAssetAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const gate = await getAdminSupabase();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { sb } = gate;

  const { data: row } = await sb
    .from("assets")
    .select("id, status, challenge_id")
    .eq("id", id)
    .maybeSingle();
  const r = row as { status?: string; challenge_id?: string | null } | null;
  if (!r) return { ok: false, error: "Asset not found." };
  if (r.challenge_id) return { ok: false, error: "Cannot delete a published asset." };
  if (r.status === "scheduled") return { ok: false, error: "Unschedule this asset before deleting." };

  const { error } = await sb.from("assets").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/studio/assets");
  return { ok: true };
}

export async function markAssetReadyAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const gate = await getAdminSupabase();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { sb } = gate;

  const { data: row } = await sb.from("assets").select("status").eq("id", id).maybeSingle();
  const st = (row as { status?: string } | null)?.status;
  if (st !== "draft") return { ok: false, error: "Only draft assets can be marked ready." };

  const { error } = await sb
    .from("assets")
    .update({ status: "ready", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/studio/assets");
  return { ok: true };
}

export async function scheduleAssetAction(
  assetId: string,
  scheduledDate: string,
  position: number,
): Promise<{ ok: boolean; error?: string }> {
  const gate = await getAdminSupabase();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { sb } = gate;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) return { ok: false, error: "Invalid date." };
  if (!Number.isFinite(position) || position < 1 || position > 5) {
    return { ok: false, error: "Invalid position." };
  }

  const today = todayYYYYMMDDUSEastern();
  if (scheduledDate <= today) return { ok: false, error: "Pick a future date." };

  const { data: asset } = await sb.from("assets").select("*").eq("id", assetId).maybeSingle();
  const a = asset as { status?: string; id?: string } | null;
  if (!a || (a.status !== "ready" && a.status !== "scheduled")) {
    return { ok: false, error: "Only ready/scheduled assets can be assigned." };
  }

  const { data: occupant } = await sb
    .from("assets")
    .select("id")
    .eq("scheduled_date", scheduledDate)
    .eq("scheduled_position", position)
    .eq("status", "scheduled")
    .maybeSingle();
  const occ = occupant as { id?: string } | null;
  if (occ?.id && occ.id !== assetId) {
    await sb
      .from("assets")
      .update({
        scheduled_date: null,
        scheduled_position: null,
        status: "ready",
        updated_at: new Date().toISOString(),
      })
      .eq("id", occ.id);
  }

  await sb
    .from("assets")
    .update({
      scheduled_date: null,
      scheduled_position: null,
      status: "ready",
      updated_at: new Date().toISOString(),
    })
    .eq("id", assetId);

  const { error } = await sb
    .from("assets")
    .update({
      scheduled_date: scheduledDate,
      scheduled_position: position,
      status: "scheduled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", assetId);

  if (error) {
    console.error("[assets] schedule", error);
    return { ok: false, error: error.message };
  }
  revalidatePath("/studio/assets");
  return { ok: true };
}

export async function unscheduleAssetAction(assetId: string): Promise<{ ok: boolean; error?: string }> {
  const gate = await getAdminSupabase();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { sb } = gate;

  const { data: asset } = await sb
    .from("assets")
    .select("id, challenge_id, status")
    .eq("id", assetId)
    .maybeSingle();
  const row = asset as { challenge_id?: string | null; status?: string } | null;
  if (!row || row.status !== "scheduled") return { ok: false, error: "Asset is not scheduled." };

  if (row.challenge_id) {
    const { data: challenge } = await sb
      .from("challenges")
      .select("id, active_date")
      .eq("id", row.challenge_id)
      .maybeSingle();
    const ch = challenge as { id?: string; active_date?: string | null } | null;
    if (ch?.id) {
      const today = todayYYYYMMDDUSEastern();
      if (String(ch.active_date ?? "") <= today) {
        return { ok: false, error: "Cannot unschedule a live/past challenge." };
      }
      const { error: delErr } = await sb.from("challenges").delete().eq("id", ch.id);
      if (delErr) return { ok: false, error: delErr.message };
    }
  }

  const { error } = await sb
    .from("assets")
    .update({
      scheduled_date: null,
      scheduled_position: null,
      status: "ready",
      challenge_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", assetId)
    .eq("status", "scheduled");

  if (error) return { ok: false, error: error.message };
  revalidatePath("/studio/assets");
  return { ok: true };
}

/** `orderedIds` maps index i → asset id for position i+1; use empty string for an empty slot. */
export async function reorderScheduledDayAction(
  scheduledDate: string,
  orderedIds: string[],
): Promise<{ ok: boolean; error?: string }> {
  const gate = await getAdminSupabase();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { sb } = gate;

  if (orderedIds.length !== 5) return { ok: false, error: "Expected five slot entries." };

  await sb
    .from("assets")
    .update({
      scheduled_date: null,
      scheduled_position: null,
      status: "ready",
      updated_at: new Date().toISOString(),
    })
    .eq("scheduled_date", scheduledDate)
    .eq("status", "scheduled");

  for (let i = 0; i < 5; i++) {
    const id = orderedIds[i]?.trim();
    if (!id) continue;
    const { error } = await sb
      .from("assets")
      .update({
        scheduled_position: i + 1,
        scheduled_date: scheduledDate,
        status: "scheduled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/studio/assets");
  return { ok: true };
}

export async function publishScheduledDayAction(
  scheduledDate: string,
): Promise<{ ok: boolean; error?: string }> {
  const gate = await getAdminSupabase();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { sb } = gate;

  const { data: existing } = await sb.from("challenges").select("id").eq("active_date", scheduledDate).limit(1);
  if ((existing ?? []).length > 0) {
    return { ok: false, error: "Challenges already exist for that date." };
  }

  const { data: slots } = await sb
    .from("assets")
    .select("*")
    .eq("scheduled_date", scheduledDate)
    .eq("status", "scheduled")
    .order("scheduled_position", { ascending: true });

  const list = (slots as Array<Record<string, unknown>> | null) ?? [];
  if (list.length === 0) return { ok: false, error: "No assets are scheduled for this date." };

  const byPos = new Map<number, (typeof list)[number]>();
  for (const row of list) {
    const p = Number(row.scheduled_position);
    if (p >= 1 && p <= 5) byPos.set(p, row);
  }
  const dayNumber = await computeDayNumberForDate(sb, scheduledDate);

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

  for (let p = 1; p <= 5; p++) {
    if (!byPos.has(p)) continue;
    const row = byPos.get(p)!;
    if (!String(row.image_url ?? "").trim()) {
      return { ok: false, error: `Position ${p} is missing an image URL.` };
    }
    insertPayload.push({
      title: String(row.title ?? "").trim() || "Untitled",
      creator_name: row.creator_name ? String(row.creator_name) : null,
      day_number: dayNumber,
      software: String(row.software ?? "Other"),
      category: String(row.category ?? "Other"),
      layer_count: Math.trunc(Number(row.layer_count ?? 0)),
      active_date: scheduledDate,
      position: p,
      is_sponsored: Boolean(row.is_sponsored),
      sponsor_name: row.is_sponsored ? (row.sponsor_name ? String(row.sponsor_name) : null) : null,
      image_url: row.image_url ? String(row.image_url) : null,
    });
  }

  const { data: inserted, error: insErr } = await sb
    .from("challenges")
    .insert(insertPayload)
    .select("id, position");

  if (insErr || !inserted) {
    console.error("[assets] publish insert challenges", insErr);
    return { ok: false, error: insErr?.message ?? "Insert failed." };
  }

  const idByPosition = new Map<number, string>();
  for (const ch of inserted as Array<{ id: string; position: number | null }>) {
    if (typeof ch.position === "number") idByPosition.set(ch.position, ch.id);
  }

  for (let p = 1; p <= 5; p++) {
    if (!byPos.has(p)) continue;
    const assetRow = byPos.get(p)!;
    const challengeId = idByPosition.get(p);
    if (!challengeId) {
      return { ok: false, error: "Failed to link new challenges to positions." };
    }
    await sb
      .from("assets")
      .update({
        challenge_id: challengeId,
        status: "scheduled",
        published_at: null,
        scheduled_date: scheduledDate,
        scheduled_position: p,
        updated_at: new Date().toISOString(),
      })
      .eq("id", String(assetRow.id));
  }

  revalidatePath("/studio/assets");
  revalidatePath("/studio");
  return { ok: true };
}

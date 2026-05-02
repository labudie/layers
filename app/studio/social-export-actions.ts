"use server";

import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase";
import { isStudioAdminSession } from "@/lib/studio-admin";

export type ScheduledChallengeSocialExportRow = {
  title: string | null;
  creator_name: string | null;
  active_date: string;
  position: number;
  layer_count: number;
  image_url: string | null;
};

function isYmd(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function getAdminSupabase(): Promise<
  | { ok: true; sb: ReturnType<typeof createSupabaseServerClient> }
  | { ok: false; error: string }
> {
  try {
    const sb = createSupabaseServerClient(await cookies());
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return { ok: false, error: "Not signed in." };
    if (!(await isStudioAdminSession(sb, user))) return { ok: false, error: "Access denied." };
    return { ok: true, sb };
  } catch {
    return { ok: false, error: "Could not verify admin session." };
  }
}

export async function fetchScheduledChallengesForSocialExportAction(
  startDate: string,
  endDate: string,
): Promise<{ ok: boolean; error?: string; rows?: ScheduledChallengeSocialExportRow[] }> {
  const gate = await getAdminSupabase();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!isYmd(startDate) || !isYmd(endDate)) {
    return { ok: false, error: "Invalid date format." };
  }
  if (startDate > endDate) return { ok: false, error: "Start date must be before end date." };

  const { data, error } = await gate.sb
    .from("challenges")
    .select("title,creator_name,active_date,position,layer_count,image_url")
    .not("active_date", "is", null)
    .gte("active_date", startDate)
    .lte("active_date", endDate)
    .order("active_date", { ascending: true })
    .order("position", { ascending: true });

  if (error) return { ok: false, error: error.message };

  const rows = ((data ?? []) as Array<Record<string, unknown>>)
    .map((r) => {
      const active_date = String(r.active_date ?? "");
      const position = Number(r.position ?? 0);
      const layer_count = Math.max(0, Math.trunc(Number(r.layer_count ?? 0)));
      if (!active_date || position < 1 || position > 5) return null;
      return {
        title: (r.title != null ? String(r.title) : null) as string | null,
        creator_name: (r.creator_name != null ? String(r.creator_name) : null) as string | null,
        active_date,
        position,
        layer_count,
        image_url: (r.image_url != null ? String(r.image_url).trim() : null) || null,
      };
    })
    .filter(Boolean) as ScheduledChallengeSocialExportRow[];

  return { ok: true, rows };
}

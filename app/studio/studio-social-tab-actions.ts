"use server";

import { cookies } from "next/headers";
import {
  groupChallengesIntoSocialDayCards,
  type StudioSocialChallengeRowInput,
  type StudioSocialDayCard,
} from "@/lib/studio-social-tab";
import { createSupabaseServerClient } from "@/lib/supabase";
import { isStudioAdminSession } from "@/lib/studio-admin";

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

export async function fetchStudioSocialTabAction(
  startDate: string,
  endDate: string,
): Promise<{ ok: boolean; error?: string; days?: StudioSocialDayCard[] }> {
  const gate = await getAdminSupabase();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!isYmd(startDate) || !isYmd(endDate)) {
    return { ok: false, error: "Invalid date format." };
  }
  if (startDate > endDate) return { ok: false, error: "Start date must be on or before end date." };

  const { data, error } = await gate.sb
    .from("challenges")
    .select("title,layer_count,image_url,position,creator_name,active_date")
    .not("active_date", "is", null)
    .gte("active_date", startDate)
    .lte("active_date", endDate)
    .order("active_date", { ascending: true })
    .order("position", { ascending: true });

  if (error) return { ok: false, error: error.message };

  const rows = (data ?? []) as StudioSocialChallengeRowInput[];
  return {
    ok: true,
    days: groupChallengesIntoSocialDayCards(rows, startDate, endDate),
  };
}

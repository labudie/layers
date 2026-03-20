import { DailyGameClient } from "@/app/DailyGameClient";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase";

export type Challenge = {
  id: string;
  title: string | null;
  day_number: number | null;
  software: string | null;
  category: string | null;
  layer_count: number | null;
};

const US_EASTERN_TZ = "America/New_York";

/** Calendar YYYY-MM-DD in US Eastern (handles EST/EDT). */
function todayYYYYMMDDUSEastern(date: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: US_EASTERN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  if (!y || !m || !d) {
    throw new Error("Could not format date for US Eastern");
  }
  return `${y}-${m}-${d}`;
}

export default async function Home() {
  const today = todayYYYYMMDDUSEastern();

  const supabase = createSupabaseServerClient(await cookies());

  const [{ data: authData }, { data, error }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("challenges")
      .select("id, title, day_number, software, category, layer_count")
      .eq("active_date", today)
      .maybeSingle<Challenge>(),
  ]);

  const challenge = error ? null : data ?? null;
  const userEmail = authData.user?.email ?? null;
  const userId = authData.user?.id ?? null;

  return (
    <DailyGameClient
      challenge={challenge}
      today={today}
      userEmail={userEmail}
      userId={userId}
    />
  );
}
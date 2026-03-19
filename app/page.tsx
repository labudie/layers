import { DailyGameClient } from "@/app/DailyGameClient";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase";

export type Challenge = {
  title: string | null;
  day_number: number | null;
  software: string | null;
  category: string | null;
  layer_count: number | null;
};

function formatDateYYYYMMDD(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default async function Home() {
  const today = formatDateYYYYMMDD(new Date());

  const supabase = createSupabaseServerClient(await cookies());

  const [{ data: authData }, { data, error }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
    .from("challenges")
    .select("title, day_number, software, category, layer_count")
    .eq("active_date", today)
    .maybeSingle<Challenge>(),
  ]);

  const challenge = error ? null : data ?? null;
  const userEmail = authData.user?.email ?? null;

  return (
    <DailyGameClient challenge={challenge} today={today} userEmail={userEmail} />
  );
}
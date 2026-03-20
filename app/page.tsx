import { DailyGameClient } from "@/app/DailyGameClient";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase";
import { todayYYYYMMDDUSEastern } from "@/lib/today-us-eastern";

export type Challenge = {
  id: string;
  title: string | null;
  day_number: number | null;
  software: string | null;
  category: string | null;
  layer_count: number | null;
};

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
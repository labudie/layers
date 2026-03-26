import { DailyGameClient } from "@/app/DailyGameClient";
import { cookies } from "next/headers";
import {
  narrowToLatestActiveDate,
  utcActiveDateWindow,
} from "@/lib/challenge-active-date-window";
import { createSupabaseServerClient } from "@/lib/supabase";

export type Challenge = {
  id: string;
  position: number;
  title: string | null;
  day_number: number | null;
  software: string | null;
  category: string | null;
  layer_count: number | null;
  image_url: string | null;
  is_sponsored: boolean | null;
  sponsor_name: string | null;
};

type ChallengeRow = Challenge & { active_date: string | null };

/** Public page — no auth redirect. Guesses/results are saved only when signed in (client-side). */
export default async function Home() {
  const { start, end } = utcActiveDateWindow();

  const supabase = createSupabaseServerClient(await cookies());

  const [{ data: authData }, { data, error }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("challenges")
      .select(
        "id, position, title, day_number, software, category, layer_count, image_url, is_sponsored, sponsor_name, active_date"
      )
      .gte("active_date", start)
      .lte("active_date", end)
      .order("active_date", { ascending: false })
      .order("position", { ascending: true }),
  ]);

  const raw = error ? [] : ((data ?? []) as ChallengeRow[]);
  const narrowed = narrowToLatestActiveDate(raw);
  const challenges: Challenge[] = narrowed.map(
    ({ active_date: _a, ...rest }) => rest
  );
  const userEmail = authData.user?.email ?? null;
  const userId = authData.user?.id ?? null;

  return (
    <DailyGameClient
      challenges={challenges}
      userEmail={userEmail}
      userId={userId}
    />
  );
}

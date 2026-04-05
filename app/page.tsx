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
  creator_name: string | null;
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
        "id, position, title, creator_name, day_number, software, category, layer_count, image_url, is_sponsored, sponsor_name, active_date"
      )
      .gte("active_date", start)
      .lte("active_date", end)
      .order("active_date", { ascending: false })
      .order("position", { ascending: true }),
  ]);

  const raw = error ? [] : ((data ?? []) as ChallengeRow[]);
  const narrowed = narrowToLatestActiveDate(raw);
  const challenges: Challenge[] = narrowed.map((row) => {
    const { active_date: _day, ...rest } = row;
    void _day;
    return rest;
  });
  const userEmail = authData.user?.email ?? null;
  const userId = authData.user?.id ?? null;

  let profileUsername: string | null = null;
  let lastPlayedDate: string | null = null;
  let profileAvatarUrl: string | null = null;
  let profileStreak = 0;
  let profileTotalSolved = 0;
  if (userId) {
    const { data: prof } = await supabase
      .from("profiles")
      .select(
        "username, last_played_date, avatar_url, current_streak, total_solved"
      )
      .eq("id", userId)
      .maybeSingle();
    const row = prof as {
      username?: string | null;
      last_played_date?: string | null;
      avatar_url?: string | null;
      current_streak?: number | null;
      total_solved?: number | null;
    } | null;
    profileUsername = row?.username?.trim() ?? null;
    lastPlayedDate = row?.last_played_date ?? null;
    profileAvatarUrl = row?.avatar_url?.trim() ?? null;
    profileStreak = Math.max(0, Math.floor(Number(row?.current_streak) || 0));
    profileTotalSolved = Math.max(0, Math.floor(Number(row?.total_solved) || 0));
  }

  return (
    <DailyGameClient
      challenges={challenges}
      userEmail={userEmail}
      userId={userId}
      profileUsername={profileUsername}
      profileAvatarUrl={profileAvatarUrl}
      profileStreak={profileStreak}
      profileTotalSolved={profileTotalSolved}
      lastPlayedDate={lastPlayedDate}
    />
  );
}

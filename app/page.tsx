import { DailyGameClient } from "@/app/DailyGameClient";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase";
import { todayYYYYMMDDUSEastern } from "@/lib/today-us-eastern";

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

/** Public page — no auth redirect. Guesses/results are saved only when signed in (client-side). */
export default async function Home() {
  const todayEastern = todayYYYYMMDDUSEastern();

  const supabase = createSupabaseServerClient(await cookies());

  const [{ data: authData }, { data, error }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("challenges")
      .select(
        "id, position, title, creator_name, day_number, software, category, layer_count, image_url, is_sponsored, sponsor_name"
      )
      .eq("active_date", todayEastern)
      .order("position", { ascending: true }),
  ]);

  const challenges: Challenge[] = error ? [] : ((data ?? []) as Challenge[]);
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

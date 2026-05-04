import { DailyGameClient } from "@/app/DailyGameClient";
import { unstable_cache } from "next/cache";
import { cookies } from "next/headers";
import {
  createSupabasePublicServerClient,
  createSupabaseServerClient,
} from "@/lib/supabase";
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

const getDailyChallengesCached = unstable_cache(
  async (todayEastern: string) => {
    try {
      const sb = createSupabasePublicServerClient();
      const { data, error } = await sb
        .from("challenges")
        .select("*", { count: "exact" })
        .eq("active_date", todayEastern)
        .order("position", { ascending: true });
      return {
        rows: ((error ? [] : data) ?? []) as Challenge[],
        errorMsg: error?.message ?? null,
      };
    } catch (e) {
      return { rows: [] as Challenge[], errorMsg: String(e) };
    }
  },
  ["daily-challenges"],
  { revalidate: 60 },
);

/** Public page — no auth redirect. Guesses/results are saved only when signed in (client-side). */
export default async function Home() {
  const todayEastern = todayYYYYMMDDUSEastern();

  const supabase = createSupabaseServerClient(await cookies());

  let userId: string | null = null;
  let userEmail: string | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    const user = data?.user ?? null;
    userId = user?.id ?? null;
    userEmail = user?.email ?? null;
  } catch {
    userId = null;
    userEmail = null;
  }

  let challenges: Challenge[] = [];
  try {
    const pack = await getDailyChallengesCached(todayEastern);
    challenges = pack.rows;
    console.log("[home][today challenges]", {
      todayEastern,
      count: challenges.length,
      rows: challenges,
      error: pack.errorMsg,
    });
  } catch (e) {
    console.error("[home][today challenges]", e);
    challenges = [];
  }

  let profileUsername: string | null = null;
  let lastPlayedDate: string | null = null;
  let profileAvatarUrl: string | null = null;
  let profileStreak = 0;
  let profileTotalSolved = 0;
  if (userId) {
    try {
      const { data: prof } = await supabase
        .from("profiles")
        .select(
          "username, last_played_date, avatar_url, current_streak, total_solved",
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
    } catch {
      /* profile fetch must not break home */
    }
  }

  const clientMountKey = `${todayEastern}-${challenges.map((c) => c.id).join("-")}`;

  return (
    <DailyGameClient
      key={clientMountKey}
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

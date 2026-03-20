import Link from "next/link";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase";

type ResultRow = {
  user_id: string;
  challenge_id: string;
  solved: boolean | null;
  attempts_used: number | null;
  created_at: string | null;
};

type ProfileRow = {
  id: string;
  username: string | null;
};

type ChallengeRow = {
  id: string;
  title: string | null;
};

function shortUsername(userId: string) {
  const id = userId?.trim() ?? "";
  if (!id) return "—";
  return id.length <= 8 ? id : id.slice(0, 8);
}

export default async function LeaderboardPage() {
  const supabase = createSupabaseServerClient(await cookies());

  let rows: ResultRow[] = [];
  const { data, error } = await supabase
    .from("results")
    .select("user_id, challenge_id, solved, attempts_used, created_at")
    .order("attempts_used", { ascending: true })
    .order("created_at", { ascending: true });

  if (!error && data?.length) {
    rows = data as ResultRow[];
  }

  const empty = !rows.length;

  // Load usernames for the players we need (fallback to user_id prefix).
  const usernameMap = new Map<string, string | null>();
  if (rows.length) {
    const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
    const { data: profileRows, error: profilesError } = await supabase
      .from("profiles")
      .select("id, username")
      .in("id", userIds);

    if (!profilesError && profileRows?.length) {
      (profileRows as ProfileRow[]).forEach((p) => {
        usernameMap.set(p.id, p.username);
      });
    }
  }

  // Load challenge metadata for results.
  const challengeMap = new Map<string, string | null>();
  if (rows.length) {
    const challengeIds = Array.from(new Set(rows.map((r) => r.challenge_id)));
    const { data: challengeRows, error: challengesError } = await supabase
      .from("challenges")
      .select("id, title")
      .in("id", challengeIds);

    if (!challengesError && challengeRows?.length) {
      (challengeRows as ChallengeRow[]).forEach((c) => {
        challengeMap.set(c.id, c.title);
      });
    }
  }

  return (
    <div className="min-h-screen w-full bg-black text-white">
      <div className="mx-auto w-full max-w-2xl px-5 py-8">
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
          >
            ← Back
          </Link>
        </div>

        <h1 className="text-3xl font-extrabold tracking-tight">Leaderboard</h1>
        <p className="mt-2 text-sm text-white/60">
          All-time results
        </p>

        {empty ? (
          <p className="mt-10 text-center text-lg font-semibold text-white/75">
            No results yet
          </p>
        ) : (
          <div className="mt-8 overflow-hidden rounded-2xl border border-white/10">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/5 text-xs font-semibold uppercase tracking-wider text-white/50">
                  <th className="px-4 py-3">Rank</th>
                  <th className="px-4 py-3">Username</th>
                  <th className="px-4 py-3">Challenge</th>
                  <th className="px-4 py-3">Solved</th>
                  <th className="px-4 py-3">Attempts</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const username = usernameMap.get(row.user_id);
                  const display =
                    username && username.trim() ? username.trim() : shortUsername(row.user_id);

                  return (
                    <tr
                      key={`${row.user_id}-${row.created_at ?? ""}-${i}`}
                      className="border-b border-white/5 last:border-0"
                    >
                      <td className="px-4 py-3 font-mono font-semibold text-white/90">
                        {i + 1}
                      </td>
                      <td className="px-4 py-3 font-mono text-sm font-medium text-white/90">
                        {display}
                      </td>
                    <td className="px-4 py-3 text-white/80">
                      {challengeMap.get(row.challenge_id) ?? "—"}
                    </td>
                      <td className="px-4 py-3 text-white/80">
                        {row.solved === true
                          ? "Yes"
                          : row.solved === false
                            ? "No"
                            : "—"}
                      </td>
                      <td className="px-4 py-3 text-white/80">
                        {row.attempts_used ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

import Link from "next/link";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase";
import { todayYYYYMMDDUSEastern } from "@/lib/today-us-eastern";

type ResultRow = {
  user_id: string;
  solved: boolean | null;
  attempts_used: number | null;
  created_at: string | null;
};

function shortUsername(userId: string) {
  const id = userId?.trim() ?? "";
  if (!id) return "—";
  return id.length <= 8 ? id : id.slice(0, 8);
}

export default async function LeaderboardPage() {
  const today = todayYYYYMMDDUSEastern();
  const supabase = createSupabaseServerClient(await cookies());

  const { data: chRows, error: challengeError } = await supabase
    .from("challenges")
    .select("id")
    .eq("active_date", today)
    .order("position", { ascending: true })
    .limit(1);

  const challengeId =
    challengeError || !chRows?.length ? null : chRows[0]?.id ?? null;

  let rows: ResultRow[] = [];

  if (challengeId) {
    const { data, error } = await supabase
      .from("results")
      .select("user_id, solved, attempts_used, created_at")
      .eq("challenge_id", challengeId)
      .order("attempts_used", { ascending: true })
      .order("created_at", { ascending: true });

    if (!error && data?.length) {
      rows = data as ResultRow[];
    }
  }

  const hasChallenge = Boolean(challengeId);
  const empty = !rows.length;

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
          Today&apos;s challenge{hasChallenge ? "" : " (no active challenge)"}
        </p>

        {!hasChallenge ? (
          <p className="mt-10 text-center text-lg font-semibold text-white/75">
            No challenge today
          </p>
        ) : empty ? (
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
                  <th className="px-4 py-3">Solved</th>
                  <th className="px-4 py-3">Attempts</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={`${row.user_id}-${row.created_at ?? ""}-${i}`}
                    className="border-b border-white/5 last:border-0"
                  >
                    <td className="px-4 py-3 font-mono font-semibold text-white/90">
                      {i + 1}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm font-medium text-white/90">
                      {shortUsername(row.user_id)}
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

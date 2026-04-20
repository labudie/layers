import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppSiteChrome } from "@/app/components/AppSiteChrome";
import { todayYYYYMMDDUSEastern } from "@/lib/today-us-eastern";
import { createSupabaseServerClient } from "@/lib/supabase";
import {
  AssetLibraryClient,
  type AssetRow,
  type PublishedExtra,
} from "@/app/studio/assets/AssetLibraryClient";

const ADMIN_EMAIL = "rjlabudie@gmail.com".toLowerCase();

async function assertAdminOrNull() {
  const sb = createSupabaseServerClient(await cookies());
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return false;

  let email = (user.email ?? "").trim().toLowerCase();
  if (!email && typeof user.user_metadata?.email === "string") {
    email = user.user_metadata.email.trim().toLowerCase();
  }
  if (!email && Array.isArray(user.identities)) {
    for (const ident of user.identities as Array<{
      identity_data?: { email?: string };
    }>) {
      const ie = ident?.identity_data?.email;
      if (typeof ie === "string" && ie.trim()) {
        email = ie.trim().toLowerCase();
        break;
      }
    }
  }
  if (!email && user.id) {
    const { data: prof } = await sb.from("profiles").select("email").eq("id", user.id).maybeSingle();
    const pe = (prof as { email?: string | null } | null)?.email;
    if (typeof pe === "string" && pe.trim()) email = pe.trim().toLowerCase();
  }

  return email === ADMIN_EMAIL;
}

async function loadPublishedExtras(
  sb: ReturnType<typeof createSupabaseServerClient>,
  assets: AssetRow[],
): Promise<PublishedExtra[]> {
  const withChallenge = assets.filter((a) => a.challenge_id);
  const cids = [...new Set(withChallenge.map((a) => a.challenge_id!))];
  if (cids.length === 0) return [];

  const { data: chRows, error: chErr } = await sb
    .from("challenges")
    .select("id, active_date, position")
    .in("id", cids);
  if (chErr || !chRows) {
    console.error("[assets page] challenges", chErr);
    return [];
  }

  const chById = new Map(
    (chRows as Array<{ id: string; active_date: string | null; position: number | null }>).map((c) => [
      c.id,
      c,
    ]),
  );

  const { data: guessRows, error: gErr } = await sb
    .from("guesses")
    .select("challenge_id, user_id, is_correct")
    .in("challenge_id", cids);
  if (gErr) console.error("[assets page] guesses", gErr);

  type Agg = { total: number; users: Set<string>; solvers: Set<string> };
  const aggBy = new Map<string, Agg>();
  for (const g of (guessRows ?? []) as Array<{
    challenge_id: string;
    user_id: string | null;
    is_correct: boolean | null;
  }>) {
    const cid = g.challenge_id;
    if (!cid) continue;
    let m = aggBy.get(cid);
    if (!m) {
      m = { total: 0, users: new Set(), solvers: new Set() };
      aggBy.set(cid, m);
    }
    m.total += 1;
    if (g.user_id) m.users.add(g.user_id);
    if (g.is_correct && g.user_id) m.solvers.add(g.user_id);
  }

  const dlBy = new Map<string, number>();
  const chunkSize = 400;
  for (let i = 0; i < cids.length; i += chunkSize) {
    const chunk = cids.slice(i, i + chunkSize);
    const { data: dlChunk, error: dlErr } = await sb.rpc("get_download_counts_for_challenges", {
      p_challenge_ids: chunk,
    });
    if (dlErr) {
      console.error("[assets page] downloads rpc", dlErr);
      continue;
    }
    for (const r of (dlChunk ?? []) as Array<{
      challenge_id: string;
      download_count: number | string;
    }>) {
      dlBy.set(r.challenge_id, Number(r.download_count) || 0);
    }
  }

  const out: PublishedExtra[] = [];
  for (const a of withChallenge) {
    const cid = a.challenge_id!;
    const ch = chById.get(cid);
    if (!ch?.active_date) continue;
    const g = aggBy.get(cid);
    const uniquePlayers = g?.users.size ?? 0;
    const solvers = g?.solvers.size ?? 0;
    const solveRatePct = uniquePlayers > 0 ? (solvers / uniquePlayers) * 100 : 0;
    out.push({
      asset_id: a.id,
      challenge_id: cid,
      active_date: ch.active_date,
      position: ch.position ?? 0,
      total_guesses: g?.total ?? 0,
      unique_players: uniquePlayers,
      solve_rate_pct: solveRatePct,
      downloads: dlBy.get(cid) ?? 0,
    });
  }
  return out;
}

export default async function StudioAssetsPage() {
  const isAdmin = await assertAdminOrNull();
  if (!isAdmin) redirect("/");

  const sb = createSupabaseServerClient(await cookies());
  const { data: assetRows, error: aErr } = await sb
    .from("assets")
    .select("*")
    .order("created_at", { ascending: false });

  if (aErr) {
    console.error("[assets page] assets fetch", aErr);
  }

  const assets = (assetRows ?? []) as AssetRow[];
  const publishedExtras = await loadPublishedExtras(sb, assets);
  const todayYmd = todayYYYYMMDDUSEastern();

  return (
    <AppSiteChrome
      title={
        <Link href="/" className="tap-press text-white transition hover:text-violet-200">
          Layers
        </Link>
      }
      className="bg-[#0f0520]"
      right={
        <span className="rounded-full border border-[var(--accent)]/35 bg-[var(--accent)]/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white">
          Asset Library
        </span>
      }
    >
      <AssetLibraryClient initialAssets={assets} publishedExtras={publishedExtras} todayYmd={todayYmd} />
    </AppSiteChrome>
  );
}

import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppSiteChrome } from "@/app/components/AppSiteChrome";
import { createSupabaseServerClient } from "@/lib/supabase";
import { isStudioAdminSession } from "@/lib/studio-admin";
import {
  AssetLibraryClient,
  type AssetRow,
  type PendingSubmissionRow,
} from "@/app/studio/assets/AssetLibraryClient";

async function assertAdminOrNull() {
  try {
    const sb = createSupabaseServerClient(await cookies());
    const {
      data: { user },
    } = await sb.auth.getUser();
    return await isStudioAdminSession(sb, user);
  } catch {
    return false;
  }
}

export default async function StudioAssetsPage() {
  const isAdmin = await assertAdminOrNull();
  if (!isAdmin) redirect("/");

  const sb = createSupabaseServerClient(await cookies());
  const {
    data: { user },
  } = await sb.auth.getUser();
  const adminUserId = user?.id ?? "";
  const { data: assetRows, error: aErr } = await sb
    .from("assets")
    .select("*")
    .order("created_at", { ascending: false });

  if (aErr) {
    console.error("[assets page] assets fetch", aErr);
  }

  const assets = (assetRows ?? []) as AssetRow[];
  const { data: publishedChallengeRows, error: publishedErr } = await sb
    .from("challenges")
    .select("id, active_date, position")
    .order("active_date", { ascending: true });
  if (publishedErr) {
    console.error("[assets page] published challenges fetch", publishedErr);
  }
  const liveCountsByDate: Record<string, number> = {};
  const liveChallengeIdByDatePosition: Record<string, Record<number, string>> = {};
  for (const row of (publishedChallengeRows ?? []) as Array<{
    id: string;
    active_date: string | null;
    position: number | null;
  }>) {
    const date = row.active_date ?? "";
    const pos = row.position ?? 0;
    if (!date || pos < 1 || pos > 5) continue;
    liveCountsByDate[date] = (liveCountsByDate[date] ?? 0) + 1;
    if (!liveChallengeIdByDatePosition[date]) {
      liveChallengeIdByDatePosition[date] = {};
    }
    liveChallengeIdByDatePosition[date][pos] = row.id;
  }
  const { data: pendingRows, error: pErr } = await sb
    .from("submissions")
    .select(
      "id,user_id,title,creator_name,software,category,layer_count,image_url,is_sponsored,sponsor_name,status,created_at"
    )
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (pErr) console.error("[assets page] pending submissions fetch", pErr);
  const pending = (pendingRows ?? []) as Array<Record<string, unknown>>;

  const userIds = [...new Set(pending.map((r) => String(r.user_id ?? "")).filter(Boolean))];
  const usernamesById = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profileRows } = await sb.from("profiles").select("id, username").in("id", userIds);
    for (const p of (profileRows ?? []) as Array<{ id: string; username: string | null }>) {
      usernamesById.set(p.id, p.username ?? "");
    }
  }

  const pendingSubmissions: PendingSubmissionRow[] = pending.map((r) => ({
    id: Number(r.id),
    user_id: String(r.user_id),
    username: usernamesById.get(String(r.user_id)) ?? null,
    title: String(r.title ?? ""),
    creator_name: String(r.creator_name ?? ""),
    software: String(r.software ?? "Other"),
    category: String(r.category ?? "Other"),
    layer_count: Number(r.layer_count ?? 0),
    image_url: String(r.image_url ?? ""),
    is_sponsored: Boolean(r.is_sponsored),
    sponsor_name: String(r.sponsor_name ?? ""),
    created_at: String(r.created_at ?? ""),
  }));

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
      {/* Re-configure, Go Live All, Unschedule All, and month stats are in AssetLibraryClient (calendar column). */}
      <AssetLibraryClient
        initialAssets={assets}
        pendingSubmissions={pendingSubmissions}
        adminUserId={adminUserId}
        liveCountsByDate={liveCountsByDate}
        liveChallengeIdByDatePosition={liveChallengeIdByDatePosition}
      />
    </AppSiteChrome>
  );
}

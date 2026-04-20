import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppSiteChrome } from "@/app/components/AppSiteChrome";
import { createSupabaseServerClient } from "@/lib/supabase";
import {
  AssetLibraryClient,
  type AssetRow,
  type PendingSubmissionRow,
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
      <AssetLibraryClient
        initialAssets={assets}
        pendingSubmissions={pendingSubmissions}
        adminUserId={adminUserId}
      />
    </AppSiteChrome>
  );
}

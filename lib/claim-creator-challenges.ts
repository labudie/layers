import type { SupabaseClient } from "@supabase/supabase-js";

/** Link challenges whose creator_name matches this username (with or without @). Runs silently on failure. */
export async function claimUnlinkedCreatorChallenges(
  sb: SupabaseClient,
  userId: string,
  username: string,
): Promise<void> {
  const handle = username.toLowerCase().trim();
  if (!handle || !userId) return;

  try {
    const { data: unclaimedWork } = await sb
      .from("challenges")
      .select("id")
      .in("creator_name", [handle, `@${handle}`])
      .is("creator_user_id", null);

    if (!unclaimedWork?.length) return;

    const ids = unclaimedWork.map((c: { id: string }) => c.id);
    await sb.from("challenges").update({ creator_user_id: userId }).in("id", ids);
  } catch {
    /* silent — onboarding / auth should not surface claim failures */
  }
}

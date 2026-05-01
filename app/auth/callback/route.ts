import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { claimUnlinkedCreatorChallenges } from "@/lib/claim-creator-challenges";
import { createSupabaseServerClient } from "@/lib/supabase";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/`);
  }

  try {
    const supabase = createSupabaseServerClient(await cookies());
    await supabase.auth.exchangeCodeForSession(code);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("username, avatar_url")
        .eq("id", user.id)
        .maybeSingle();

      const existingProfile = profile as {
        username?: string | null;
        avatar_url?: string | null;
      } | null;
      const existingUsername =
        (existingProfile?.username ?? "").trim();

      if (!existingProfile) {
        await supabase.from("profiles").insert({
          id: user.id,
          email: user.email ?? null,
        });
      } else {
        await supabase
          .from("profiles")
          .update({ email: user.email ?? null })
          .eq("id", user.id);
      }

      const meta = user.user_metadata as
        | { avatar_url?: string | null; picture?: string | null }
        | undefined;
      const googleAvatar = meta?.avatar_url ?? meta?.picture ?? null;
      if (googleAvatar) {
        await supabase
          .from("profiles")
          .update({ avatar_url: googleAvatar })
          .eq("id", user.id)
          .is("avatar_url", null);
      }

      if (existingUsername.length > 0) {
        await claimUnlinkedCreatorChallenges(supabase, user.id, existingUsername);
        return NextResponse.redirect(`${origin}/`);
      }

      return NextResponse.redirect(`${origin}/onboarding`);
    }
  } catch (e) {
    console.error("[auth/callback]", e);
    return NextResponse.redirect(`${origin}/`);
  }

  return NextResponse.redirect(`${origin}/`);
}


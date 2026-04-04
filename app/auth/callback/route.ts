import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase";
import { needsUsernameOnboarding } from "@/lib/profile-onboarding";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/`);
  }

  const supabase = createSupabaseServerClient(await cookies());
  await supabase.auth.exchangeCodeForSession(code);

  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (user) {
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (!existing) {
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

    const { data: prof } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle();
    const username = (prof as { username?: string | null } | null)?.username;
    if (needsUsernameOnboarding(username)) {
      return NextResponse.redirect(`${origin}/onboarding`);
    }
  }

  return NextResponse.redirect(`${origin}/`);
}


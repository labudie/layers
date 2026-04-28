import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase";

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
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle();

    const existingUsername =
      (existingProfile as { username?: string | null } | null)?.username?.trim() ??
      "";

    if (existingUsername.length > 0) {
      return NextResponse.redirect(`${origin}/`);
    }

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
    return NextResponse.redirect(`${origin}/onboarding`);
  }

  return NextResponse.redirect(`${origin}/`);
}


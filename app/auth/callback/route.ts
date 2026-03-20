import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = createSupabaseServerClient(await cookies());
    await supabase.auth.exchangeCodeForSession(code);

    // Create a profile on first sign-in so the leaderboard has a display name.
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (user) {
      const defaultUsername = `player_${user.id.slice(0, 6)}`;
      try {
        await supabase.from("profiles").upsert({
          id: user.id,
          username: defaultUsername,
        });
      } catch {
        // Ignore; profile might already exist or RLS may block.
      }
    }
  }

  return NextResponse.redirect(`${origin}/`);
}


import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { ADMIN_EMAILS } from "./lib/config";

async function resolveStudioAdminEmailForProxy(
  sb: SupabaseClient,
  user: User | null,
): Promise<string | null> {
  if (!user) return null;

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
    try {
      const { data: prof } = await sb.from("profiles").select("email").eq("id", user.id).maybeSingle();
      const pe = (prof as { email?: string | null } | null)?.email;
      if (typeof pe === "string" && pe.trim()) email = pe.trim().toLowerCase();
    } catch {
      /* ignore */
    }
  }

  return email.length ? email : null;
}

async function isStudioAdminForProxy(sb: SupabaseClient, user: User | null): Promise<boolean> {
  const email = await resolveStudioAdminEmailForProxy(sb, user);
  return email !== null && ADMIN_EMAILS.includes(email);
}

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If env vars aren't available at proxy build/runtime, avoid crashing.
  if (!supabaseUrl || !supabaseAnonKey) return response;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        response.cookies.set({ name, value: "", ...options });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (request.nextUrl.pathname.startsWith("/studio")) {
    const allowed = await isStudioAdminForProxy(supabase, user);
    if (!allowed) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|json)$).*)",
  ],
};


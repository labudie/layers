import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

export const STUDIO_ADMIN_EMAIL = "rjlabudie@gmail.com".toLowerCase();

/**
 * Same resolution order as studio pages (JWT email gaps on some OAuth layouts).
 */
export async function resolveSessionAdminEmail(
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
      /* profiles lookup is best-effort when JWT omits email */
    }
  }

  return email.length ? email : null;
}

export async function isStudioAdminSession(
  sb: SupabaseClient,
  user: User | null,
): Promise<boolean> {
  const email = await resolveSessionAdminEmail(sb, user);
  return email === STUDIO_ADMIN_EMAIL;
}

import { createBrowserClient, createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

let browserSingleton: ReturnType<typeof createBrowserClient> | null = null;

/** Browser Supabase client for Client Components (singleton in the browser). */
export function supabase() {
  if (typeof window !== "undefined") {
    browserSingleton ??= createBrowserClient(supabaseUrl, supabaseAnonKey);
    return browserSingleton;
  }
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

export function createSupabaseBrowserClient() {
  return supabase();
}

/**
 * Same shape as Next.js `cookies()` — use `getAll` + `set` so @supabase/ssr can
 * read every auth cookie chunk. The deprecated get/set/remove adapter only probes
 * `.0`–`.4` chunks and silently drops larger sessions (anonymous on the server).
 */
export type SupabaseServerCookieStore = {
  getAll(): Array<{ name: string; value: string }>;
  set(name: string, value: string, options: CookieOptions): void;
};

export function createSupabaseServerClient(cookieStore: SupabaseServerCookieStore) {
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components: cookies may be read-only; middleware refreshes session.
        }
      },
    },
  });
}

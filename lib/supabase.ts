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

type CookieStore = {
  get(name: string): { value: string } | undefined;
  set(opts: { name: string; value: string } & CookieOptions): void;
};

export function createSupabaseServerClient(cookieStore: CookieStore) {
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        cookieStore.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        cookieStore.set({ name, value: "", ...options });
      },
    },
  });
}

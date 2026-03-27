"use client";

import { useEffect, useState } from "react";
import type { PostHog } from "posthog-js";
import { PostHogProvider } from "posthog-js/react";

export function PHProvider({ children }: { children: React.ReactNode }) {
  const [client, setClient] = useState<PostHog | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    console.log(
      "PostHog key:",
      process.env.NEXT_PUBLIC_POSTHOG_KEY ? "found" : "missing"
    );
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;

    let cancelled = false;
    void import("posthog-js").then(({ default: posthog }) => {
      if (cancelled) return;
      posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
        api_host: "https://us.i.posthog.com",
        person_profiles: "identified_only",
        capture_pageview: false,
      });
      setClient(posthog);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!client) return <>{children}</>;
  return <PostHogProvider client={client}>{children}</PostHogProvider>;
}

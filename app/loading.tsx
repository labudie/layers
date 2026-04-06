import { RouteLoadingFallback } from "@/app/components/RouteLoadingFallback";

/** Shown while the root segment is loading (Next.js App Router). */
export default function Loading() {
  return <RouteLoadingFallback />;
}

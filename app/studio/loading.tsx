import { AppSiteChrome } from "@/app/components/AppSiteChrome";
import { RouteLoadingFallback } from "@/app/components/RouteLoadingFallback";

export default function StudioLoading() {
  return (
    <AppSiteChrome
      title="Layers"
      className="bg-[#0f0520]"
      right={
        <span className="rounded-full border border-[var(--accent)]/35 bg-[var(--accent)]/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white">
          Admin
        </span>
      }
    >
      <RouteLoadingFallback label="Loading studio…" />
    </AppSiteChrome>
  );
}

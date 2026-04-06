import { AppSiteChrome } from "@/app/components/AppSiteChrome";
import { RouteLoadingFallback } from "@/app/components/RouteLoadingFallback";

export default function BadgesLoading() {
  return (
    <AppSiteChrome title="Badges">
      <RouteLoadingFallback label="Loading badges…" />
    </AppSiteChrome>
  );
}

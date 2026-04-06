import { AppSiteChrome } from "@/app/components/AppSiteChrome";
import { RouteLoadingFallback } from "@/app/components/RouteLoadingFallback";

export default function LeaderboardLoading() {
  return (
    <AppSiteChrome title="Leaderboard">
      <RouteLoadingFallback label="Loading leaderboard…" />
    </AppSiteChrome>
  );
}

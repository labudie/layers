import { AppSiteChrome } from "@/app/components/AppSiteChrome";
import { RouteLoadingFallback } from "@/app/components/RouteLoadingFallback";

export default function ProfileLoading() {
  return (
    <AppSiteChrome title="Profile">
      <RouteLoadingFallback label="Loading profile…" />
    </AppSiteChrome>
  );
}

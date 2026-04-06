/** Shared skeleton for App Router `loading.tsx` segments. */
export function RouteLoadingFallback({ label }: { label?: string }) {
  return (
    <div className="flex min-h-[50dvh] flex-1 flex-col items-center justify-center gap-4 bg-[var(--background)] px-4">
      <div className="h-10 w-10 animate-pulse rounded-full bg-[var(--accent)]/35" />
      <div className="flex flex-col items-center gap-2">
        <div className="h-3 w-36 animate-pulse rounded-md bg-white/15" />
        <div className="h-3 w-24 animate-pulse rounded-md bg-white/10" />
      </div>
      {label ? (
        <p className="text-xs font-medium text-white/40">{label}</p>
      ) : null}
    </div>
  );
}

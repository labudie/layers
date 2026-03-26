export default function Loading() {
  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-[var(--background)] text-[var(--text)]">
      <header className="flex shrink-0 items-center justify-between px-4 pt-4 md:px-5">
        <div className="h-6 w-[90px] rounded-md skeleton" aria-hidden />
        <div className="h-10 w-10 rounded-xl skeleton" aria-hidden />
      </header>

      <div className="flex shrink-0 items-center justify-center px-4 pt-2 md:px-5">
        <div className="h-10 w-[240px] rounded-full skeleton" aria-hidden />
      </div>

      <div className="mt-[12px] flex min-h-0 flex-1 flex-col gap-3 pb-2">
        <div className="relative mx-[calc(50%-50vw)] w-[100vw]">
          <div className="relative aspect-[4/5] w-full overflow-hidden">
            <div className="absolute inset-0 rounded-none bg-[var(--surface)] skeleton" aria-hidden />
          </div>
        </div>

        <div className="flex items-start justify-between gap-3 px-1">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="h-5 w-[180px] rounded-md skeleton" aria-hidden />
            <div className="h-4 w-[90px] rounded-md skeleton" aria-hidden />
          </div>
          <div className="h-9 w-9 rounded-full skeleton" aria-hidden />
        </div>

        <div className="flex flex-col gap-3 px-1">
          <div className="flex items-center gap-2" aria-hidden>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-9 w-9 rounded-full skeleton" />
            ))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <div className="h-11 w-full rounded-full skeleton" aria-hidden />
            <div className="h-11 w-[120px] rounded-full skeleton" aria-hidden />
          </div>
        </div>
      </div>
    </div>
  );
}


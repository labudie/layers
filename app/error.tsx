"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[AppError]", error);
  }, [error]);

  return (
    <div className="flex min-h-[min(70dvh,32rem)] flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div className="text-4xl" aria-hidden>
        ✦
      </div>
      <div>
        <h1 className="text-lg font-bold text-white">Something went wrong</h1>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/55">
          Layers hit a snag. You can try again — if it keeps happening, check
          your connection and come back in a moment.
        </p>
      </div>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-[var(--radius-pill)] bg-[var(--accent)] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-violet-900/30 transition hover:brightness-110 active:brightness-95"
      >
        Try again
      </button>
    </div>
  );
}

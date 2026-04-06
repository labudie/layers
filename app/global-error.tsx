"use client";

import { useEffect } from "react";
import "./globals.css";

/**
 * Catches errors in the root layout. Must define its own <html> / <body>.
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/error#global-error
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col items-center justify-center overflow-x-hidden bg-[#0f0520] px-6 py-12 text-center text-[#f8f4ff] antialiased">
        <div className="text-4xl" aria-hidden>
          ✦
        </div>
        <h1 className="mt-6 text-lg font-bold text-white">Something went wrong</h1>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/55">
          Layers couldn&apos;t load this screen. Try again, or refresh the page.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-8 rounded-full bg-[#7c3aed] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-violet-900/30"
        >
          Try again
        </button>
      </body>
    </html>
  );
}

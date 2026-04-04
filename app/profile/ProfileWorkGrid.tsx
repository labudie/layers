"use client";

import { useCallback, useEffect, useState } from "react";

export type WorkItem = {
  id: number;
  title: string | null;
  software: string | null;
  image_url: string;
  download_count: number;
};

export function ProfileWorkGrid({ items }: { items: WorkItem[] }) {
  const [openUrl, setOpenUrl] = useState<string | null>(null);

  const onKey = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") setOpenUrl(null);
  }, []);

  useEffect(() => {
    if (!openUrl) return;
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openUrl, onKey]);

  if (!items.length) return null;

  return (
    <>
      <div className="mt-6">
        <div className="text-sm font-bold uppercase tracking-wider text-white/50">
          Work
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setOpenUrl(item.image_url)}
              className="group overflow-hidden rounded-2xl border border-white/10 bg-black/25 text-left transition hover:border-[var(--accent)]/40"
            >
              <div className="relative aspect-[4/3] w-full bg-black/40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.image_url}
                  alt={item.title ?? "Work"}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="p-2.5">
                <div className="line-clamp-2 text-xs font-semibold text-white">
                  {item.title ?? "Untitled"}
                </div>
                <div className="mt-0.5 text-[11px] text-white/55">
                  {item.software ?? "—"}
                </div>
                <div className="mt-1 text-[11px] font-medium text-white/45">
                  {item.download_count} download
                  {item.download_count === 1 ? "" : "s"}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {openUrl ? (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Image"
          onClick={() => setOpenUrl(null)}
        >
          <button
            type="button"
            aria-label="Close"
            className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/70 text-2xl leading-none text-white hover:bg-white/10"
            onClick={(e) => {
              e.stopPropagation();
              setOpenUrl(null);
            }}
          >
            ×
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={openUrl}
            alt=""
            className="max-h-full max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </>
  );
}

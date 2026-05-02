"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchStudioSocialTabAction } from "@/app/studio/studio-social-tab-actions";
import type { StudioSocialDayCard } from "@/lib/studio-social-tab";

function formatSocialDayHeader(dateYmd: string) {
  const parsed = new Date(`${dateYmd}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateYmd;
  return parsed.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function captionsFromExpert(slots: StudioSocialDayCard["slots"]) {
  const expert = slots[4];
  const title = expert?.title?.trim() || "[Expert challenge]";
  const layer_count = expert?.layer_count ?? 0;
  const xCaption = `${layer_count} layers. ${title}. Play today's 5 challenges free → layersgame.com`;
  const instagramCaption =
    `Today's expert challenge: ${title} — built with ${layer_count} layers in Photoshop. Can you guess it in 3 tries?\n\n` +
    `Play free at layersgame.com (link in bio)\n\n` +
    `#graphicdesign #photoshop #designchallenge #layersgame`;
  const tiktokCaption = `${layer_count} layers in a ${title}. Come guess today's expert challenge on Layers — free daily game for designers. layersgame.com`;
  return { xCaption, instagramCaption, tiktokCaption };
}

function SocialLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKey]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/92 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Challenge image"
      onClick={onClose}
    >
      <button
        type="button"
        aria-label="Close"
        className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/70 text-2xl leading-none text-white hover:bg-white/10"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        ×
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="max-h-[90vh] max-w-full object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

function CopyCaptionButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="shrink-0 rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/15"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function CarouselStrip({
  slots,
  onOpen,
}: {
  slots: StudioSocialDayCard["slots"];
  onOpen: (src: string, alt: string) => void;
}) {
  return (
    <div className="mt-3 flex justify-center gap-1.5">
      {slots.map((slot, idx) => {
        const pos = idx + 1;
        const url = slot?.image_url;
        const title = slot?.title?.trim() || `Challenge ${pos}`;
        return (
          <button
            key={pos}
            type="button"
            disabled={!url}
            onClick={() => url && onOpen(url, title)}
            className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-white/15 bg-black/30 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[10px] text-white/35">
                —
              </div>
            )}
            <span className="absolute left-0.5 top-0.5 rounded bg-black/75 px-1 py-px text-[10px] font-bold leading-none text-white">
              {pos}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function StudioSocialTabClient({
  initialStartYmd,
  initialEndYmd,
  initialDays,
}: {
  initialStartYmd: string;
  initialEndYmd: string;
  initialDays: StudioSocialDayCard[];
}) {
  const [startYmd, setStartYmd] = useState(initialStartYmd);
  const [endYmd, setEndYmd] = useState(initialEndYmd);
  const [days, setDays] = useState(initialDays);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);

  const loadRange = useCallback(async (start: string, end: string) => {
    setLoading(true);
    setError(null);
    const res = await fetchStudioSocialTabAction(start, end);
    setLoading(false);
    if (!res.ok || !res.days) {
      setError(res.error ?? "Could not load challenges.");
      return;
    }
    setDays(res.days);
  }, []);

  async function applyRange() {
    if (!startYmd || !endYmd || startYmd > endYmd) {
      setError("Choose a valid date range.");
      return;
    }
    await loadRange(startYmd, endYmd);
  }

  return (
    <>
      <div className="mb-6 rounded-2xl border border-white/10 bg-[rgba(26,10,46,0.65)] p-5">
        <div className="text-lg font-extrabold text-white">Social</div>
        <p className="mt-1 text-sm text-white/55">
          Day-by-day scheduled challenges and caption drafts (US Eastern dates). Read-only — nothing is posted automatically.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-semibold text-white/70">
            Start
            <input
              type="date"
              value={startYmd}
              onChange={(e) => setStartYmd(e.target.value)}
              className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-white/70">
            End
            <input
              type="date"
              value={endYmd}
              onChange={(e) => setEndYmd(e.target.value)}
              className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
          <button
            type="button"
            disabled={loading}
            onClick={() => void applyRange()}
            className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-bold text-white hover:opacity-95 disabled:opacity-50"
          >
            {loading ? "Loading…" : "Apply range"}
          </button>
        </div>
        {error ? <div className="mt-3 text-sm font-semibold text-amber-200">{error}</div> : null}
      </div>

      <div className="space-y-6">
        {days.map((day) => {
          const { xCaption, instagramCaption, tiktokCaption } = captionsFromExpert(day.slots);
          return (
            <div
              key={day.dateYmd}
              className="rounded-2xl border border-white/10 bg-[rgba(26,10,46,0.65)] p-5"
            >
              <div className="text-base font-extrabold text-white">{formatSocialDayHeader(day.dateYmd)}</div>
              <div className="mt-4 flex gap-3 overflow-x-auto pb-1 pt-1">
                {day.slots.map((slot, idx) => {
                  const pos = idx + 1;
                  const url = slot?.image_url;
                  const title = slot?.title?.trim() || `Position ${pos}`;
                  const layers = slot?.layer_count ?? null;
                  return (
                    <div key={pos} className="w-[112px] shrink-0">
                      <button
                        type="button"
                        disabled={!url}
                        onClick={() => url && setLightbox({ src: url, alt: title })}
                        className="relative aspect-square w-full overflow-hidden rounded-xl border border-white/10 bg-black/35 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {url ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs text-white/35">
                            Empty
                          </div>
                        )}
                        {layers != null ? (
                          <span className="absolute right-1 top-1 rounded-full bg-black/75 px-2 py-0.5 text-[10px] font-bold tabular-nums text-white">
                            {layers}L
                          </span>
                        ) : null}
                      </button>
                      <div className="mt-1.5 line-clamp-3 text-center text-[11px] font-semibold leading-snug text-white/85">
                        {title}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-black/25 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-extrabold text-white">𝕏</div>
                    <CopyCaptionButton text={xCaption} />
                  </div>
                  <textarea
                    readOnly
                    value={xCaption}
                    rows={4}
                    className="mt-3 w-full resize-y rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm leading-relaxed text-white/90"
                  />
                </div>

                <div className="rounded-xl border border-white/10 bg-black/25 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-extrabold text-white">Instagram</div>
                    <CopyCaptionButton text={instagramCaption} />
                  </div>
                  <textarea
                    readOnly
                    value={instagramCaption}
                    rows={8}
                    className="mt-3 w-full resize-y rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm leading-relaxed text-white/90"
                  />
                  <CarouselStrip slots={day.slots} onOpen={(src, alt) => setLightbox({ src, alt })} />
                </div>

                <div className="rounded-xl border border-white/10 bg-black/25 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-extrabold text-white">TikTok</div>
                    <CopyCaptionButton text={tiktokCaption} />
                  </div>
                  <textarea
                    readOnly
                    value={tiktokCaption}
                    rows={6}
                    className="mt-3 w-full resize-y rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm leading-relaxed text-white/90"
                  />
                  <CarouselStrip slots={day.slots} onOpen={(src, alt) => setLightbox({ src, alt })} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {lightbox ? (
        <SocialLightbox src={lightbox.src} alt={lightbox.alt} onClose={() => setLightbox(null)} />
      ) : null}
    </>
  );
}

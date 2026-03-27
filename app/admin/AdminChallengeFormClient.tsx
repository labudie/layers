"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type PublishBatchResult = {
  error: string | null;
  publishedCount?: number;
  publishedTitles?: string[];
};

const SOFTWARE_OPTIONS = [
  "Photoshop",
  "Illustrator",
  "Figma",
  "After Effects",
  "Cinema 4D",
  "Other",
] as const;

const CATEGORY_OPTIONS = [
  "Branding",
  "UI Design",
  "Print",
  "Marketing",
  "Motion",
  "3D",
  "Other",
] as const;

type UploadCard = {
  id: string;
  file: File;
  previewUrl: string;
  title: string;
  creator_name: string;
  software: (typeof SOFTWARE_OPTIONS)[number];
  category: (typeof CATEGORY_OPTIONS)[number];
  layer_count: string;
  is_sponsored: boolean;
  sponsor_name: string;
};

export function AdminChallengeFormClient({
  today,
  action,
}: {
  today: string;
  action: (formData: FormData) => Promise<PublishBatchResult>;
}) {
  const [cards, setCards] = useState<UploadCard[]>([]);
  const [activeDate, setActiveDate] = useState(today);
  const [dayNumber, setDayNumber] = useState("");
  const [dayNumberAuto, setDayNumberAuto] = useState("");
  const [dayNumberManual, setDayNumberManual] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progressStep, setProgressStep] = useState(0);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [successSummary, setSuccessSummary] = useState<string[] | null>(null);
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sb = supabase();
      const { data: maxRow } = await sb
        .from("challenges")
        .select("day_number")
        .order("day_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;

      const maxDay = (maxRow as { day_number?: number | null } | null)?.day_number;
      const suggested = typeof maxDay === "number" ? maxDay + 1 : 1;

      const next = String(suggested);
      setDayNumberAuto(next);
      if (!dayNumberManual) {
        setDayNumber(next);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeDate, dayNumberManual]);

  useEffect(() => {
    return () => {
      cards.forEach((c) => URL.revokeObjectURL(c.previewUrl));
    };
  }, [cards]);

  function openPicker() {
    fileInputRef.current?.click();
  }

  function normalizeFiles(files: File[]) {
    const imageFiles = files.filter((f) =>
      ["image/png", "image/jpeg"].includes(f.type)
    );
    const availableSlots = Math.max(0, 5 - cards.length);
    const picked = imageFiles.slice(0, availableSlots);
    if (picked.length === 0) return;

    const nextCards = picked.map((file, idx) => ({
      id: `${Date.now()}-${idx}-${Math.random().toString(16).slice(2)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      title: "",
      creator_name: "",
      software: SOFTWARE_OPTIONS[0],
      category: CATEGORY_OPTIONS[0],
      layer_count: "",
      is_sponsored: false,
      sponsor_name: "",
    }));
    setCards((prev) => [...prev, ...nextCards]);
    setErrorText(null);
    setSuccessSummary(null);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    normalizeFiles(files);
    e.target.value = "";
  }

  function updateCard(
    id: string,
    patch: Partial<Omit<UploadCard, "id" | "file" | "previewUrl">>
  ) {
    setCards((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
    );
  }

  function removeCard(id: string) {
    setCards((prev) => {
      const target = prev.find((c) => c.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((c) => c.id !== id);
    });
  }

  function handleCardDrop(targetId: string) {
    if (!draggingCardId || draggingCardId === targetId) return;
    setCards((prev) => {
      const fromIndex = prev.findIndex((x) => x.id === draggingCardId);
      const toIndex = prev.findIndex((x) => x.id === targetId);
      if (fromIndex < 0 || toIndex < 0) return prev;
      const clone = [...prev];
      const [moved] = clone.splice(fromIndex, 1);
      clone.splice(toIndex, 0, moved);
      return clone;
    });
    setDraggingCardId(null);
  }

  function onDrop(e: React.DragEvent<HTMLButtonElement>) {
    e.preventDefault();
    setIsDragOver(false);
    normalizeFiles(Array.from(e.dataTransfer.files ?? []));
  }

  async function onPublishAll() {
    if (!activeDate) {
      setErrorText("Active Date is required.");
      return;
    }
    if (!Number.isFinite(Number(dayNumber)) || Number(dayNumber) < 1) {
      setErrorText("Day Number must be a valid number.");
      return;
    }
    if (cards.length === 0) {
      setErrorText("Add at least one image (up to 5).");
      return;
    }
    if (cards.some((c) => !c.title.trim() || !c.layer_count.trim())) {
      setErrorText("Each card requires Title and Layer Count.");
      return;
    }
    if (
      cards.some(
        (c) => c.is_sponsored && !c.sponsor_name.trim()
      )
    ) {
      setErrorText("Sponsored cards require Sponsor Name.");
      return;
    }

    setErrorText(null);
    setSuccessSummary(null);
    setSubmitting(true);
    setProgressStep(0);
    const sb = supabase();
    const publishCards: Array<{
      title: string;
      creator_name: string;
      software: string;
      category: string;
      layer_count: string;
      is_sponsored: boolean;
      sponsor_name: string;
      image_url: string;
    }> = [];

    const sanitizeForFilename = (value: string) => {
      const v = value
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-_]/g, "")
        .slice(0, 80);
      return v || "challenge";
    };

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      setProgressStep(i + 1);
      const ext = card.file.type === "image/jpeg" ? "jpg" : "png";
      const storagePath = `${activeDate}-${dayNumber}-${i + 1}-${sanitizeForFilename(card.title)}-${Date.now()}.${ext}`;

      const { error: uploadError } = await sb.storage
        .from("challenge-images")
        .upload(storagePath, card.file, {
          contentType: card.file.type || "image/png",
          upsert: true,
        });

      if (uploadError) {
        setSubmitting(false);
        setErrorText(`Card ${i + 1}: ${uploadError.message}`);
        return;
      }

      const { data: publicUrlData } = sb.storage
        .from("challenge-images")
        .getPublicUrl(storagePath);
      if (!publicUrlData.publicUrl) {
        setSubmitting(false);
        setErrorText(`Card ${i + 1}: failed to resolve public URL.`);
        return;
      }

      publishCards.push({
        title: card.title.trim(),
        creator_name: card.creator_name.trim(),
        software: card.software,
        category: card.category,
        layer_count: card.layer_count,
        is_sponsored: card.is_sponsored,
        sponsor_name: card.sponsor_name.trim(),
        image_url: publicUrlData.publicUrl,
      });
    }

    const fd = new FormData();
    fd.set("active_date", activeDate);
    fd.set("day_number", dayNumber);
    fd.set(
      "cards_json",
      JSON.stringify(publishCards)
    );

    const result = await action(fd);

    setProgressStep(cards.length);
    setSubmitting(false);

    if (result.error) {
      setErrorText(result.error);
      return;
    }

    setSuccessSummary(result.publishedTitles ?? []);
    cards.forEach((c) => URL.revokeObjectURL(c.previewUrl));
    setCards([]);
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-[rgba(26,10,46,0.7)] p-5 shadow-sm">
      <div className="text-lg font-extrabold">Batch Publish Challenges</div>
      <div className="mt-1 text-sm text-white/60">
        Upload up to 5 challenges for one active date.
      </div>

      <div className="mt-5 space-y-4">
        <div className="grid grid-cols-1 gap-4 rounded-2xl border border-white/10 bg-black/20 p-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-semibold text-white/80">Active Date</label>
            <input
              name="active_date"
              type="date"
              required
              value={activeDate}
              onChange={(e) => {
                setActiveDate(e.target.value);
                setDayNumberManual(false);
              }}
              className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-white outline-none"
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-white/80">Day Number</label>
            <input
              name="day_number"
              type="number"
              required
              value={dayNumber}
              onChange={(e) => {
                setDayNumber(e.target.value);
                setDayNumberManual(true);
              }}
              min={1}
              className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-white outline-none"
            />
            <div className="mt-1 flex items-center gap-2 text-xs text-white/55">
              <span>Suggested: {dayNumberAuto || "—"}</span>
              <button
                type="button"
                onClick={() => {
                  setDayNumber(dayNumberAuto);
                  setDayNumberManual(false);
                }}
                className="rounded-md border border-white/15 bg-white/5 px-2 py-0.5 font-semibold text-white/80 hover:bg-white/10"
              >
                Use suggested
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <label className="text-sm font-semibold text-white/80">Challenge Image (PNG or JPG)</label>
          <input
            ref={fileInputRef}
            name="image"
            type="file"
            accept="image/png,image/jpeg"
            onChange={onFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={openPicker}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={onDrop}
            className={`mt-2 flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${
              isDragOver
                ? "border-[var(--accent)] bg-[var(--accent)]/10"
                : "border-white/20 bg-black/30 hover:bg-black/40"
            }`}
          >
            <div className="text-2xl">⬆️</div>
            <div className="mt-2 text-sm font-semibold text-white/90">
              Drag and drop up to 5 images
            </div>
            <div className="mt-1 text-xs text-white/55">
              or click to browse files
            </div>
          </button>
          <div className="mt-2 text-xs text-white/55">
            Upload limit: 5 images total.
          </div>
        </div>

        {cards.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {cards.map((card, idx) => (
              <div
                key={card.id}
                draggable
                onDragStart={() => setDraggingCardId(card.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleCardDrop(card.id)}
                className="overflow-hidden rounded-2xl border border-white/10 bg-[rgba(26,10,46,0.65)]"
              >
                <div className="relative h-36 w-full bg-black/30">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={card.previewUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute left-3 top-3 rounded-full border border-white/25 bg-black/55 px-2.5 py-1 text-xs font-bold text-white">
                    Position {idx + 1}
                  </div>
                </div>
                <div className="space-y-3 p-3">
                  <div>
                    <label className="text-xs font-semibold text-white/70">Title</label>
                    <input
                      type="text"
                      value={card.title}
                      onChange={(e) => updateCard(card.id, { title: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-white/70">Creator Name</label>
                    <input
                      type="text"
                      value={card.creator_name}
                      onChange={(e) =>
                        updateCard(card.id, { creator_name: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-semibold text-white/70">Software</label>
                      <select
                        value={card.software}
                        onChange={(e) =>
                          updateCard(card.id, {
                            software: e.target.value as (typeof SOFTWARE_OPTIONS)[number],
                          })
                        }
                        className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none"
                      >
                        {SOFTWARE_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-white/70">Category</label>
                      <select
                        value={card.category}
                        onChange={(e) =>
                          updateCard(card.id, {
                            category: e.target.value as (typeof CATEGORY_OPTIONS)[number],
                          })
                        }
                        className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none"
                      >
                        {CATEGORY_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-white/70">Layer Count</label>
                    <input
                      type="number"
                      min={0}
                      value={card.layer_count}
                      onChange={(e) =>
                        updateCard(card.id, { layer_count: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="flex cursor-pointer items-center justify-between gap-3">
                      <span className="text-xs font-semibold text-white/75">Is Sponsored</span>
                      <span
                        className={`relative inline-flex h-6 w-11 items-center rounded-full border transition ${
                          card.is_sponsored
                            ? "border-[var(--accent)] bg-[var(--accent)]/70"
                            : "border-white/20 bg-white/10"
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                            card.is_sponsored ? "translate-x-5" : "translate-x-1"
                          }`}
                        />
                      </span>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={card.is_sponsored}
                        onChange={(e) =>
                          updateCard(card.id, { is_sponsored: e.target.checked })
                        }
                      />
                    </label>
                  </div>
                  <div
                    className={`overflow-hidden transition-all duration-300 ${
                      card.is_sponsored ? "max-h-24 opacity-100" : "max-h-0 opacity-0"
                    }`}
                  >
                    <label className="text-xs font-semibold text-white/70">Sponsor Name</label>
                    <input
                      type="text"
                      value={card.sponsor_name}
                      onChange={(e) =>
                        updateCard(card.id, { sponsor_name: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeCard(card.id)}
                    className="w-full rounded-lg border border-red-400/35 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-500/20"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {errorText ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {errorText}
          </p>
        ) : null}

        {submitting ? (
          <p className="text-center text-sm font-semibold text-white/75">
            Uploading image {Math.min(progressStep, cards.length)} of {cards.length}...
          </p>
        ) : null}

        {successSummary ? (
          <div className="rounded-xl border border-emerald-400/35 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            <div className="font-semibold">Published {successSummary.length} challenges:</div>
            <div className="mt-1 text-emerald-100/90">
              {successSummary.join(" · ")}
            </div>
          </div>
        ) : null}

        <button
          type="button"
          disabled={submitting || cards.length === 0}
          onClick={() => void onPublishAll()}
          className="w-full rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-bold text-white transition hover:bg-[var(--accent2)] disabled:opacity-50"
        >
          {submitting
            ? "Publishing..."
            : `Publish All ${cards.length} Challenge${cards.length === 1 ? "" : "s"}`}
        </button>
      </div>
      {successSummary ? (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-[300] -translate-x-1/2 rounded-full border border-emerald-400/40 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-200 shadow-lg backdrop-blur-sm">
          Batch published successfully
        </div>
      ) : null}
    </div>
  );
}


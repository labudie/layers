"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { DeleteButton } from "@/app/admin/DeleteButton";
import { AtCreatorDisplay } from "@/lib/AtHandle";

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

export type UpcomingChallengeRow = {
  id: string;
  title: string | null;
  creator_name: string | null;
  software: string | null;
  category: string | null;
  layer_count: number | null;
  day_number: number | null;
  active_date: string | null;
  position: number | null;
  is_sponsored: boolean | null;
  sponsor_name: string | null;
  image_url: string | null;
};

export function AdminChallengeFormClient({
  today,
  action,
  scheduledCounts,
  upcomingChallenges,
}: {
  today: string;
  action: (formData: FormData) => Promise<PublishBatchResult>;
  scheduledCounts: Record<string, number>;
  upcomingChallenges: UpcomingChallengeRow[];
}) {
  const [cards, setCards] = useState<UploadCard[]>([]);
  const [activeDate, setActiveDate] = useState(today);
  const [dayNumber, setDayNumber] = useState("");
  const [dayNumberManual, setDayNumberManual] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progressStep, setProgressStep] = useState(0);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [warningText, setWarningText] = useState<string | null>(null);
  const [successSummary, setSuccessSummary] = useState<string[] | null>(null);
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date(`${today}T00:00:00`);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [scheduleCountsState, setScheduleCountsState] =
    useState<Record<string, number>>(scheduledCounts);
  const [batchStartPosition, setBatchStartPosition] = useState(1);
  const [inspectChallenge, setInspectChallenge] =
    useState<UpcomingChallengeRow | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const batchSectionRef = useRef<HTMLDivElement | null>(null);

  const sortedScheduledDates = useMemo(
    () => Object.keys(scheduleCountsState).sort(),
    [scheduleCountsState]
  );

  const challengesForActiveDate = useMemo(() => {
    return upcomingChallenges.filter((c) => c.active_date === activeDate);
  }, [upcomingChallenges, activeDate]);

  const maxCardsForBatch = 5 - batchStartPosition + 1;

  const suggestedDayNumber = useMemo(() => {
    let suggested = 1;
    const exactIdx = sortedScheduledDates.indexOf(activeDate);
    if (exactIdx >= 0) {
      suggested = exactIdx + 1;
    } else {
      const insertIdx = sortedScheduledDates.findIndex((d) => d > activeDate);
      suggested = insertIdx === -1 ? sortedScheduledDates.length + 1 : insertIdx + 1;
    }
    return String(suggested);
  }, [activeDate, sortedScheduledDates]);

  const effectiveDayNumber = dayNumberManual ? dayNumber : suggestedDayNumber;

  useEffect(() => {
    return () => {
      cards.forEach((c) => URL.revokeObjectURL(c.previewUrl));
    };
  }, [cards]);

  function openPicker() {
    fileInputRef.current?.click();
  }

  function toYMD(year: number, month: number, day: number) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const monthMeta = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<{ date: string | null; day: number | null }> = [];

    for (let i = 0; i < firstDay; i++) cells.push({ date: null, day: null });
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: toYMD(year, month, d), day: d });
    }
    while (cells.length % 7 !== 0) cells.push({ date: null, day: null });
    return { year, month, cells };
  }, [calendarMonth]);

  function normalizeFiles(files: File[]) {
    const imageFiles = files.filter((f) =>
      ["image/png", "image/jpeg"].includes(f.type)
    );
    const availableSlots = Math.max(0, maxCardsForBatch - cards.length);
    if (cards.length >= maxCardsForBatch || imageFiles.length > availableSlots) {
      setWarningText(
        `Maximum ${maxCardsForBatch} image(s) for positions ${batchStartPosition}–5`
      );
    } else {
      setWarningText(null);
    }
    const picked = imageFiles.slice(0, Math.max(0, availableSlots));
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
    if (!Number.isFinite(Number(effectiveDayNumber)) || Number(effectiveDayNumber) < 1) {
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
      const pos = batchStartPosition + i;
      const storagePath = `${activeDate}-${effectiveDayNumber}-${pos}-${sanitizeForFilename(card.title)}-${Date.now()}.${ext}`;

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
    fd.set("day_number", effectiveDayNumber);
    fd.set("batch_start_position", String(batchStartPosition));
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
    setScheduleCountsState((prev) => ({
      ...prev,
      [activeDate]: (prev[activeDate] ?? 0) + cards.length,
    }));
    cards.forEach((c) => URL.revokeObjectURL(c.previewUrl));
    setCards([]);
    setBatchStartPosition(1);
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-[rgba(26,10,46,0.7)] p-5 shadow-sm">
      <div className="text-lg font-extrabold">Batch Publish Challenges</div>
      <div className="mt-1 text-sm text-white/60">
        Upload up to 5 challenges for one active date.
      </div>

      <div className="mt-5 space-y-4">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() =>
                setCalendarMonth(
                  (d) => new Date(d.getFullYear(), d.getMonth() - 1, 1)
                )
              }
              className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-sm font-semibold text-white/90 hover:bg-white/10"
              aria-label="Previous month"
            >
              ←
            </button>
            <div className="text-sm font-semibold text-white/85">
              {calendarMonth.toLocaleDateString("en-US", {
                month: "long",
                year: "numeric",
              })}
            </div>
            <button
              type="button"
              onClick={() =>
                setCalendarMonth(
                  (d) => new Date(d.getFullYear(), d.getMonth() + 1, 1)
                )
              }
              className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-sm font-semibold text-white/90 hover:bg-white/10"
              aria-label="Next month"
            >
              →
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-white/50">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div key={i}>{d}</div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {monthMeta.cells.map((cell, i) => {
              if (!cell.date || !cell.day) {
                return <div key={`empty-${i}`} className="h-8" />;
              }
              const count = scheduleCountsState[cell.date] ?? 0;
              const isToday = cell.date === today;
              const isSelected = cell.date === activeDate;
              const circleClass =
                count >= 5
                  ? "bg-emerald-500/90 border-emerald-300/30"
                  : count >= 1
                    ? "bg-[linear-gradient(90deg,rgba(245,158,11,0.95)_50%,rgba(0,0,0,0)_50%)] border-amber-300/35"
                    : "bg-transparent border-white/20";

              return (
                <button
                  key={cell.date}
                  type="button"
                  onClick={() => {
                    setActiveDate(cell.date as string);
                    setDayNumberManual(false);
                    setBatchStartPosition(1);
                    setInspectChallenge(null);
                  }}
                  className={`relative h-8 rounded-md text-xs transition ${
                    isSelected ? "bg-[var(--accent)]/25" : "hover:bg-white/5"
                  }`}
                >
                  <span
                    className={`absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border ${circleClass} ${
                      isToday ? "ring-2 ring-[var(--accent)]" : ""
                    }`}
                  />
                  <span className="relative z-10 font-semibold text-white">
                    {cell.day}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-white/60">
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/90" />
              5 scheduled
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-[linear-gradient(90deg,rgba(245,158,11,0.95)_50%,rgba(0,0,0,0)_50%)] border border-amber-300/35" />
              1-4 scheduled
            </span>
          </div>

          <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-white/50">
              Day detail · {activeDate}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {([1, 2, 3, 4, 5] as const).map((pos) => {
                const ch = challengesForActiveDate.find((c) => c.position === pos);
                if (ch) {
                  return (
                    <button
                      key={pos}
                      type="button"
                      onClick={() => setInspectChallenge(ch)}
                      className="flex min-h-[5.5rem] flex-col rounded-lg border border-white/15 bg-white/5 p-2 text-left text-xs transition hover:bg-white/10"
                    >
                      <span className="font-mono text-[10px] text-white/45">
                        #{pos}
                      </span>
                      <span className="mt-1 line-clamp-3 font-semibold text-white/90">
                        {ch.title ?? "Untitled"}
                      </span>
                    </button>
                  );
                }
                return (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => {
                      setBatchStartPosition(pos);
                      setInspectChallenge(null);
                      setDayNumberManual(false);
                      batchSectionRef.current?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      });
                      window.setTimeout(() => {
                        fileInputRef.current?.focus();
                        openPicker();
                      }, 400);
                    }}
                    className="flex min-h-[5.5rem] flex-col items-center justify-center rounded-lg border border-dashed border-white/25 bg-black/25 p-2 text-xs font-semibold text-white/70 transition hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/10 hover:text-white"
                  >
                    <span className="font-mono text-[10px] text-white/45">
                      #{pos}
                    </span>
                    <span className="mt-1 text-lg leading-none">+</span>
                    <span className="mt-0.5 text-[10px]">Add</span>
                  </button>
                );
              })}
            </div>
            {inspectChallenge ? (
              <div className="mt-4 rounded-xl border border-white/15 bg-[rgba(26,10,46,0.85)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-mono uppercase text-white/45">
                      Position {inspectChallenge.position ?? "—"} ·{" "}
                      {inspectChallenge.active_date ?? "—"}
                    </div>
                    <div className="mt-1 text-base font-bold text-white">
                      {inspectChallenge.title ?? "Untitled"}
                    </div>
                    <div className="mt-2 space-y-1 text-sm text-white/75">
                      <div>
                        Creator:{" "}
                        <AtCreatorDisplay raw={inspectChallenge.creator_name} />
                      </div>
                      <div>
                        {inspectChallenge.software ?? "—"} ·{" "}
                        {inspectChallenge.category ?? "—"} ·{" "}
                        {inspectChallenge.layer_count ?? "—"} layers
                      </div>
                      {inspectChallenge.is_sponsored ? (
                        <div className="text-amber-200">
                          Sponsored · {inspectChallenge.sponsor_name ?? "—"}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  {inspectChallenge.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={inspectChallenge.image_url}
                      alt=""
                      className="h-20 w-20 shrink-0 rounded-lg border border-white/10 object-cover"
                    />
                  ) : null}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <DeleteButton id={inspectChallenge.id} />
                  <button
                    type="button"
                    onClick={() => setInspectChallenge(null)}
                    className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white/90 hover:bg-white/10"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div
          ref={batchSectionRef}
          className="grid grid-cols-1 gap-4 rounded-2xl border border-white/10 bg-black/20 p-4 sm:grid-cols-2"
        >
          <div className="sm:col-span-2 text-xs text-white/55">
            Batch fills positions{" "}
            <span className="font-mono font-semibold text-white/85">
              {batchStartPosition}
            </span>
            –
            <span className="font-mono font-semibold text-white/85">
              {Math.min(5, batchStartPosition + Math.max(0, cards.length - 1))}
            </span>
            {cards.length === 0
              ? " (add images below)"
              : ` (${cards.length} image${cards.length === 1 ? "" : "s"})`}
          </div>
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
                setBatchStartPosition(1);
                setInspectChallenge(null);
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
              value={effectiveDayNumber}
              onChange={(e) => {
                setDayNumber(e.target.value);
                setDayNumberManual(true);
              }}
              min={1}
              className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-white outline-none"
            />
            <div className="mt-1 flex items-center gap-2 text-xs text-white/55">
              <span>Suggested: {suggestedDayNumber || "—"}</span>
              <button
                type="button"
                onClick={() => {
                  setDayNumber("");
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
            accept="image/*"
            multiple
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
              Drop up to 5 images here
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
                    Position {batchStartPosition + idx}
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
                      className="at-handle mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none"
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
        {warningText ? (
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {warningText}
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


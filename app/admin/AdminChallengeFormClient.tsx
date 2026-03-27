"use client";

import { useFormStatus } from "react-dom";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type AddChallengeState = {
  error: string | null;
  successAt?: number | null;
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

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl bg-white px-5 py-3 text-sm font-bold text-black hover:opacity-95 disabled:opacity-50"
    >
      {pending ? "Adding..." : "Add Challenge"}
    </button>
  );
}

export function AdminChallengeFormClient({
  today,
  action,
  initialState,
}: {
  today: string;
  action: (prevState: AddChallengeState, formData: FormData) => Promise<AddChallengeState>;
  initialState: AddChallengeState;
}) {
  const [state, formAction] = useActionState(action, initialState);
  const [isSponsoredChecked, setIsSponsoredChecked] = useState(false);
  const [activeDate, setActiveDate] = useState(today);
  const [dayNumber, setDayNumber] = useState("");
  const [dayNumberAuto, setDayNumberAuto] = useState("");
  const [dayNumberManual, setDayNumberManual] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [hiddenSuccessAt, setHiddenSuccessAt] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const togglePillClass = useMemo(
    () =>
      `relative inline-flex h-6 w-11 items-center rounded-full border transition ${
        isSponsoredChecked
          ? "border-[var(--accent)] bg-[var(--accent)]/70"
          : "border-white/20 bg-white/10"
      }`,
    [isSponsoredChecked]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sb = supabase();
      const { data: sameDayRows } = await sb
        .from("challenges")
        .select("day_number")
        .eq("active_date", activeDate);

      if (cancelled) return;

      const sameDayNumbers = Array.from(
        new Set(
          ((sameDayRows ?? []) as { day_number: number | null }[])
            .map((r) => r.day_number)
            .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
        )
      );

      let suggested = 1;
      if (sameDayNumbers.length > 0) {
        // If this date already has entries, default to that same daily number.
        suggested = Math.max(...sameDayNumbers);
      } else {
        const { data: maxRow } = await sb
          .from("challenges")
          .select("day_number")
          .order("day_number", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (cancelled) return;
        const maxDay = (maxRow as { day_number?: number | null } | null)?.day_number;
        suggested = typeof maxDay === "number" ? maxDay + 1 : 1;
      }

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

  const showToast = Boolean(state.successAt && state.successAt !== hiddenSuccessAt);

  useEffect(() => {
    if (!showToast || !state.successAt) return;
    const t = window.setTimeout(() => setHiddenSuccessAt(state.successAt ?? null), 3000);
    return () => window.clearTimeout(t);
  }, [showToast, state.successAt]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function openPicker() {
    fileInputRef.current?.click();
  }

  function setInputFile(file: File) {
    if (!fileInputRef.current) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    fileInputRef.current.files = dt.files;
    const url = URL.createObjectURL(file);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
  }

  function onDrop(e: React.DragEvent<HTMLButtonElement>) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type)) return;
    setInputFile(file);
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-[rgba(26,10,46,0.7)] p-5 shadow-sm">
      <div className="text-lg font-extrabold">Add new challenge</div>

      <form action={formAction} className="mt-5 space-y-4">
        <div className="grid grid-cols-1 gap-4 rounded-2xl border border-white/10 bg-black/20 p-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-semibold text-white/80">Title</label>
            <input
              name="title"
              type="text"
              required
              className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-white outline-none"
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-white/80">Creator Name</label>
            <input
              name="creator_name"
              type="text"
              placeholder="e.g. reeselabudie"
              className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-white outline-none"
            />
            <div className="mt-1 text-xs text-white/55">
              Optional, used for creator stats.
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 rounded-2xl border border-white/10 bg-black/20 p-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-semibold text-white/80">Software</label>
            <select
              name="software"
              required
              className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-white outline-none"
              defaultValue={SOFTWARE_OPTIONS[0]}
            >
              {SOFTWARE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-semibold text-white/80">Category</label>
            <select
              name="category"
              required
              className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-white outline-none"
              defaultValue={CATEGORY_OPTIONS[0]}
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 rounded-2xl border border-white/10 bg-black/20 p-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-semibold text-white/80">Layer Count</label>
            <input
              name="layer_count"
              type="number"
              required
              min={0}
              className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-white outline-none"
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-white/80">
              Position (1-5)
            </label>
            <input
              name="position"
              type="number"
              required
              min={1}
              max={5}
              className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-white outline-none"
            />
          </div>
        </div>

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
            <label className="text-sm font-semibold text-white/80">
              Day Number
            </label>
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
          <label
            htmlFor="is_sponsored"
            className="flex cursor-pointer items-center justify-between gap-3"
          >
            <span className="text-sm font-semibold text-white/85">Is Sponsored</span>
            <span className={togglePillClass}>
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                  isSponsoredChecked ? "translate-x-5" : "translate-x-1"
                }`}
              />
            </span>
          </label>
          <input
            id="is_sponsored"
            name="is_sponsored"
            type="checkbox"
            value="true"
            checked={isSponsoredChecked}
            onChange={(e) => setIsSponsoredChecked(e.target.checked)}
            className="sr-only"
          />
        </div>

        <div
          className={`overflow-hidden transition-all duration-300 ${
            isSponsoredChecked ? "max-h-40 opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <label
              className="text-sm font-semibold text-white/80"
              htmlFor="sponsor_name"
            >
              Sponsor Name
            </label>
            <input
              id="sponsor_name"
              name="sponsor_name"
              type="text"
              className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-white outline-none"
            />
            <div className="mt-1 text-xs text-white/55">
              Required when sponsored is enabled.
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
              Drag and drop image here
            </div>
            <div className="mt-1 text-xs text-white/55">
              or click to browse files
            </div>
          </button>

          {previewUrl ? (
            <div className="mt-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Preview"
                className="h-24 w-24 rounded-lg border border-white/15 object-cover"
              />
            </div>
          ) : null}

          <div className="mt-2 text-xs text-white/55">
            Optional. A preview appears before submission.
          </div>
        </div>

        {state.error ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {state.error}
          </p>
        ) : null}

        <SubmitButton />
      </form>

      {showToast ? (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-[300] -translate-x-1/2 rounded-full border border-emerald-400/40 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-200 shadow-lg backdrop-blur-sm">
          Challenge added successfully
        </div>
      ) : null}
    </div>
  );
}


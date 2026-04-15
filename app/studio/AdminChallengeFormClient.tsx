"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { DeleteButton } from "@/app/studio/DeleteButton";
import { AtCreatorDisplay } from "@/lib/AtHandle";
import { normalizeUsernameForStorage } from "@/lib/username-input";
import { parsePsdLayerCount } from "@/lib/psd-layer-count";
import {
  SOFTWARE_OPTIONS,
  type SoftwareOption,
  layerCountGuidanceForSoftware,
} from "@/lib/software-options";

type PublishBatchResult = {
  error: string | null;
  publishedCount?: number;
  publishedTitles?: string[];
};

const CATEGORY_OPTIONS = [
  "Branding",
  "UI Design",
  "Print",
  "Marketing",
  "Motion",
  "3D",
  "Other",
] as const;

type LayerCountHint = "none" | "psd-auto" | "psd-failed";

type UploadCard = {
  id: string;
  /** PNG/JPG for Supabase (required before publish). */
  file: File | null;
  /** PSD used only for layer counting; never uploaded. */
  psdFile: File | null;
  /** Object URL for raster preview; null when only PSD is present. */
  previewUrl: string | null;
  title: string;
  creator_name: string;
  software: SoftwareOption;
  category: (typeof CATEGORY_OPTIONS)[number];
  layer_count: string;
  layerCountHint: LayerCountHint;
  is_sponsored: boolean;
  sponsor_name: string;
};

function isPsdFile(file: File) {
  const name = file.name.toLowerCase();
  const mime = (file.type || "").toLowerCase();
  return (
    name.endsWith(".psd") ||
    mime === "image/vnd.adobe.photoshop" ||
    mime === "application/x-photoshop" ||
    mime === "application/vnd.adobe.photoshop" ||
    mime === "application/photoshop"
  );
}

function isRasterGameImage(file: File) {
  return file.type === "image/png" || file.type === "image/jpeg";
}

function basenameWithoutExt(filename: string): string {
  const n = filename.trim();
  const i = n.lastIndexOf(".");
  if (i <= 0) return n;
  return n.slice(0, i);
}

/** Case-insensitive pairing key: alphanumeric only from stem (spaces & specials stripped). */
function pairingKeyFromFile(file: File): string {
  const stem = basenameWithoutExt(file.name);
  const raw = stem.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (raw) return raw;
  return `__uniq_${file.name}_${file.size}_${file.lastModified}`;
}

function formatTitleFromStem(stem: string): string {
  const spaced = stem.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (!spaced) return "";
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

type FilePairSpec = {
  key: string;
  /** Original stem (before pairing normalization) for display title. */
  displayStem: string;
  psd: File | null;
  raster: File | null;
};

function buildPairSpecs(files: File[]): FilePairSpec[] {
  const buckets = new Map<string, { psd: File | null; raster: File | null }>();

  for (const f of files) {
    const key = pairingKeyFromFile(f);
    let b = buckets.get(key);
    if (!b) {
      b = { psd: null, raster: null };
      buckets.set(key, b);
    }
    if (isPsdFile(f)) {
      if (!b.psd) b.psd = f;
    } else if (isRasterGameImage(f)) {
      if (!b.raster) {
        b.raster = f;
      } else {
        const nextIsPng =
          f.name.toLowerCase().endsWith(".png") || f.type === "image/png";
        const curIsPng =
          b.raster.name.toLowerCase().endsWith(".png") ||
          b.raster.type === "image/png";
        if (nextIsPng && !curIsPng) b.raster = f;
      }
    }
  }

  const specs: FilePairSpec[] = Array.from(buckets.entries()).map(([key, b]) => {
    const displayStem = b.psd
      ? basenameWithoutExt(b.psd.name)
      : b.raster
        ? basenameWithoutExt(b.raster.name)
        : key;
    return { key, displayStem, psd: b.psd, raster: b.raster };
  });

  specs.sort((a, b) =>
    a.displayStem.localeCompare(b.displayStem, undefined, { sensitivity: "base" }),
  );
  return specs;
}

function IconPsdDoc({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M7 3h8l4 4v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"
        fill="rgba(139,92,246,0.2)"
        stroke="#c4b5fd"
        strokeWidth="1.25"
      />
      <path d="M15 3v4h4" stroke="#a78bfa" strokeOpacity="0.75" strokeWidth="1.25" />
      <text
        x="12"
        y="16"
        textAnchor="middle"
        fill="#ddd6fe"
        fontSize="7"
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
      >
        PSD
      </text>
    </svg>
  );
}

function IconImage({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="rgba(255,255,255,0.35)" strokeWidth="1.25" />
      <circle cx="8.5" cy="10" r="1.5" fill="rgba(255,255,255,0.4)" />
      <path
        d="M3 17l5-4 4 3 4-5 5 6"
        stroke="rgba(255,255,255,0.3)"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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

function CreatorAutocompleteInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    const term = normalizeUsernameForStorage(query);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (!term) {
      setResults([]);
      setLoading(false);
      return;
    }
    debounceRef.current = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        const { data, error } = await supabase()
          .from("profiles")
          .select("username")
          .ilike("username", `%${term}%`)
          .order("username", { ascending: true })
          .limit(8);
        if (!mountedRef.current) return;
        if (error) {
          setResults([]);
          setLoading(false);
          return;
        }
        const rows = (data ?? []) as Array<{ username?: string | null }>;
        const uniq = Array.from(
          new Set(
            rows
              .map((r) => normalizeUsernameForStorage(r.username ?? ""))
              .filter(Boolean),
          ),
        );
        uniq.sort((a, b) => {
          const aStarts = a.startsWith(term) ? 0 : 1;
          const bStarts = b.startsWith(term) ? 0 : 1;
          if (aStarts !== bStarts) return aStarts - bStarts;
          return a.localeCompare(b);
        });
        setResults(uniq);
        setLoading(false);
      })();
    }, 300);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query]);

  const hasTyped = normalizeUsernameForStorage(query).length > 0;

  return (
    <div className="relative">
      <div className="mt-1 flex items-stretch overflow-hidden rounded-lg border border-white/15 bg-black/40">
        <span className="flex items-center border-r border-white/10 bg-white/5 px-3 text-sm font-semibold text-white/70">
          @
        </span>
        <input
          type="text"
          value={query}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 120);
          }}
          onChange={(e) => {
            const next = normalizeUsernameForStorage(e.target.value);
            setQuery(next);
            onChange(next);
            setOpen(true);
          }}
          className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-white outline-none"
          placeholder="creator_username"
        />
      </div>
      {open && hasTyped ? (
        <div className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-lg border border-[rgba(167,139,250,0.35)] bg-[linear-gradient(180deg,rgba(40,16,67,0.98)_0%,rgba(22,9,39,0.98)_100%)] shadow-[0_16px_36px_rgba(0,0,0,0.45)] ring-1 ring-white/10 backdrop-blur-xl">
          {loading ? (
            <div className="px-3 py-2 text-sm text-white/60">Searching...</div>
          ) : results.length ? (
            results.map((username) => (
              <button
                key={username}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setQuery(username);
                  onChange(username);
                  setOpen(false);
                }}
                className="block w-full border-b border-white/10 px-3 py-2 text-left text-sm text-white/90 transition hover:bg-white/10 last:border-b-0"
              >
                @{username}
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-white/60">No users found</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

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
  const [pairingSuccessText, setPairingSuccessText] = useState<string | null>(null);
  const [successSummary, setSuccessSummary] = useState<string[] | null>(null);
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [cardDropHighlight, setCardDropHighlight] = useState<{
    id: string;
    zone: "psd" | "png";
  } | null>(null);
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
      cards.forEach((c) => {
        if (c.previewUrl) URL.revokeObjectURL(c.previewUrl);
      });
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

  async function normalizeFiles(files: File[]) {
    setPairingSuccessText(null);
    const accepted = files.filter((f) => isRasterGameImage(f) || isPsdFile(f));
    if (accepted.length === 0) return;

    const availableSlots = Math.max(0, maxCardsForBatch - cards.length);
    const specsAll = buildPairSpecs(accepted);

    if (availableSlots <= 0) {
      setWarningText(
        `Maximum ${maxCardsForBatch} card(s) for positions ${batchStartPosition}–5`,
      );
      return;
    }

    const specs = specsAll.slice(0, availableSlots);
    if (specsAll.length > availableSlots) {
      setWarningText(
        `Only ${availableSlots} more card slot(s) available (${specsAll.length} file group(s) from drop; extras not added).`,
      );
    } else {
      setWarningText(null);
    }

    const nextCards: UploadCard[] = [];
    let idx = 0;
    for (const spec of specs) {
      const id = `${Date.now()}-${idx}-${Math.random().toString(16).slice(2)}`;
      idx++;
      const title = formatTitleFromStem(spec.displayStem);

      if (spec.psd && spec.raster) {
        let count: number | null = null;
        try {
          const ab = await spec.psd.arrayBuffer();
          count = parsePsdLayerCount(ab);
        } catch {
          count = null;
        }
        nextCards.push({
          id,
          file: spec.raster,
          psdFile: spec.psd,
          previewUrl: URL.createObjectURL(spec.raster),
          title,
          creator_name: "",
          software: SOFTWARE_OPTIONS[0],
          category: CATEGORY_OPTIONS[0],
          layer_count: count != null ? String(count) : "",
          layerCountHint: count != null ? "psd-auto" : "psd-failed",
          is_sponsored: false,
          sponsor_name: "",
        });
      } else if (spec.psd) {
        let count: number | null = null;
        try {
          const ab = await spec.psd.arrayBuffer();
          count = parsePsdLayerCount(ab);
        } catch {
          count = null;
        }
        nextCards.push({
          id,
          file: null,
          psdFile: spec.psd,
          previewUrl: null,
          title,
          creator_name: "",
          software: SOFTWARE_OPTIONS[0],
          category: CATEGORY_OPTIONS[0],
          layer_count: count != null ? String(count) : "",
          layerCountHint: count != null ? "psd-auto" : "psd-failed",
          is_sponsored: false,
          sponsor_name: "",
        });
      } else if (spec.raster) {
        nextCards.push({
          id,
          file: spec.raster,
          psdFile: null,
          previewUrl: URL.createObjectURL(spec.raster),
          title,
          creator_name: "",
          software: SOFTWARE_OPTIONS[0],
          category: CATEGORY_OPTIONS[0],
          layer_count: "",
          layerCountHint: "none",
          is_sponsored: false,
          sponsor_name: "",
        });
      }
    }

    const addedPairs = nextCards.filter((c) => c.psdFile && c.file).length;
    setCards((prev) => [...prev, ...nextCards]);
    setErrorText(null);
    setSuccessSummary(null);
    if (addedPairs > 0) {
      setPairingSuccessText(
        `${addedPairs} pair${addedPairs === 1 ? "" : "s"} detected and matched automatically`,
      );
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    void normalizeFiles(files);
    e.target.value = "";
  }

  function updateCard(id: string, patch: Partial<Omit<UploadCard, "id">>) {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function setCardRasterImage(cardId: string, file: File) {
    setCards((prev) =>
      prev.map((c) => {
        if (c.id !== cardId) return c;
        if (c.previewUrl) URL.revokeObjectURL(c.previewUrl);
        return {
          ...c,
          file,
          previewUrl: URL.createObjectURL(file),
        };
      }),
    );
    setErrorText(null);
    setSuccessSummary(null);
  }

  async function setCardPsdFile(cardId: string, file: File) {
    let count: number | null = null;
    try {
      const ab = await file.arrayBuffer();
      count = parsePsdLayerCount(ab);
    } catch {
      count = null;
    }
    setCards((prev) =>
      prev.map((c) => {
        if (c.id !== cardId) return c;
        return {
          ...c,
          psdFile: file,
          layer_count: count != null ? String(count) : "",
          layerCountHint: count != null ? "psd-auto" : "psd-failed",
        };
      }),
    );
    setErrorText(null);
    setSuccessSummary(null);
  }

  function removeCard(id: string) {
    setCards((prev) => {
      const target = prev.find((c) => c.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      const next = prev.filter((c) => c.id !== id);
      if (next.length === 0) {
        queueMicrotask(() => setPairingSuccessText(null));
      }
      return next;
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

  function handleCardPsdDrop(cardId: string, e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setCardDropHighlight(null);
    const f = Array.from(e.dataTransfer.files).find((file) => isPsdFile(file));
    if (f) void setCardPsdFile(cardId, f);
  }

  function handleCardPngDrop(cardId: string, e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setCardDropHighlight(null);
    const f = Array.from(e.dataTransfer.files).find((file) => isRasterGameImage(file));
    if (f) setCardRasterImage(cardId, f);
  }

  function zoneDragLeave(e: React.DragEvent) {
    const rel = e.relatedTarget as Node | null;
    if (rel && e.currentTarget.contains(rel)) return;
    setCardDropHighlight(null);
  }

  function onDrop(e: React.DragEvent<HTMLButtonElement>) {
    e.preventDefault();
    setIsDragOver(false);
    void normalizeFiles(Array.from(e.dataTransfer.files ?? []));
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
      setErrorText("Add at least one image or PSD (up to 5).");
      return;
    }
    const missingImageIdx = cards.findIndex((c) => !c.file);
    if (missingImageIdx >= 0) {
      setErrorText(
        `Card ${missingImageIdx + 1}: add a PNG or JPG export for the game image (PSD is not uploaded).`,
      );
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
      software: SoftwareOption;
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
      if (!card.file) {
        setSubmitting(false);
        setErrorText(`Card ${i + 1}: missing game image file.`);
        return;
      }
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
    cards.forEach((c) => {
      if (c.previewUrl) URL.revokeObjectURL(c.previewUrl);
    });
    setCards([]);
    setBatchStartPosition(1);
    setPairingSuccessText(null);
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-[rgba(26,10,46,0.7)] p-5 shadow-sm">
      <div className="text-lg font-extrabold">Batch Publish Challenges</div>
      <div className="mt-1 text-sm text-white/60">
        Upload up to 5 challenges for one active date.
      </div>

      <div className="mt-5 space-y-4">
        <div className="rounded-[var(--radius-card)] border border-white/10 bg-black/20 p-4">
          <div className="mb-1 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() =>
                setCalendarMonth(
                  (d) => new Date(d.getFullYear(), d.getMonth() - 1, 1)
                )
              }
              className="inline-flex h-11 min-h-[44px] w-11 min-w-[44px] shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-xl font-bold leading-none text-white/95 transition-colors hover:bg-white/10 active:bg-white/[0.14]"
              aria-label="Previous month"
            >
              ‹
            </button>
            <div className="min-w-0 flex-1 text-center text-base font-bold tracking-tight text-white/90">
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
              className="inline-flex h-11 min-h-[44px] w-11 min-w-[44px] shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-xl font-bold leading-none text-white/95 transition-colors hover:bg-white/10 active:bg-white/[0.14]"
              aria-label="Next month"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-semibold uppercase tracking-widest text-white/40">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div key={i} className="py-2">
                {d}
              </div>
            ))}
          </div>

          <div
            key={`${monthMeta.year}-${monthMeta.month}`}
            className="calendar-month-enter grid grid-cols-7 gap-2"
          >
            {monthMeta.cells.map((cell, i) => {
              if (!cell.date || !cell.day) {
                return <div key={`empty-${i}`} className="min-h-[56px]" />;
              }
              const count = scheduleCountsState[cell.date] ?? 0;
              const isToday = cell.date === today;
              const isSelected = cell.date === activeDate;

              let numberClass = "text-white/92";
              if (isToday) {
                numberClass =
                  "bg-[var(--accent)] text-white shadow-[0_2px_10px_rgba(124,58,237,0.45)]";
                if (isSelected) {
                  numberClass +=
                    " ring-2 ring-white/35 ring-offset-2 ring-offset-[rgba(15,5,32,0.98)]";
                }
              } else if (isSelected) {
                numberClass =
                  "bg-transparent text-white ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[rgba(15,5,32,0.98)]";
              }

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
                  className={`flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-[var(--radius-card)] px-0.5 py-1.5 transition-colors active:bg-white/[0.1] ${
                    isSelected && !isToday
                      ? "bg-[var(--accent)]/15"
                      : "hover:bg-white/[0.06]"
                  }`}
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-[color,background-color,box-shadow] ${numberClass}`}
                  >
                    {cell.day}
                  </span>
                  <span className="flex h-2 w-full items-center justify-center">
                    {count >= 5 ? (
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.55)]"
                        aria-hidden
                      />
                    ) : count >= 1 ? (
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]"
                        aria-hidden
                      />
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-white/55">
            <span className="inline-flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              5 challenges scheduled
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
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
              ? " (add challenges below)"
              : ` (${cards.length} card${cards.length === 1 ? "" : "s"})`}
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

        <div className="rounded-2xl border border-violet-500/20 bg-[rgba(26,10,46,0.45)] p-4">
          <div className="text-sm font-bold text-violet-100/95">Quick add (optional)</div>
          <p className="mt-1 text-xs leading-relaxed text-white/50">
            Drop many files at once: matching <span className="font-mono text-white/65">.psd</span> +{" "}
            <span className="font-mono text-white/65">.png</span> /{" "}
            <span className="font-mono text-white/65">.jpg</span> with the same base name merge into one card (case
            insensitive). Or use the drop zones on each card.
          </p>
          <input
            ref={fileInputRef}
            name="image"
            type="file"
            accept="image/png,image/jpeg,.psd,image/vnd.adobe.photoshop,application/x-photoshop,application/vnd.adobe.photoshop"
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
            className={`mt-3 flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-3 py-6 text-center transition ${
              isDragOver
                ? "border-violet-400 bg-violet-500/15"
                : "border-violet-400/35 bg-black/25 hover:border-violet-400/55 hover:bg-violet-950/20"
            }`}
          >
            <div className="text-lg text-violet-200/90">⬆</div>
            <div className="mt-1.5 text-xs font-semibold text-white/90">Browse or drop up to 5 files</div>
            <div className="mt-0.5 text-[11px] text-white/45">PNG · JPG · PSD</div>
          </button>
          {pairingSuccessText ? (
            <p className="mt-3 rounded-lg border border-emerald-400/35 bg-emerald-500/15 px-3 py-2 text-center text-xs font-semibold text-emerald-100">
              {pairingSuccessText}
            </p>
          ) : null}
        </div>

        {cards.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {cards.map((card, idx) => {
              const pos = batchStartPosition + idx;
              const psdHighlight =
                cardDropHighlight?.id === card.id && cardDropHighlight.zone === "psd";
              const pngHighlight =
                cardDropHighlight?.id === card.id && cardDropHighlight.zone === "png";
              const layerParsed =
                card.layerCountHint === "psd-auto" && card.layer_count.trim() !== ""
                  ? Math.max(0, Math.floor(Number(card.layer_count) || 0))
                  : null;
              const missingGameImage = !card.file;
              const missingLayerCount = !String(card.layer_count).trim();

              return (
                <div
                  key={card.id}
                  onDragOver={(e) => {
                    e.preventDefault();
                  }}
                  onDrop={() => handleCardDrop(card.id)}
                  className="flex flex-col overflow-hidden rounded-2xl border border-violet-500/20 bg-[linear-gradient(180deg,rgba(46,16,78,0.92)_0%,rgba(26,10,46,0.98)_100%)] shadow-[0_12px_40px_rgba(0,0,0,0.35)]"
                >
                  <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-black/25 px-2.5 py-1.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <div
                        draggable
                        onDragStart={(e) => {
                          setDraggingCardId(card.id);
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", card.id);
                        }}
                        onDragEnd={() => setDraggingCardId(null)}
                        className="shrink-0 cursor-grab select-none rounded-md border border-white/15 bg-white/5 px-1.5 py-1 text-[10px] font-bold leading-none text-white/45 hover:bg-white/10 active:cursor-grabbing"
                        title="Drag to reorder cards"
                        aria-label="Drag to reorder cards"
                      >
                        ⋮⋮
                      </div>
                      <span className="truncate text-[10px] font-bold uppercase tracking-wider text-violet-300/80">
                        Step 1 · Files
                      </span>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                      {card.psdFile && card.file ? (
                        <span className="rounded-full border border-emerald-400/45 bg-emerald-600/25 px-2 py-0.5 text-[9px] font-bold text-emerald-100">
                          ✓ Paired
                        </span>
                      ) : card.psdFile && !card.file ? (
                        <span className="rounded-full border border-orange-400/45 bg-orange-500/20 px-2 py-0.5 text-[9px] font-bold text-orange-100">
                          ⚠ Missing PNG
                        </span>
                      ) : card.file && !card.psdFile ? (
                        <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[9px] font-bold text-white/45">
                          No PSD
                        </span>
                      ) : null}
                      <span className="rounded-full border border-violet-400/30 bg-violet-600/25 px-2 py-0.5 text-[10px] font-bold text-violet-100">
                        Pos {pos}
                      </span>
                    </div>
                  </div>

                  <div className="relative h-28 w-full shrink-0 bg-black/40">
                    {card.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={card.previewUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center gap-1 px-3 text-center">
                        <IconImage className="opacity-40" />
                        <span className="text-[10px] font-medium text-white/40">Game image preview</span>
                        <span className="text-[9px] text-white/30">Drop PNG/JPG below</span>
                      </div>
                    )}
                    {card.file ? (
                      <div className="absolute bottom-1.5 right-1.5 rounded-full border border-emerald-400/40 bg-emerald-600/90 px-2 py-0.5 text-[9px] font-bold text-white shadow-sm">
                        PNG ✓
                      </div>
                    ) : null}
                  </div>

                  <div className="h-px bg-gradient-to-r from-transparent via-violet-500/25 to-transparent" />

                  <div className="space-y-2 p-2.5">
                    <label
                      htmlFor={`psd-${card.id}`}
                      draggable={false}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setCardDropHighlight({ id: card.id, zone: "psd" });
                      }}
                      onDragLeave={zoneDragLeave}
                      onDrop={(e) => handleCardPsdDrop(card.id, e)}
                      className={`block cursor-pointer rounded-xl border-2 border-dashed px-2.5 py-2.5 transition ${
                        psdHighlight
                          ? "border-violet-400 bg-violet-500/20"
                          : "border-violet-500/50 bg-violet-950/30 hover:border-violet-400/70"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <IconPsdDoc className="mt-0.5 shrink-0 opacity-95" />
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-bold uppercase tracking-wide text-violet-200/95">
                            Drop PSD for layer count
                          </div>
                          <div className="mt-0.5 text-[10px] font-medium text-violet-300/70">Tap to browse</div>
                          {card.psdFile ? (
                            <div className="mt-1.5 space-y-1">
                              <div className="truncate text-[10px] font-medium text-white/80" title={card.psdFile.name}>
                                {card.psdFile.name}
                              </div>
                              {card.layerCountHint === "psd-auto" && layerParsed != null ? (
                                <>
                                  <div className="text-[11px] font-semibold text-emerald-400">
                                    ✓ {layerParsed} visible layers
                                  </div>
                                  <div className="inline-flex w-fit rounded-full border border-violet-400/50 bg-violet-600/85 px-2 py-0.5 text-[9px] font-bold text-white shadow-sm">
                                    PSD ✓ {layerParsed} visible
                                  </div>
                                </>
                              ) : card.layerCountHint === "psd-failed" ? (
                                <div className="text-[11px] font-medium text-white/50">Enter manually</div>
                              ) : null}
                            </div>
                          ) : (
                            <div className="mt-1 text-[10px] text-white/35">No PSD yet</div>
                          )}
                          <p className="mt-1.5 text-[9px] leading-snug text-white/40">
                            Used for layer counting only, not stored
                          </p>
                          {card.psdFile && !card.file ? (
                            <p className="mt-1.5 text-[10px] font-medium leading-snug text-orange-200/95">
                              Add matching PNG with same filename
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <input
                        id={`psd-${card.id}`}
                        type="file"
                        accept=".psd,image/vnd.adobe.photoshop,application/x-photoshop,application/vnd.adobe.photoshop"
                        className="sr-only"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (f && isPsdFile(f)) void setCardPsdFile(card.id, f);
                        }}
                      />
                    </label>

                    <label
                      htmlFor={`png-${card.id}`}
                      draggable={false}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setCardDropHighlight({ id: card.id, zone: "png" });
                      }}
                      onDragLeave={zoneDragLeave}
                      onDrop={(e) => handleCardPngDrop(card.id, e)}
                      className={`block cursor-pointer rounded-xl border-2 border-dashed px-2.5 py-2.5 transition ${
                        pngHighlight
                          ? "border-white/50 bg-white/10"
                          : "border-white/20 bg-black/20 hover:border-white/35"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <IconImage className="mt-0.5 shrink-0 opacity-70" />
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-bold uppercase tracking-wide text-white/75">
                            Drop PNG/JPG for game image
                          </div>
                          <div className="mt-0.5 text-[10px] font-medium text-white/45">Tap to browse</div>
                          <p className="mt-1.5 text-[9px] leading-snug text-white/40">
                            This is what players will see — 1080×1350px recommended
                          </p>
                        </div>
                      </div>
                      <input
                        id={`png-${card.id}`}
                        type="file"
                        accept="image/png,image/jpeg"
                        className="sr-only"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (f && isRasterGameImage(f)) setCardRasterImage(card.id, f);
                        }}
                      />
                    </label>
                  </div>

                  <div className="h-px bg-gradient-to-r from-transparent via-violet-500/20 to-transparent" />

                  <div className="space-y-2 px-2.5 pb-2 pt-1.5">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-violet-300/75">
                        Step 2 · Details
                      </span>
                      <div className="flex flex-wrap justify-end gap-1">
                        {missingGameImage ? (
                          <span className="rounded-md border border-orange-400/35 bg-orange-500/15 px-1.5 py-0.5 text-[9px] font-bold text-orange-200">
                            Game image required
                          </span>
                        ) : null}
                        {missingLayerCount ? (
                          <span className="rounded-md border border-red-400/35 bg-red-500/15 px-1.5 py-0.5 text-[9px] font-bold text-red-200">
                            Layer count required
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-semibold uppercase tracking-wide text-white/55">
                        Layer count
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={card.layer_count}
                        onChange={(e) =>
                          updateCard(card.id, {
                            layer_count: e.target.value,
                            layerCountHint: "none",
                          })
                        }
                        className="mt-0.5 w-full rounded-lg border border-white/15 bg-black/45 px-2.5 py-1.5 text-sm text-white outline-none focus:border-violet-400/50"
                      />
                      {card.layerCountHint === "psd-auto" ? (
                        <div className="mt-0.5 text-[10px] font-semibold text-emerald-400">
                          Auto-detected (visible layers only)
                        </div>
                      ) : null}
                      {card.layerCountHint === "psd-failed" ? (
                        <div className="mt-0.5 text-[10px] text-white/45">Could not auto-detect — enter manually</div>
                      ) : null}
                      <p className="mt-1 text-[10px] italic text-white/45">
                        {layerCountGuidanceForSoftware(card.software)}
                      </p>
                    </div>

                    <div>
                      <label className="text-[10px] font-semibold uppercase tracking-wide text-white/55">Title</label>
                      <input
                        type="text"
                        value={card.title}
                        onChange={(e) => updateCard(card.id, { title: e.target.value })}
                        className="mt-0.5 w-full rounded-lg border border-white/15 bg-black/45 px-2.5 py-1.5 text-sm text-white outline-none focus:border-violet-400/50"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold uppercase tracking-wide text-white/55">
                        Creator name
                      </label>
                      <CreatorAutocompleteInput
                        value={card.creator_name}
                        onChange={(next) =>
                          updateCard(card.id, {
                            creator_name: normalizeUsernameForStorage(next),
                          })
                        }
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-semibold uppercase tracking-wide text-white/55">
                          Software
                        </label>
                        <select
                          value={card.software}
                          onChange={(e) =>
                            updateCard(card.id, {
                              software: e.target.value as SoftwareOption,
                            })
                          }
                          className="mt-0.5 w-full rounded-lg border border-white/15 bg-black/45 px-2 py-1.5 text-xs text-white outline-none focus:border-violet-400/50"
                        >
                          {SOFTWARE_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold uppercase tracking-wide text-white/55">
                          Category
                        </label>
                        <select
                          value={card.category}
                          onChange={(e) =>
                            updateCard(card.id, {
                              category: e.target.value as (typeof CATEGORY_OPTIONS)[number],
                            })
                          }
                          className="mt-0.5 w-full rounded-lg border border-white/15 bg-black/45 px-2 py-1.5 text-xs text-white outline-none focus:border-violet-400/50"
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
                      <label className="text-[10px] font-semibold uppercase tracking-wide text-white/55">
                        Schedule position
                      </label>
                      <div className="mt-0.5 rounded-lg border border-violet-500/25 bg-violet-950/40 px-2.5 py-1.5 text-sm font-semibold tabular-nums text-violet-100">
                        {pos}
                        <span className="ml-1.5 text-[10px] font-normal text-white/40">(batch slot)</span>
                      </div>
                    </div>

                    <div>
                      <label className="flex cursor-pointer items-center justify-between gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-white/55">
                          Sponsored
                        </span>
                        <span
                          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition ${
                            card.is_sponsored
                              ? "border-violet-400 bg-violet-600/70"
                              : "border-white/20 bg-white/10"
                          }`}
                        >
                          <span
                            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition ${
                              card.is_sponsored ? "translate-x-4" : "translate-x-1"
                            }`}
                          />
                        </span>
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={card.is_sponsored}
                          onChange={(e) => updateCard(card.id, { is_sponsored: e.target.checked })}
                        />
                      </label>
                    </div>
                    <div
                      className={`overflow-hidden transition-all duration-300 ${
                        card.is_sponsored ? "max-h-20 opacity-100" : "max-h-0 opacity-0"
                      }`}
                    >
                      <label className="text-[10px] font-semibold uppercase tracking-wide text-white/55">
                        Sponsor name
                      </label>
                      <input
                        type="text"
                        value={card.sponsor_name}
                        onChange={(e) => updateCard(card.id, { sponsor_name: e.target.value })}
                        className="mt-0.5 w-full rounded-lg border border-white/15 bg-black/45 px-2.5 py-1.5 text-sm text-white outline-none focus:border-violet-400/50"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeCard(card.id)}
                      className="w-full rounded-lg border border-red-400/35 bg-red-500/10 px-2 py-1.5 text-[11px] font-semibold text-red-200 hover:bg-red-500/20"
                    >
                      Remove card
                    </button>
                  </div>
                </div>
              );
            })}
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
            Uploading file {Math.min(progressStep, cards.length)} of {cards.length}...
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


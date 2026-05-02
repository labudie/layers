"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import {
  buildPairSpecs,
  cleanUploadQueueTitleFromStem,
  isPsdFile,
  isRasterGameImage,
  type FilePairSpec,
} from "@/lib/asset-pairing";
import {
  difficultyBadgeClass,
  difficultyFromLayerCount,
} from "@/lib/asset-difficulty";
import { CATEGORY_OPTIONS, type CategoryOption } from "@/lib/challenge-categories";
import { parsePsdLayerCount } from "@/lib/psd-layer-count";
import { SOFTWARE_OPTIONS, type SoftwareOption } from "@/lib/software-options";
import { CreatorAutocompleteInput } from "@/app/studio/AdminChallengeFormClient";
import {
  approveSubmissionToAssetAction,
  confirmAutoScheduleAction,
  confirmReconfigureScheduleAction,
  getDefaultUnscheduleFutureDateRangeAction,
  insertReadyAssetAction,
  insertReadyAssetsBatchAction,
  previewAutoScheduleAction,
  previewReconfigureScheduleAction,
  previewUnscheduleFutureChallengesInRangeAction,
  publishScheduledDayAction,
  rejectSubmissionAction,
  revalidateStudioAssetsCachesAction,
  scheduleAssetAction,
  unscheduleAssetAction,
  unscheduleFutureChallengeByIdAction,
  updateAssetAction,
  type AssetUpsertFields,
  type AutoSchedulePreviewRow,
  type ReconfigurePreviewRow,
} from "@/app/studio/assets/actions";

export type AssetRow = {
  id: string;
  title: string;
  creator_name: string | null;
  software: string;
  category: string;
  layer_count: number;
  is_sponsored: boolean;
  sponsor_name: string | null;
  image_url: string | null;
  status: "draft" | "ready" | "scheduled" | "published";
  scheduled_date: string | null;
  scheduled_position: number | null;
  challenge_id: string | null;
  source?: "admin" | "community" | null;
  submission_id?: number | null;
  uploaded_by?: string | null;
};

export type PendingSubmissionRow = {
  id: number;
  user_id: string;
  username: string | null;
  title: string;
  creator_name: string;
  software: string;
  category: string;
  layer_count: number;
  image_url: string;
  is_sponsored: boolean;
  sponsor_name: string;
  created_at: string;
};

type MobilePanel = "assets" | "calendar";
type LeftTab = "ready" | "pending";
type ReadyFilter =
  | "all"
  | "Easy"
  | "Medium"
  | "Medium-Hard"
  | "Hard"
  | "Expert"
  | "my"
  | "community";

type DraftPairLocal = {
  key: string;
  spec: FilePairSpec;
  previewUrl: string | null;
  layerCount: number | null;
  title: string;
  creator_name: string;
  software: SoftwareOption;
  category: CategoryOption;
  layer_count: string;
  is_sponsored: boolean;
  sponsor_name: string;
  uploadProgress: number;
  uploadPhase: "idle" | "uploading" | "saving" | "done" | "error";
  errorText: string | null;
  successText: string | null;
  /** When true, batch creator updates skip this row until "Apply to all" is toggled on again. */
  creatorDetachedFromBatch?: boolean;
  /** When true, batch software updates skip this row until "Apply to all" is toggled on again. */
  softwareDetachedFromBatch?: boolean;
  /** PSD layer-count phase for draft queue UI (ingest only). */
  psdParseStatus?: "counting" | "ready" | "error";
  suggestTitleLoading?: boolean;
  titleAiSuggested?: boolean;
  suggestTitleError?: string;
};

const BATCH_SOFTWARE_OPTIONS: SoftwareOption[] = [
  "Photoshop",
  "Illustrator",
  "After Effects",
  "Figma",
  "Other",
];

const SOFTWARE_ICONS: Record<string, string> = {
  Photoshop: "Ps",
  Illustrator: "Ai",
  Figma: "F",
  Procreate: "Pr",
  Canva: "Cv",
  "After Effects": "Ae",
  "Cinema 4D": "C4",
  "Affinity Designer": "Ad",
  Other: "•",
};
const SLOT_LABELS = [
  "Slot 1 · Easy",
  "Slot 2 · Medium",
  "Slot 3 · Medium-Hard",
  "Slot 4 · Hard",
  "Slot 5 · Expert",
] as const;

/** Calendar day-cell markers by scheduled slot position (1–5). */
function calendarSlotDotColor(position1Based: number): string {
  switch (position1Based) {
    case 1:
      return "#10b981";
    case 2:
      return "#3b82f6";
    case 3:
      return "#f59e0b";
    case 4:
      return "#ef4444";
    case 5:
      return "#a855f7";
    default:
      return "#6b7280";
  }
}

const STUDIO_INGEST_PURPLE_GRADIENT = "linear-gradient(90deg, #7c3aed, #a855f7)";

const SUGGEST_TITLE_BTN_STYLE: CSSProperties = {
  padding: "4px 8px",
  borderRadius: 6,
  background: "#7c3aed22",
  border: "0.5px solid #7c3aed44",
  color: "#a855f7",
  fontSize: 10,
  fontWeight: 500,
};

async function rasterFileToImageBase64(file: File): Promise<{ imageBase64: string; mediaType: string }> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  let mediaType = file.type?.startsWith("image/") ? file.type : "image/png";
  if (mediaType === "image/jpg") mediaType = "image/jpeg";
  return { imageBase64: btoa(binary), mediaType };
}

function toYmd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthMatrix(year: number, month0: number): (Date | null)[][] {
  const first = new Date(year, month0, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month0, d));
  while (cells.length % 7 !== 0) cells.push(null);
  while (cells.length < 42) cells.push(null);
  const rows: (Date | null)[][] = [];
  for (let r = 0; r < cells.length / 7; r++) rows.push(cells.slice(r * 7, r * 7 + 7));
  return rows;
}

function DifficultyBadge({ layerCount }: { layerCount: number }) {
  const d = difficultyFromLayerCount(layerCount);
  return (
    <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${difficultyBadgeClass(d)}`}>
      {d}
    </span>
  );
}

function assetDraftStoragePath(safeTitle: string, ext: "png" | "jpg") {
  return `asset-ready/${crypto.randomUUID()}-${safeTitle || "asset"}.${ext}`;
}

function todayYmdEastern() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function addDaysToYmd(ymd: string, days: number) {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthBoundsYmd(year: number, month0: number): { start: string; end: string } {
  const cells = monthMatrix(year, month0)
    .flat()
    .filter((c): c is Date => c != null);
  if (cells.length === 0) {
    const t = todayYmdEastern();
    return { start: t, end: t };
  }
  const tms = cells.map((c) => c.getTime());
  const min = new Date(Math.min(...tms));
  const max = new Date(Math.max(...tms));
  return { start: toYmd(min), end: toYmd(max) };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const debounce = (fn: (...args: any[]) => void, ms: number) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (...args: any[]) => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
};

const ReadyAssetCard = memo(function ReadyAssetCard({
  asset: a,
  isDragging,
  onSelect,
  onDragStart,
  onDragEnd,
}: {
  asset: AssetRow;
  isDragging: boolean;
  onSelect: (asset: AssetRow) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
}) {
  return (
    <button
      type="button"
      draggable
      onDragStart={() => onDragStart(a.id)}
      onDragEnd={onDragEnd}
      onClick={() => onSelect(a)}
      title="Drag to schedule"
      style={
        a.is_sponsored
          ? {
              border: "0.5px solid rgba(251, 191, 36, 0.4)",
              background: "rgba(251, 191, 36, 0.04)",
            }
          : undefined
      }
      className={`group relative flex items-center gap-2 rounded-xl p-2 text-left transition-[transform,box-shadow,opacity,border-color] duration-200 [transition-timing-function:cubic-bezier(0.4,0,0.2,1)] ${
        a.is_sponsored
          ? "hover:bg-[rgba(251,191,36,0.07)]"
          : "border border-white/10 bg-black/25 hover:bg-black/35"
      } ${
        isDragging
          ? "scale-105 rotate-2 shadow-[0_10px_24px_rgba(124,58,237,0.25)]"
          : "hover:shadow-[0_0_0_1px_rgba(124,58,237,0.5),0_0_18px_rgba(124,58,237,0.25)]"
      }`}
    >
      {a.is_sponsored ? (
        <span
          className="pointer-events-none absolute top-1.5 right-2 z-[2] leading-none"
          style={{
            background: "rgba(251, 191, 36, 0.15)",
            color: "#fbbf24",
            border: "0.5px solid rgba(251, 191, 36, 0.3)",
            fontSize: 9,
            fontWeight: 600,
            padding: "2px 7px",
            borderRadius: 20,
          }}
        >
          Sponsored
        </span>
      ) : null}
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-black/40">
        {a.image_url ? (
          <Image
            src={a.image_url}
            alt=""
            fill
            className="object-cover"
            sizes="56px"
            unoptimized
            loading="lazy"
          />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <p className="truncate text-sm font-semibold text-white">{a.title}</p>
          <span className="rounded bg-white/10 px-1 text-[10px] text-white/70">{SOFTWARE_ICONS[a.software] ?? "•"}</span>
        </div>
        <p className="truncate text-xs text-white/60">@{a.creator_name || "creator"}</p>
        <div className="mt-0.5 flex items-center gap-2">
          <DifficultyBadge layerCount={a.layer_count} />
          <span className="text-[10px] text-white/45">{a.layer_count} layers</span>
        </div>
      </div>
      <span className="pointer-events-none absolute -top-2 right-2 rounded bg-[#7c3aed] px-1.5 py-0.5 text-[10px] font-semibold text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        Drag to schedule
      </span>
    </button>
  );
});

const DraftQueueRow = memo(function DraftQueueRow({
  row,
  onPatch,
  onSaveReadyPair,
  runSuggestTitle,
}: {
  row: DraftPairLocal;
  onPatch: (key: string, partial: Partial<DraftPairLocal>) => void;
  onSaveReadyPair: (row: DraftPairLocal) => void;
  runSuggestTitle: (row: DraftPairLocal) => void;
}) {
  const [titleInput, setTitleInput] = useState(row.title);
  const [layerInput, setLayerInput] = useState(row.layer_count);

  useEffect(() => {
    setTitleInput(row.title);
  }, [row.title, row.key]);

  useEffect(() => {
    setLayerInput(row.layer_count);
  }, [row.layer_count, row.key]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (titleInput !== row.title) {
        onPatch(row.key, { title: titleInput, titleAiSuggested: false });
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [titleInput, row.title, row.key, onPatch]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (layerInput !== row.layer_count) {
        onPatch(row.key, { layer_count: layerInput });
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [layerInput, row.layer_count, row.key, onPatch]);

  const hasPsd = Boolean(row.spec.psd);
  const parseStatus = row.psdParseStatus ?? "ready";
  const statusIsCounting = hasPsd && parseStatus === "counting";
  const statusIsError = hasPsd && parseStatus === "error";

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-white/10 bg-black/25">
      <div className="flex gap-3 p-3">
        <div className="relative h-20 w-24 shrink-0 overflow-hidden rounded-lg bg-black/40">
          {row.previewUrl ? (
            <Image
              src={row.previewUrl}
              alt=""
              fill
              className="object-cover"
              sizes="96px"
              unoptimized
              loading="lazy"
            />
          ) : null}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              className="min-w-0 flex-1 rounded border border-white/10 bg-black/30 px-2 py-1 text-sm text-white"
              value={titleInput}
              onChange={(e) => {
                const v = e.target.value;
                setTitleInput(v);
                if (row.titleAiSuggested) onPatch(row.key, { titleAiSuggested: false });
              }}
            />
            {row.titleAiSuggested ? (
              <span className="shrink-0 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                ✨ AI suggested
              </span>
            ) : null}
            <button
              type="button"
              style={SUGGEST_TITLE_BTN_STYLE}
              className="inline-flex shrink-0 items-center justify-center gap-1 disabled:opacity-45"
              disabled={!row.spec.raster || Boolean(row.suggestTitleLoading)}
              onClick={() => void runSuggestTitle(row)}
            >
              {row.suggestTitleLoading ? (
                <span
                  className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent opacity-90"
                  aria-hidden
                />
              ) : (
                "✨ Suggest title"
              )}
            </button>
          </div>
          {row.suggestTitleError ? (
            <p className="text-[10px] text-red-300/95">{row.suggestTitleError}</p>
          ) : null}
          <CreatorAutocompleteInput
            value={row.creator_name}
            onChange={(v) =>
              onPatch(row.key, { creator_name: v, creatorDetachedFromBatch: true })
            }
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              className="rounded border border-white/10 bg-black/30 px-2 py-1 text-xs text-white"
              value={row.software}
              onChange={(e) =>
                onPatch(row.key, {
                  software: e.target.value as SoftwareOption,
                  softwareDetachedFromBatch: true,
                })
              }
            >
              {SOFTWARE_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            <input
              className="rounded border border-white/10 bg-black/30 px-2 py-1 text-xs text-white"
              value={layerInput}
              onChange={(e) => setLayerInput(e.target.value)}
              placeholder="Layer count"
            />
          </div>
          <button
            type="button"
            onClick={() =>
              void onSaveReadyPair({ ...row, title: titleInput, layer_count: layerInput })
            }
            className="rounded bg-[#7c3aed] px-2 py-1 text-xs font-bold text-white"
          >
            Save Ready
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-white/[0.06] px-3 py-2 text-xs text-white/75">
        {statusIsCounting ? (
          <>
            <span
              className="studio-ingest-dot--pulse inline-block h-2 w-2 shrink-0 rounded-full bg-[#f59e0b]"
              aria-hidden
            />
            <span>Counting layers...</span>
          </>
        ) : statusIsError ? (
          <>
            <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#ef4444]" aria-hidden />
            <span>Error</span>
          </>
        ) : (
          <>
            <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#10b981]" aria-hidden />
            <span>Ready</span>
          </>
        )}
      </div>
      {statusIsCounting ? (
        <div className="relative h-[3px] w-full overflow-hidden bg-[#ffffff10]">
          <div
            className="studio-ingest-bar--sweep absolute inset-y-0 w-[38%] rounded-[20px]"
            style={{ background: STUDIO_INGEST_PURPLE_GRADIENT }}
          />
        </div>
      ) : null}
    </div>
  );
});

const PendingReviewRow = memo(function PendingReviewRow({
  s,
  onRemoved,
  onApproveRefresh,
}: {
  s: PendingSubmissionRow;
  onRemoved: (id: number) => void;
  onApproveRefresh: () => void;
}) {
  const [rejectNote, setRejectNote] = useState("");
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 p-2">
      <div className="flex gap-2">
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-black/40">
          {s.image_url ? (
            <Image
              src={s.image_url}
              alt=""
              fill
              className="object-cover"
              sizes="56px"
              unoptimized
              loading="lazy"
            />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{s.title}</p>
          <p className="truncate text-xs text-white/60">@{s.username || s.creator_name || "creator"}</p>
          <div className="mt-0.5 flex items-center gap-2">
            <DifficultyBadge layerCount={s.layer_count} />
            <span className="text-[10px] text-white/45">{s.software}</span>
          </div>
        </div>
      </div>
      <input
        className="mt-2 w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-xs text-white"
        placeholder="Optional rejection note"
        value={rejectNote}
        onChange={(e) => setRejectNote(e.target.value)}
      />
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          className="rounded bg-emerald-600 px-2 py-1 text-xs font-bold text-white"
          onClick={async () => {
            const r = await approveSubmissionToAssetAction(s.id);
            if (!r.ok) window.alert(r.error);
            else {
              onRemoved(s.id);
              onApproveRefresh();
            }
          }}
        >
          Approve
        </button>
        <button
          type="button"
          className="rounded border border-red-400/40 px-2 py-1 text-xs font-bold text-red-200"
          onClick={async () => {
            const r = await rejectSubmissionAction(s.id, rejectNote);
            if (!r.ok) window.alert(r.error);
            else onRemoved(s.id);
          }}
        >
          Reject
        </button>
      </div>
    </div>
  );
});

export function AssetLibraryClient({
  initialAssets,
  pendingSubmissions,
  adminUserId,
  showBackLink = true,
  liveCountsByDate,
  liveChallengeIdByDatePosition,
}: {
  initialAssets: AssetRow[];
  pendingSubmissions: PendingSubmissionRow[];
  adminUserId: string;
  showBackLink?: boolean;
  liveCountsByDate: Record<string, number>;
  liveChallengeIdByDatePosition: Record<string, Record<number, string>>;
}) {
  const router = useRouter();
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("assets");
  const [leftTab, setLeftTab] = useState<LeftTab>("ready");
  const [assets, setAssets] = useState(initialAssets);
  const [pending, setPending] = useState(pendingSubmissions);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [viewMonth, setViewMonth] = useState(() => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() };
  });
  const [readyFilter, setReadyFilter] = useState<ReadyFilter>("all");
  const [readySearchInput, setReadySearchInput] = useState("");
  const [readySearch, setReadySearch] = useState("");
  const [readyVisibleCount, setReadyVisibleCount] = useState(20);
  const applyReadySearchDebounced = useMemo(() => debounce((q: string) => setReadySearch(q), 300), []);
  const [draftPairs, setDraftPairs] = useState<DraftPairLocal[]>([]);
  const [editAsset, setEditAsset] = useState<AssetRow | null>(null);
  const [dragAssetId, setDragAssetId] = useState<string | null>(null);
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);
  const [slotPopKey, setSlotPopKey] = useState<string | null>(null);
  const [publishBusy, setPublishBusy] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [liveCounts, setLiveCounts] = useState(liveCountsByDate);
  const [liveChallengeMap, setLiveChallengeMap] = useState(liveChallengeIdByDatePosition);
  const [saveAllBusy, setSaveAllBusy] = useState(false);
  const [autoScheduleOpen, setAutoScheduleOpen] = useState(false);
  const [autoScheduleStartDate, setAutoScheduleStartDate] = useState(todayYmdEastern());
  const [autoScheduleEndDate, setAutoScheduleEndDate] = useState(addDaysToYmd(todayYmdEastern(), 14));
  const [autoSchedulePreviewBusy, setAutoSchedulePreviewBusy] = useState(false);
  const [autoScheduleConfirmBusy, setAutoScheduleConfirmBusy] = useState(false);
  const [autoSchedulePreview, setAutoSchedulePreview] = useState<AutoSchedulePreviewRow[]>([]);
  const [autoScheduleUnplaced, setAutoScheduleUnplaced] = useState<Array<{ id: string; title: string }>>([]);
  const [reconfigureOpen, setReconfigureOpen] = useState(false);
  const [reconfigureStartDate, setReconfigureStartDate] = useState(todayYmdEastern());
  const [reconfigureEndDate, setReconfigureEndDate] = useState(todayYmdEastern());
  const [reconfigureOnlyIncompleteDays, setReconfigureOnlyIncompleteDays] = useState(true);
  const [reconfigureRespectTiers, setReconfigureRespectTiers] = useState(true);
  const [reconfigurePreviewBusy, setReconfigurePreviewBusy] = useState(false);
  const [reconfigureConfirmBusy, setReconfigureConfirmBusy] = useState(false);
  const [reconfigureTableRows, setReconfigureTableRows] = useState<ReconfigurePreviewRow[]>([]);
  const [reconfigureAssignments, setReconfigureAssignments] = useState<AutoSchedulePreviewRow[]>([]);
  const [reconfigureGapsFilled, setReconfigureGapsFilled] = useState(0);
  const [reconfigureGapsUnfillable, setReconfigureGapsUnfillable] = useState(0);
  const [goLiveAllProgress, setGoLiveAllProgress] = useState<{ current: number; total: number } | null>(
    null,
  );
  const [unscheduleAllOpen, setUnscheduleAllOpen] = useState(false);
  const [unscheduleAllStart, setUnscheduleAllStart] = useState(todayYmdEastern());
  const [unscheduleAllEnd, setUnscheduleAllEnd] = useState(todayYmdEastern());
  const [unscheduleAllSummary, setUnscheduleAllSummary] = useState<{
    count: number;
    days: number;
  } | null>(null);
  const [unscheduleAllConfirmBusy, setUnscheduleAllConfirmBusy] = useState(false);
  const [unscheduleAllProgress, setUnscheduleAllProgress] = useState<{ current: number; total: number } | null>(
    null,
  );
  const [batchCreatorName, setBatchCreatorName] = useState("");
  const [batchSoftware, setBatchSoftware] = useState<SoftwareOption>("Photoshop");
  const [applyCreatorToAll, setApplyCreatorToAll] = useState(false);
  const [applySoftwareToAll, setApplySoftwareToAll] = useState(false);
  const [batchIngestProgress, setBatchIngestProgress] = useState<{
    total: number;
    complete: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setReadyVisibleCount(20);
  }, [readyFilter, readySearch]);

  useEffect(() => {
    setAssets(initialAssets);
  }, [initialAssets]);

  useEffect(() => {
    setLiveCounts(liveCountsByDate);
  }, [liveCountsByDate]);

  useEffect(() => {
    setLiveChallengeMap(liveChallengeIdByDatePosition);
  }, [liveChallengeIdByDatePosition]);

  useEffect(() => {
    if (!unscheduleAllOpen) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      void (async () => {
        const p = await previewUnscheduleFutureChallengesInRangeAction(
          unscheduleAllStart,
          unscheduleAllEnd,
        );
        if (cancelled) return;
        if (!p.ok) {
          setUnscheduleAllSummary(null);
          return;
        }
        setUnscheduleAllSummary({
          count: p.challengeCount ?? 0,
          days: p.distinctDayCount ?? 0,
        });
      })();
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [unscheduleAllOpen, unscheduleAllStart, unscheduleAllEnd]);

  const patchDraftRow = useCallback((key: string, partial: Partial<DraftPairLocal>) => {
    setDraftPairs((list) => list.map((r) => (r.key === key ? { ...r, ...partial } : r)));
  }, []);

  const runSuggestTitle = useCallback(async (row: DraftPairLocal) => {
    const raster = row.spec.raster;
    if (!raster || row.suggestTitleLoading) return;
    setDraftPairs((list) =>
      list.map((r) =>
        r.key === row.key ? { ...r, suggestTitleLoading: true, suggestTitleError: undefined } : r,
      ),
    );
    try {
      const { imageBase64, mediaType } = await rasterFileToImageBase64(raster);
      const res = await fetch("/api/suggest-title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64, mediaType }),
      });
      const data = (await res.json()) as { title?: unknown };
      const title =
        typeof data.title === "string" && data.title.trim().length > 0 ? data.title.trim() : null;
      if (!res.ok || !title) throw new Error("bad response");
      setDraftPairs((list) =>
        list.map((r) =>
          r.key === row.key
            ? {
                ...r,
                title,
                suggestTitleLoading: false,
                titleAiSuggested: true,
                suggestTitleError: undefined,
              }
            : r,
        ),
      );
    } catch {
      setDraftPairs((list) =>
        list.map((r) =>
          r.key === row.key
            ? { ...r, suggestTitleLoading: false, suggestTitleError: "Could not suggest title" }
            : r,
        ),
      );
      window.setTimeout(() => {
        setDraftPairs((list) =>
          list.map((r) => (r.key === row.key ? { ...r, suggestTitleError: undefined } : r)),
        );
      }, 3000);
    }
  }, []);

  const handleReadySelect = useCallback((a: AssetRow) => {
    setEditAsset(a);
  }, []);

  const handleReadyDragStart = useCallback((id: string) => {
    setDragAssetId(id);
    setDraggingCardId(id);
  }, []);

  const handleReadyDragEnd = useCallback(() => {
    setDraggingCardId(null);
    setDragOverSlot(null);
  }, []);

  const handlePendingRemoved = useCallback((id: number) => {
    setPending((list) => list.filter((x) => x.id !== id));
  }, []);

  const refreshAfterApprove = useCallback(() => {
    router.refresh();
  }, [router]);

  const scheduledByDate = useMemo(() => {
    const counts: Record<string, number> = {};
    const slots: Record<string, (AssetRow | null)[]> = {};
    for (const a of assets) {
      if (a.status !== "scheduled" || !a.scheduled_date) continue;
      counts[a.scheduled_date] = (counts[a.scheduled_date] ?? 0) + 1;
      if (!slots[a.scheduled_date]) slots[a.scheduled_date] = [null, null, null, null, null];
      const idx = (a.scheduled_position ?? 1) - 1;
      if (idx >= 0 && idx < 5) slots[a.scheduled_date][idx] = a;
    }
    return { counts, slots };
  }, [assets]);

  const readyPool = useMemo(() => {
    return assets
      .filter((a) => a.status === "ready")
      .filter((a) => {
        const d = difficultyFromLayerCount(a.layer_count);
        const q = readySearch.trim().toLowerCase();
        if (
          readyFilter === "Easy" ||
          readyFilter === "Medium" ||
          readyFilter === "Medium-Hard" ||
          readyFilter === "Hard" ||
          readyFilter === "Expert"
        ) {
          if (d !== readyFilter) return false;
        }
        if (readyFilter === "my" && a.uploaded_by !== adminUserId) return false;
        if (readyFilter === "community" && a.source !== "community") return false;
        if (q) {
          const t = (a.title ?? "").toLowerCase();
          const c = (a.creator_name ?? "").toLowerCase();
          if (!t.includes(q) && !c.includes(q)) return false;
        }
        return true;
      });
  }, [assets, readyFilter, readySearch, adminUserId]);

  const readyPoolVisible = useMemo(
    () => readyPool.slice(0, readyVisibleCount),
    [readyPool, readyVisibleCount],
  );

  const matrix = monthMatrix(viewMonth.y, viewMonth.m);
  const readyAssetCount = assets.filter((a) => a.status === "ready").length;
  const monthLabel = new Date(viewMonth.y, viewMonth.m, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const selectedSlots = selectedDate && scheduledByDate.slots[selectedDate]
    ? scheduledByDate.slots[selectedDate]
    : [null, null, null, null, null];

  const goLiveAllEligibleDates = useMemo(() => {
    const today = todayYmdEastern();
    const countByDate = new Map<string, number>();
    for (const a of assets) {
      if (a.status !== "scheduled" || !a.scheduled_date) continue;
      countByDate.set(a.scheduled_date, (countByDate.get(a.scheduled_date) ?? 0) + 1);
    }
    const dates: string[] = [];
    for (const [date, n] of countByDate.entries()) {
      if (n !== 5) continue;
      if (date < today) continue;
      const liveN = liveCounts[date] ?? 0;
      if (liveN >= 5) continue;
      dates.push(date);
    }
    dates.sort();
    return dates;
  }, [assets, liveCounts]);

  const calendarMonthStats = useMemo(() => {
    const m = monthMatrix(viewMonth.y, viewMonth.m);
    let full = 0;
    let incomplete = 0;
    let empty = 0;
    for (const cell of m.flat()) {
      if (!cell) continue;
      const ymd = toYmd(cell);
      const c = scheduledByDate.counts[ymd] ?? 0;
      if (c === 5) full += 1;
      else if (c === 0) empty += 1;
      else incomplete += 1;
    }
    return { full, incomplete, empty };
  }, [viewMonth.y, viewMonth.m, scheduledByDate.counts]);

  const ingestFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((f) => isRasterGameImage(f) || isPsdFile(f)).slice(0, 50);
    const specs = buildPairSpecs(files);
    const rasterSpecs = specs.filter((s) => s.raster);
    if (rasterSpecs.length === 0) {
      setDraftPairs([]);
      setBatchIngestProgress(null);
      return;
    }

    setBatchIngestProgress({ total: rasterSpecs.length, complete: 0 });
    setDraftPairs([]);

    for (let i = 0; i < rasterSpecs.length; i++) {
      const spec = rasterSpecs[i];
      const previewUrl = URL.createObjectURL(spec.raster!);

      if (!spec.psd) {
        const row: DraftPairLocal = {
          key: spec.key,
          spec,
          previewUrl,
          layerCount: null,
          title: cleanUploadQueueTitleFromStem(spec.displayStem),
          creator_name: "",
          software: "Photoshop",
          category: CATEGORY_OPTIONS[0],
          layer_count: "",
          is_sponsored: false,
          sponsor_name: "",
          uploadProgress: 0,
          uploadPhase: "idle",
          errorText: null,
          successText: null,
          psdParseStatus: "ready",
        };
        setDraftPairs((prev) => [...prev, row]);
        setBatchIngestProgress({ total: rasterSpecs.length, complete: i + 1 });
        continue;
      }

      const countingRow: DraftPairLocal = {
        key: spec.key,
        spec,
        previewUrl,
        layerCount: null,
        title: cleanUploadQueueTitleFromStem(spec.displayStem),
        creator_name: "",
        software: "Photoshop",
        category: CATEGORY_OPTIONS[0],
        layer_count: "",
        is_sponsored: false,
        sponsor_name: "",
        uploadProgress: 0,
        uploadPhase: "idle",
        errorText: null,
        successText: null,
        psdParseStatus: "counting",
      };
      setDraftPairs((prev) => [...prev, countingRow]);

      let layerCount: number | null = null;
      let psdError: string | null = null;
      try {
        const buf = await spec.psd.arrayBuffer();
        layerCount = parsePsdLayerCount(buf);
        if (layerCount == null) {
          psdError = `Could not read layer count from ${spec.psd.name}.`;
        }
      } catch {
        psdError = `PSD parse failed (${spec.psd.name}).`;
        layerCount = null;
      }

      const psdParseStatus: "ready" | "error" = psdError ? "error" : "ready";
      setDraftPairs((prev) =>
        prev.map((r) =>
          r.key === spec.key
            ? {
                ...r,
                layerCount,
                layer_count: layerCount != null ? String(layerCount) : "",
                errorText: psdError,
                psdParseStatus,
              }
            : r,
        ),
      );
      setBatchIngestProgress({ total: rasterSpecs.length, complete: i + 1 });
    }

    setDraftPairs((prev) => {
      let rows = prev;
      if (applyCreatorToAll) {
        rows = rows.map((r) => ({
          ...r,
          creator_name: batchCreatorName,
          creatorDetachedFromBatch: false,
        }));
      }
      if (applySoftwareToAll) {
        rows = rows.map((r) => ({
          ...r,
          software: batchSoftware,
          softwareDetachedFromBatch: false,
        }));
      }
      return rows;
    });
    setBatchIngestProgress(null);
  };

  const saveReadyPair = useCallback(async (row: DraftPairLocal) => {
    if (!row.spec.raster) return;
    const layerCount = Number(row.layer_count);
    if (!row.title.trim() || !Number.isFinite(layerCount)) return;

    const safeTitle = row.title.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-_]/g, "").slice(0, 80);
    const storagePath = assetDraftStoragePath(safeTitle, row.spec.raster.type === "image/jpeg" ? "jpg" : "png");
    const sb = supabase();
    const { error: uploadErr } = await sb.storage.from("challenge-images").upload(storagePath, row.spec.raster, {
      contentType: row.spec.raster.type || "image/png",
      upsert: true,
    });
    if (uploadErr) return;
    const { data: pub } = sb.storage.from("challenge-images").getPublicUrl(storagePath);
    if (!pub?.publicUrl) return;
    const payload: AssetUpsertFields = {
      title: row.title.trim(),
      creator_name: row.creator_name.trim(),
      software: row.software,
      category: row.category,
      layer_count: Math.trunc(layerCount),
      is_sponsored: row.is_sponsored,
      sponsor_name: row.sponsor_name.trim(),
      image_url: pub.publicUrl,
    };
    const res = await insertReadyAssetAction(payload);
    if (!res.ok) {
      setToast({ type: "error", text: res.error ?? "Failed to save asset." });
      return;
    }
    const newAsset: AssetRow = {
      id: res.id ?? `temp-${row.key}`,
      title: payload.title,
      creator_name: payload.creator_name || null,
      software: payload.software,
      category: payload.category,
      layer_count: payload.layer_count,
      is_sponsored: payload.is_sponsored,
      sponsor_name: payload.is_sponsored ? payload.sponsor_name || null : null,
      image_url: payload.image_url,
      status: "ready",
      scheduled_date: null,
      scheduled_position: null,
      challenge_id: null,
      source: "admin",
      uploaded_by: adminUserId || null,
      submission_id: null,
    };
    setAssets((prev) => [newAsset, ...prev]);
    setDraftPairs((list) => list.filter((r) => r.key !== row.key));
    setToast({ type: "success", text: "Saved to Ready." });
    window.setTimeout(() => setToast(null), 2200);
  }, [adminUserId]);

  const saveAllReadyPairs = async () => {
    if (draftPairs.length === 0) return;
    setSaveAllBusy(true);
    try {
      const sb = supabase();
      const payloads: AssetUpsertFields[] = [];
      const validKeys: string[] = [];
      for (const row of draftPairs) {
        if (!row.spec.raster) continue;
        const layerCount = Number(row.layer_count);
        if (!row.title.trim() || !Number.isFinite(layerCount)) continue;
        const safeTitle = row.title
          .toLowerCase()
          .trim()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9-_]/g, "")
          .slice(0, 80);
        const storagePath = assetDraftStoragePath(
          safeTitle,
          row.spec.raster.type === "image/jpeg" ? "jpg" : "png",
        );
        const { error: uploadErr } = await sb.storage
          .from("challenge-images")
          .upload(storagePath, row.spec.raster, {
            contentType: row.spec.raster.type || "image/png",
            upsert: true,
          });
        if (uploadErr) {
          setDraftPairs((prev) =>
            prev.map((r) =>
              r.key === row.key ? { ...r, errorText: uploadErr.message } : r,
            ),
          );
          continue;
        }
        const { data: pub } = sb.storage.from("challenge-images").getPublicUrl(storagePath);
        if (!pub?.publicUrl) {
          setDraftPairs((prev) =>
            prev.map((r) =>
              r.key === row.key
                ? { ...r, errorText: "Could not resolve image URL after upload." }
                : r,
            ),
          );
          continue;
        }
        payloads.push({
          title: row.title.trim(),
          creator_name: row.creator_name.trim(),
          software: row.software,
          category: row.category,
          layer_count: Math.trunc(layerCount),
          is_sponsored: row.is_sponsored,
          sponsor_name: row.sponsor_name.trim(),
          image_url: pub.publicUrl,
        });
        validKeys.push(row.key);
      }
      if (payloads.length === 0) {
        setToast({
          type: "error",
          text: "No uploads completed. Fix per-file errors on the cards above.",
        });
        return;
      }
      const res = await insertReadyAssetsBatchAction(payloads);
      if (!res.ok) {
        setToast({ type: "error", text: res.error ?? "Failed to save assets." });
        return;
      }
      const insertedIds = (res.inserted ?? []).map((r) => r.id);
      const newAssets: AssetRow[] = payloads.map((payload, idx) => ({
        id: insertedIds[idx] ?? `temp-${validKeys[idx] ?? idx}`,
        title: payload.title,
        creator_name: payload.creator_name || null,
        software: payload.software,
        category: payload.category,
        layer_count: payload.layer_count,
        is_sponsored: payload.is_sponsored,
        sponsor_name: payload.is_sponsored ? payload.sponsor_name || null : null,
        image_url: payload.image_url,
        status: "ready",
        scheduled_date: null,
        scheduled_position: null,
        challenge_id: null,
        source: "admin",
        uploaded_by: adminUserId || null,
        submission_id: null,
      }));
      setAssets((prev) => [...newAssets, ...prev]);
      setDraftPairs((list) => list.filter((row) => !validKeys.includes(row.key)));
      setToast({ type: "success", text: `${payloads.length} assets saved to Ready.` });
      window.setTimeout(() => setToast(null), 2400);
    } finally {
      setSaveAllBusy(false);
    }
  };

  const openAutoScheduleModal = () => {
    const todayEastern = todayYmdEastern();
    setAutoScheduleStartDate(todayEastern);
    setAutoScheduleEndDate(addDaysToYmd(todayEastern, 14));
    setAutoSchedulePreview([]);
    setAutoScheduleUnplaced([]);
    setAutoScheduleOpen(true);
  };

  const previewAutoSchedule = async () => {
    setAutoSchedulePreviewBusy(true);
    const result = await previewAutoScheduleAction(autoScheduleStartDate, autoScheduleEndDate);
    setAutoSchedulePreviewBusy(false);
    if (!result.ok) {
      setToast({ type: "error", text: result.error ?? "Preview failed." });
      window.setTimeout(() => setToast(null), 2600);
      return;
    }
    setAutoSchedulePreview(result.assignments ?? []);
    setAutoScheduleUnplaced(result.unplaced ?? []);
  };

  const confirmAutoSchedule = async () => {
    setAutoScheduleConfirmBusy(true);
    const result = await confirmAutoScheduleAction(autoScheduleStartDate, autoScheduleEndDate);
    setAutoScheduleConfirmBusy(false);
    if (!result.ok) {
      setToast({ type: "error", text: result.error ?? "Auto-schedule failed." });
      window.setTimeout(() => setToast(null), 2600);
      return;
    }
    const assignmentKeys = new Set(
      autoSchedulePreview.map((row) => `${row.asset_id}-${row.active_date}-${row.position}`),
    );
    setAssets((prev) =>
      prev.map((asset) => {
        const match = autoSchedulePreview.find((row) => row.asset_id === asset.id);
        if (!match || !assignmentKeys.has(`${match.asset_id}-${match.active_date}-${match.position}`)) {
          return asset;
        }
        return {
          ...asset,
          status: "scheduled",
          scheduled_date: match.active_date,
          scheduled_position: match.position,
        };
      }),
    );
    setAutoScheduleOpen(false);
    setAutoSchedulePreview([]);
    setAutoScheduleUnplaced([]);
    setToast({
      type: "success",
      text: `${result.scheduledCount ?? 0} assets auto-scheduled.`,
    });
    window.setTimeout(() => setToast(null), 2600);
  };

  const openReconfigureModal = () => {
    const { start, end } = monthBoundsYmd(viewMonth.y, viewMonth.m);
    setReconfigureStartDate(start);
    setReconfigureEndDate(end);
    setReconfigureOnlyIncompleteDays(true);
    setReconfigureRespectTiers(true);
    setReconfigureTableRows([]);
    setReconfigureAssignments([]);
    setReconfigureGapsFilled(0);
    setReconfigureGapsUnfillable(0);
    setReconfigureOpen(true);
  };

  const previewReconfigure = async () => {
    setReconfigurePreviewBusy(true);
    const r = await previewReconfigureScheduleAction(
      reconfigureStartDate,
      reconfigureEndDate,
      reconfigureOnlyIncompleteDays,
      reconfigureRespectTiers,
    );
    setReconfigurePreviewBusy(false);
    if (!r.ok) {
      window.alert(r.error ?? "Preview failed.");
      return;
    }
    setReconfigureTableRows(r.tableRows ?? []);
    setReconfigureAssignments(r.assignments ?? []);
    setReconfigureGapsFilled(r.gapsFilled ?? 0);
    setReconfigureGapsUnfillable(r.gapsUnfillable ?? 0);
  };

  const confirmReconfigure = async () => {
    setReconfigureConfirmBusy(true);
    const snapshot = reconfigureAssignments;
    const r = await confirmReconfigureScheduleAction(
      reconfigureStartDate,
      reconfigureEndDate,
      reconfigureOnlyIncompleteDays,
      reconfigureRespectTiers,
    );
    setReconfigureConfirmBusy(false);
    if (!r.ok) {
      window.alert(r.error ?? "Confirm failed.");
      return;
    }
    const assignmentKeys = new Set(
      snapshot.map((row) => `${row.asset_id}-${row.active_date}-${row.position}`),
    );
    setAssets((prev) =>
      prev.map((asset) => {
        const match = snapshot.find((row) => row.asset_id === asset.id);
        if (!match || !assignmentKeys.has(`${match.asset_id}-${match.active_date}-${match.position}`)) {
          return asset;
        }
        return {
          ...asset,
          status: "scheduled",
          scheduled_date: match.active_date,
          scheduled_position: match.position,
        };
      }),
    );
    setReconfigureOpen(false);
    setReconfigureTableRows([]);
    setReconfigureAssignments([]);
    setToast({
      type: "success",
      text: `${r.scheduledCount ?? 0} slot${(r.scheduledCount ?? 0) === 1 ? "" : "s"} filled from Ready.`,
    });
    window.setTimeout(() => setToast(null), 2600);
    router.refresh();
  };

  const runGoLiveAll = async () => {
    const dates = goLiveAllEligibleDates;
    if (dates.length === 0) return;
    if (
      !window.confirm(
        `Push ${dates.length} fully scheduled days live? This cannot be undone.`,
      )
    ) {
      return;
    }
    setGoLiveAllProgress({ current: 0, total: dates.length });
    for (let i = 0; i < dates.length; i++) {
      const d = dates[i]!;
      setGoLiveAllProgress({ current: i + 1, total: dates.length });
      const r = await publishScheduledDayAction(d);
      if (!r.ok) {
        window.alert(`${d}: ${r.error ?? "Failed to publish."}`);
        setGoLiveAllProgress(null);
        router.refresh();
        return;
      }
      setLiveChallengeMap((prev) => {
        const next = { ...prev };
        const cur = { ...(next[d] ?? {}) };
        for (let p = 1; p <= 5; p++) {
          if (!cur[p]) cur[p] = `live-${d}-${p}`;
        }
        next[d] = cur;
        return next;
      });
      setLiveCounts((prev) => ({ ...prev, [d]: 5 }));
    }
    setGoLiveAllProgress(null);
    setToast({
      type: "success",
      text: `${dates.length} day${dates.length === 1 ? "" : "s"} published.`,
    });
    window.setTimeout(() => setToast(null), 2800);
    router.refresh();
  };

  const openUnscheduleAllModal = async () => {
    const d = await getDefaultUnscheduleFutureDateRangeAction();
    if (!d.ok || !d.start || !d.end) {
      window.alert(d.error ?? "Could not load default date range.");
      return;
    }
    setUnscheduleAllStart(d.start);
    setUnscheduleAllEnd(d.end);
    setUnscheduleAllSummary(null);
    setUnscheduleAllOpen(true);
    const p = await previewUnscheduleFutureChallengesInRangeAction(d.start, d.end);
    if (p.ok) {
      setUnscheduleAllSummary({ count: p.challengeCount ?? 0, days: p.distinctDayCount ?? 0 });
    }
  };

  const runConfirmUnscheduleAll = async () => {
    const prev = await previewUnscheduleFutureChallengesInRangeAction(unscheduleAllStart, unscheduleAllEnd);
    if (!prev.ok) {
      window.alert(prev.error ?? "Preview failed.");
      return;
    }
    const ids = prev.challengeIds ?? [];
    if (ids.length === 0) {
      setUnscheduleAllOpen(false);
      return;
    }
    setUnscheduleAllConfirmBusy(true);
    for (let i = 0; i < ids.length; i++) {
      setUnscheduleAllProgress({ current: i + 1, total: ids.length });
      const r = await unscheduleFutureChallengeByIdAction(ids[i]!);
      if (!r.ok) {
        window.alert(r.error ?? "Unschedule failed.");
        setUnscheduleAllProgress(null);
        setUnscheduleAllConfirmBusy(false);
        void revalidateStudioAssetsCachesAction();
        router.refresh();
        return;
      }
    }
    await revalidateStudioAssetsCachesAction();
    setUnscheduleAllProgress(null);
    setUnscheduleAllConfirmBusy(false);
    setUnscheduleAllOpen(false);
    setToast({
      type: "success",
      text: `Unscheduled ${ids.length} challenge${ids.length === 1 ? "" : "s"}.`,
    });
    window.setTimeout(() => setToast(null), 2800);
    router.refresh();
  };

  const onDropToSlot = async (slotIndex: number) => {
    if (!selectedDate || !dragAssetId) return;
    const previousAssets = assets;
    setAssets((prev) =>
      prev.map((a) => {
        if (a.id === dragAssetId) {
          return {
            ...a,
            status: "scheduled",
            scheduled_date: selectedDate,
            scheduled_position: slotIndex + 1,
          };
        }
        if (
          a.status === "scheduled" &&
          a.scheduled_date === selectedDate &&
          a.scheduled_position === slotIndex + 1
        ) {
          return {
            ...a,
            status: "ready",
            scheduled_date: null,
            scheduled_position: null,
          };
        }
        return a;
      }),
    );
    setSlotPopKey(`${selectedDate}-${slotIndex}-${dragAssetId}`);
    window.setTimeout(() => setSlotPopKey(null), 420);
    const res = await scheduleAssetAction(dragAssetId, selectedDate, slotIndex + 1);
    setDragOverSlot(null);
    setDragAssetId(null);
    setDraggingCardId(null);
    if (!res.ok) {
      setAssets(previousAssets);
      setToast({ type: "error", text: res.error ?? "Could not schedule asset." });
      window.setTimeout(() => setToast(null), 2600);
      window.alert(res.error ?? "Could not schedule asset.");
      return;
    }
  };

  const goLive = async () => {
    if (!selectedDate) return;
    setPublishBusy(true);
    const r = await publishScheduledDayAction(selectedDate);
    setPublishBusy(false);
    if (!r.ok) {
      window.alert(r.error ?? "Failed to go live.");
      return;
    }
    const daySlots = (scheduledByDate.slots[selectedDate] ?? []).filter(
      Boolean,
    ) as AssetRow[];
    const optimisticLive = { ...(liveChallengeMap[selectedDate] ?? {}) };
    for (const asset of daySlots) {
      const pos = Number(asset.scheduled_position ?? 0);
      if (pos >= 1 && pos <= 5 && !optimisticLive[pos]) {
        optimisticLive[pos] = `live-${selectedDate}-${pos}`;
      }
    }
    setLiveChallengeMap((prev) => ({ ...prev, [selectedDate]: optimisticLive }));
    setLiveCounts((prev) => ({ ...prev, [selectedDate]: Object.keys(optimisticLive).length }));
    setToast({
      type: "success",
      text:
        r.message ??
        `${r.publishedCount ?? 0} new challenges published, ${r.existingCount ?? 0} already existed`,
    });
    window.setTimeout(() => setToast(null), 2600);
  };
  const unscheduleSlot = async (assetId: string) => {
    const r = await unscheduleAssetAction(assetId);
    if (!r.ok) {
      window.alert(r.error);
      return;
    }
    setAssets((prev) =>
      prev.map((a) =>
        a.id === assetId
          ? {
              ...a,
              status: "ready",
              scheduled_date: null,
              scheduled_position: null,
              challenge_id: null,
            }
          : a,
      ),
    );
  };

  const leftPanel = (
    <div className="h-fit w-full rounded-2xl border border-white/10 bg-white/[0.04] p-3 md:p-4">
      <div
        role="button"
        tabIndex={0}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files?.length) void ingestFiles(e.dataTransfer.files);
        }}
        className="mb-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#7c3aed]/50 bg-[#1a0a2e] p-4 text-center"
      >
        <span aria-hidden className="text-sm leading-none text-white/80">
          ⬆
        </span>
        <p className="text-sm font-semibold text-white">
          Upload PSD + PNG pairs (max 50 files)
        </p>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          accept=".psd,.png,.jpg,.jpeg,image/png,image/jpeg,image/vnd.adobe.photoshop"
          onChange={(e) => {
            if (e.target.files?.length) void ingestFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {(draftPairs.length > 0 || batchIngestProgress !== null) && (
        <div className="mb-4 space-y-3">
          {draftPairs.length > 0 ? (
            <>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void saveAllReadyPairs()}
              disabled={saveAllBusy}
              className="rounded bg-[#7c3aed] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
            >
              {saveAllBusy ? "Saving..." : "Save All as Ready"}
            </button>
          </div>
          <div
            className="rounded-xl border border-white/10 p-3"
            style={{ backgroundColor: "#7c3aed08" }}
          >
            <div
              className="mb-3 text-[10px] font-semibold uppercase tracking-wide"
              style={{ color: "#a855f7" }}
            >
              ⚡ Apply to all uploads
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  className="min-w-[140px] flex-1 rounded border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white placeholder:text-white/35"
                  placeholder="@creatorname"
                  value={batchCreatorName}
                  onChange={(e) => {
                    const v = e.target.value;
                    setBatchCreatorName(v);
                    if (applyCreatorToAll) {
                      setDraftPairs((list) =>
                        list.map((r) =>
                          r.creatorDetachedFromBatch ? r : { ...r, creator_name: v },
                        ),
                      );
                    }
                  }}
                />
                <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-white/70">
                  <input
                    type="checkbox"
                    checked={applyCreatorToAll}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setApplyCreatorToAll(on);
                      if (on) {
                        setDraftPairs((list) =>
                          list.map((r) => ({
                            ...r,
                            creator_name: batchCreatorName,
                            creatorDetachedFromBatch: false,
                          })),
                        );
                      }
                    }}
                    className="rounded border-white/30"
                  />
                  Apply to all
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="min-w-[140px] flex-1 rounded border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white"
                  value={batchSoftware}
                  onChange={(e) => {
                    const v = e.target.value as SoftwareOption;
                    setBatchSoftware(v);
                    if (applySoftwareToAll) {
                      setDraftPairs((list) =>
                        list.map((r) =>
                          r.softwareDetachedFromBatch ? r : { ...r, software: v },
                        ),
                      );
                    }
                  }}
                >
                  {BATCH_SOFTWARE_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
                <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-white/70">
                  <input
                    type="checkbox"
                    checked={applySoftwareToAll}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setApplySoftwareToAll(on);
                      if (on) {
                        setDraftPairs((list) =>
                          list.map((r) => ({
                            ...r,
                            software: batchSoftware,
                            softwareDetachedFromBatch: false,
                          })),
                        );
                      }
                    }}
                    className="rounded border-white/30"
                  />
                  Apply to all
                </label>
              </div>
            </div>
          </div>
            </>
          ) : null}
          {batchIngestProgress !== null ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-white/85">
                  Processing batch — {batchIngestProgress.complete} of {batchIngestProgress.total} complete
                </span>
                <span className="tabular-nums font-semibold" style={{ color: "#a855f7" }}>
                  {batchIngestProgress.total > 0
                    ? Math.round((batchIngestProgress.complete / batchIngestProgress.total) * 100)
                    : 0}
                  %
                </span>
              </div>
              <div
                className="w-full overflow-hidden rounded-[20px]"
                style={{ height: 6, backgroundColor: "#ffffff10" }}
              >
                <div
                  className="h-full rounded-[20px]"
                  style={{
                    width: `${batchIngestProgress.total > 0 ? (batchIngestProgress.complete / batchIngestProgress.total) * 100 : 0}%`,
                    background: STUDIO_INGEST_PURPLE_GRADIENT,
                    transition: "width 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                  }}
                />
              </div>
            </div>
          ) : null}
          {draftPairs.map((row) => (
            <DraftQueueRow
              key={row.key}
              row={row}
              onPatch={patchDraftRow}
              onSaveReadyPair={saveReadyPair}
              runSuggestTitle={runSuggestTitle}
            />
          ))}
        </div>
      )}

      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex gap-1 rounded-lg bg-black/30 p-1 text-xs">
          <button type="button" onClick={() => setLeftTab("ready")} className={`rounded px-2 py-1 ${leftTab === "ready" ? "bg-[#7c3aed] text-white" : "text-white/60"}`}>Ready Assets</button>
          <button type="button" onClick={() => setLeftTab("pending")} className={`rounded px-2 py-1 ${leftTab === "pending" ? "bg-[#7c3aed] text-white" : "text-white/60"}`}>Pending Review</button>
        </div>
      </div>

      {leftTab === "ready" ? (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            {([
              "all",
              "Easy",
              "Medium",
              "Medium-Hard",
              "Hard",
              "Expert",
              "my",
              "community",
            ] as ReadyFilter[]).map((f) => (
              <button key={f} type="button" onClick={() => setReadyFilter(f)} className={`rounded-full px-2.5 py-1 text-xs ${readyFilter === f ? "bg-[#7c3aed] text-white" : "border border-white/15 text-white/70"}`}>
                {f === "my"
                  ? "My Uploads"
                  : f === "community"
                    ? "Community"
                    : f === "Easy"
                      ? "Easy (5-25)"
                      : f === "Medium"
                        ? "Medium (26-45)"
                        : f === "Medium-Hard"
                          ? "Medium-Hard (46-65)"
                          : f === "Hard"
                            ? "Hard (66-90)"
                            : f === "Expert"
                              ? "Expert (91+)"
                              : f}
              </button>
            ))}
            <input
              className="min-w-[170px] flex-1 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white"
              placeholder="Search title or creator"
              value={readySearchInput}
              onChange={(e) => {
                const v = e.target.value;
                setReadySearchInput(v);
                applyReadySearchDebounced(v);
              }}
            />
          </div>

          <div className="grid max-h-[62vh] grid-cols-1 gap-2 overflow-y-auto pr-1">
            {readyPoolVisible.map((a) => (
              <ReadyAssetCard
                key={a.id}
                asset={a}
                isDragging={draggingCardId === a.id}
                onSelect={handleReadySelect}
                onDragStart={handleReadyDragStart}
                onDragEnd={handleReadyDragEnd}
              />
            ))}
          </div>
          {readyVisibleCount < readyPool.length ? (
            <div className="mt-2 flex justify-center">
              <button
                type="button"
                className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white/85 hover:bg-white/10"
                onClick={() => setReadyVisibleCount((c) => Math.min(c + 20, readyPool.length))}
              >
                Load more
              </button>
            </div>
          ) : null}
          <div className="mt-3">
            <button
              type="button"
              disabled={readyAssetCount === 0}
              onClick={openAutoScheduleModal}
              className={`w-full rounded px-3 py-2 text-sm font-bold ${
                readyAssetCount === 0
                  ? "cursor-not-allowed bg-[#7c3aed] text-white opacity-40"
                  : "bg-[#7c3aed] text-white"
              }`}
            >
              Auto-Schedule
            </button>
          </div>
        </>
      ) : (
        <div className="max-h-[62vh] space-y-2 overflow-y-auto pr-1">
          {pending.map((s) => (
            <PendingReviewRow
              key={s.id}
              s={s}
              onRemoved={handlePendingRemoved}
              onApproveRefresh={refreshAfterApprove}
            />
          ))}
        </div>
      )}
    </div>
  );

  const rightPanel = (
    <div className="h-fit w-full rounded-2xl border border-white/10 bg-white/[0.04] p-3 md:p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2 sm:justify-start">
          <button type="button" className="rounded border border-white/15 px-2 py-1 text-sm text-white/80" onClick={() => setViewMonth((v) => { const d = new Date(v.y, v.m - 1, 1); return { y: d.getFullYear(), m: d.getMonth() }; })}>←</button>
          <p className="truncate text-sm font-semibold text-white">{monthLabel}</p>
          <button type="button" className="rounded border border-white/15 px-2 py-1 text-sm text-white/80" onClick={() => setViewMonth((v) => { const d = new Date(v.y, v.m + 1, 1); return { y: d.getFullYear(), m: d.getMonth() }; })}>→</button>
        </div>
        <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
          <button
            type="button"
            disabled={goLiveAllProgress !== null || unscheduleAllProgress !== null}
            onClick={openReconfigureModal}
            className="rounded px-2.5 py-1.5 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              background: "rgba(245,158,11,0.15)",
              color: "#f59e0b",
              border: "0.5px solid rgba(245,158,11,0.3)",
            }}
          >
            ⚡ Re-configure
          </button>
          <button
            type="button"
            disabled={goLiveAllEligibleDates.length === 0 || goLiveAllProgress !== null || unscheduleAllProgress !== null}
            onClick={() => void runGoLiveAll()}
            className="rounded px-2.5 py-1.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: "#10b981" }}
          >
            ✓ Go Live All ({goLiveAllEligibleDates.length} days)
          </button>
          <button
            type="button"
            disabled={goLiveAllProgress !== null || unscheduleAllProgress !== null}
            onClick={() => void openUnscheduleAllModal()}
            className="rounded px-2.5 py-1.5 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              background: "rgba(239,68,68,0.1)",
              color: "#ef4444",
              border: "0.5px solid rgba(239,68,68,0.3)",
            }}
          >
            ✕ Unschedule All
          </button>
        </div>
      </div>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        <span className="font-medium text-emerald-400">{calendarMonthStats.full} days fully scheduled</span>
        <span className="font-medium text-amber-400">{calendarMonthStats.incomplete} days incomplete</span>
        <span className="font-medium text-white/45">{calendarMonthStats.empty} days empty</span>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase text-white/40">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => <div key={d}>{d}</div>)}</div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {matrix.flat().map((cell, idx) => {
          if (!cell) return <div key={`empty-${idx}`} className="aspect-square" />;
          const ymd = toYmd(cell);
          const count = scheduledByDate.counts[ymd] ?? 0;
          const liveCount = liveCounts[ymd] ?? 0;
          const liveIcon =
            liveCount >= 5 ? "✅" : liveCount > 0 ? "⚠️" : null;
          const dot = count >= 5 ? "bg-emerald-400" : count > 0 ? "bg-amber-400" : "bg-white/0";
          const daySlotsRow = (scheduledByDate.slots[ymd] ?? []) as (AssetRow | null)[];
          const scheduledTitlesTooltip = daySlotsRow
            .map((a) => (a?.title?.trim() ? a.title.trim() : null))
            .filter(Boolean)
            .join("\n");
          return (
            <button
              key={ymd}
              type="button"
              onClick={() => setSelectedDate(ymd)}
              title={scheduledTitlesTooltip.length > 0 ? scheduledTitlesTooltip : undefined}
              className={`rounded-lg border p-1 text-left ${selectedDate === ymd ? "border-[#7c3aed] bg-[#7c3aed]/20" : "border-white/10 bg-black/20"}`}
            >
              <div className="flex items-center justify-between text-[11px] text-white"><span>{cell.getDate()}</span><span className={`h-1.5 w-1.5 rounded-full ${dot}`} /></div>
              <div className="mt-1 flex min-h-[8px] flex-wrap items-center gap-0.5">
                {daySlotsRow.map((asset, slotIdx) => {
                  if (!asset) return null;
                  const pos = slotIdx + 1;
                  return (
                    <div
                      key={asset.id}
                      className="shrink-0 rounded-[2px]"
                      style={{
                        width: 8,
                        height: 8,
                        backgroundColor: calendarSlotDotColor(pos),
                      }}
                      aria-hidden
                    />
                  );
                })}
              </div>
              <div className="mt-1 flex items-center gap-1 text-[10px] text-white/75">
                {liveIcon ? <span aria-hidden>{liveIcon}</span> : null}
                <span>{liveCount}/5 live</span>
              </div>
            </button>
          );
        })}
      </div>

      {selectedDate && (
        <div key={selectedDate} className="mt-4 rounded-xl border border-white/10 bg-black/25 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-white">{selectedDate}</p>
            <button type="button" disabled={publishBusy} onClick={() => void goLive()} className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40">Go Live</button>
          </div>
          <div className="grid gap-2 sm:grid-cols-5">
            {selectedSlots.map((slot, idx) => (
              <div
                key={idx}
                className={`min-h-[118px] overflow-visible rounded-lg border border-dashed p-2 transition-[transform,box-shadow,opacity,border-color] duration-200 [transition-timing-function:cubic-bezier(0.4,0,0.2,1)] ${
                  dragOverSlot === idx
                    ? "scale-[1.02] border-[#7c3aed] bg-[#7c3aed]/15 shadow-[0_0_0_1px_rgba(124,58,237,0.65),0_0_20px_rgba(124,58,237,0.35)]"
                    : "border-white/20 bg-black/20"
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragOverSlot(idx); }}
                onDragLeave={() => setDragOverSlot(null)}
                onDrop={() => void onDropToSlot(idx)}
              >
                <p className="mb-1 text-center text-[10px] font-bold text-white/45">
                  {SLOT_LABELS[idx] ?? `Slot ${idx + 1}`}
                </p>
                {slot ? (
                  <div
                    draggable
                    onDragStart={() => {
                      setDragAssetId(slot.id);
                      setDraggingCardId(slot.id);
                    }}
                    onDragEnd={() => {
                      setDraggingCardId(null);
                      setDragOverSlot(null);
                    }}
                    className={`relative overflow-visible space-y-1 transition-[transform,box-shadow,opacity] duration-200 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)] ${
                      slotPopKey === `${selectedDate}-${idx}-${slot.id}` ? "scale-100" : "scale-95"
                    } ${draggingCardId === slot.id ? "scale-105 rotate-2 shadow-[0_10px_24px_rgba(124,58,237,0.25)]" : ""}`}
                  >
                    <button
                      type="button"
                      aria-label="Unschedule"
                      className="absolute right-[6px] top-[6px] z-10 inline-flex h-[18px] w-[18px] cursor-pointer items-center justify-center rounded-full border-0 bg-[rgba(0,0,0,0.6)] text-[10px] leading-none text-[#ef4444]"
                      onClick={() => void unscheduleSlot(slot.id)}
                    >
                      ✕
                    </button>
                    <div className="mx-auto flex h-12 w-12 overflow-hidden rounded bg-black/40">
                      {slot.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- load only for this selected day; avoid next/image prefetch
                        <img
                          src={slot.image_url}
                          alt=""
                          width={48}
                          height={48}
                          className="h-12 w-12 object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : null}
                    </div>
                    <p className="line-clamp-2 text-center text-[11px] text-white">{slot.title}</p>
                    <div className="flex justify-center"><DifficultyBadge layerCount={slot.layer_count} /></div>
                    <div className="flex justify-center">
                      {Boolean(
                        selectedDate &&
                          liveChallengeMap[selectedDate]?.[idx + 1],
                      ) ? (
                        <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
                          Live
                        </span>
                      ) : (
                        <span className="rounded-full bg-[#7c3aed]/25 px-2 py-0.5 text-[10px] font-semibold text-[#d8b4fe]">
                          Scheduled
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex h-[84px] items-center justify-center rounded bg-white/[0.03] text-[11px] text-white/40">Drop asset here</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-4 md:px-5 md:py-6">
      {toast ? (
        <div
          className={`mb-3 rounded-xl border px-3 py-2 text-sm font-semibold transition-[transform,box-shadow,opacity,border-color] duration-200 [transition-timing-function:cubic-bezier(0.4,0,0.2,1)] ${
            toast.type === "success"
              ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
              : "border-red-400/40 bg-red-500/15 text-red-100"
          }`}
        >
          {toast.text}
        </div>
      ) : null}
      <div
        className={`mb-3 flex items-center justify-between ${
          showBackLink ? "" : "md:hidden"
        }`}
      >
        {showBackLink ? (
          <Link
            href="/studio"
            className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-sm font-semibold text-white/85 hover:bg-white/10"
          >
            ← Back
          </Link>
        ) : (
          <span className="h-8" aria-hidden />
        )}
        <div className="flex gap-2 md:hidden">
          <button type="button" onClick={() => setMobilePanel("assets")} className={`rounded-full px-3 py-1 text-xs ${mobilePanel === "assets" ? "bg-[#7c3aed] text-white" : "border border-white/20 text-white/70"}`}>Assets</button>
          <button type="button" onClick={() => setMobilePanel("calendar")} className={`rounded-full px-3 py-1 text-xs ${mobilePanel === "calendar" ? "bg-[#7c3aed] text-white" : "border border-white/20 text-white/70"}`}>Calendar</button>
        </div>
      </div>
      <div className="grid items-start gap-4 md:grid-cols-12">
        <div className={`${mobilePanel === "calendar" ? "hidden md:block" : "block"} self-start md:col-span-7`}>{leftPanel}</div>
        <div className={`${mobilePanel === "assets" ? "hidden md:block" : "block"} self-start md:col-span-5`}>{rightPanel}</div>
      </div>

      {autoScheduleOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-4xl rounded-2xl border border-white/15 bg-[#160828] p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Auto-Schedule Assets</h2>
              <button
                type="button"
                className="text-sm text-white/60"
                onClick={() => {
                  setAutoScheduleOpen(false);
                  setAutoSchedulePreview([]);
                  setAutoScheduleUnplaced([]);
                }}
              >
                Close
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-sm text-white/80">
                <span className="mb-1 block text-xs uppercase text-white/55">Start date</span>
                <input
                  type="date"
                  value={autoScheduleStartDate}
                  onChange={(e) => setAutoScheduleStartDate(e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/30 px-2 py-2 text-white"
                />
              </label>
              <label className="text-sm text-white/80">
                <span className="mb-1 block text-xs uppercase text-white/55">End date</span>
                <input
                  type="date"
                  value={autoScheduleEndDate}
                  onChange={(e) => setAutoScheduleEndDate(e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/30 px-2 py-2 text-white"
                />
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  disabled={autoSchedulePreviewBusy}
                  onClick={() => void previewAutoSchedule()}
                  className="w-full rounded bg-[#7c3aed] px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
                >
                  {autoSchedulePreviewBusy ? "Previewing..." : "Preview Schedule"}
                </button>
              </div>
            </div>

            <div className="mt-4 max-h-[42vh] overflow-auto rounded-xl border border-white/10">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-white/5 text-xs uppercase tracking-wider text-white/55">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Slot</th>
                    <th className="px-3 py-2">Title</th>
                    <th className="px-3 py-2">Creator</th>
                    <th className="px-3 py-2">Layers</th>
                  </tr>
                </thead>
                <tbody>
                  {autoSchedulePreview.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-4 text-center text-white/60">
                        No preview yet.
                      </td>
                    </tr>
                  ) : (
                    autoSchedulePreview.map((row) => (
                      <tr key={`${row.asset_id}-${row.active_date}-${row.position}`} className="border-t border-white/10">
                        <td className="px-3 py-2 text-white/90">{row.active_date}</td>
                        <td className="px-3 py-2 text-white/80">{row.position}</td>
                        <td className="px-3 py-2 text-white">{row.title}</td>
                        <td className="px-3 py-2 text-white/75">@{row.creator_name || "creator"}</td>
                        <td className="px-3 py-2 text-white/75">{row.layer_count}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-3 text-sm text-white/80">
              {autoSchedulePreview.length} assets scheduled, {autoScheduleUnplaced.length} assets could not be placed in this date range
            </div>
            {autoScheduleUnplaced.length > 0 ? (
              <div className="mt-2 max-h-20 overflow-auto rounded border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/70">
                {autoScheduleUnplaced.map((item) => item.title).join(" · ")}
              </div>
            ) : null}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={autoScheduleConfirmBusy || autoSchedulePreview.length === 0}
                onClick={() => void confirmAutoSchedule()}
                className="rounded bg-[#7c3aed] px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {autoScheduleConfirmBusy ? "Scheduling..." : "Confirm Schedule"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAutoScheduleOpen(false);
                  setAutoSchedulePreview([]);
                  setAutoScheduleUnplaced([]);
                }}
                className="rounded border border-white/20 px-3 py-2 text-sm font-semibold text-white/85"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {reconfigureOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-white/15 bg-[#160828] p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Re-configure Schedule</h2>
              <button
                type="button"
                className="text-sm text-white/60"
                onClick={() => {
                  setReconfigureOpen(false);
                  setReconfigureTableRows([]);
                  setReconfigureAssignments([]);
                }}
              >
                Close
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm text-white/80">
                <span className="mb-1 block text-xs uppercase text-white/55">Start date</span>
                <input
                  type="date"
                  value={reconfigureStartDate}
                  onChange={(e) => setReconfigureStartDate(e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/30 px-2 py-2 text-white"
                />
              </label>
              <label className="text-sm text-white/80">
                <span className="mb-1 block text-xs uppercase text-white/55">End date</span>
                <input
                  type="date"
                  value={reconfigureEndDate}
                  onChange={(e) => setReconfigureEndDate(e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/30 px-2 py-2 text-white"
                />
              </label>
            </div>

            <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-white/85">
              <input
                type="checkbox"
                checked={reconfigureOnlyIncompleteDays}
                onChange={(e) => setReconfigureOnlyIncompleteDays(e.target.checked)}
              />
              <span>Only re-configure incomplete days (recommended)</span>
            </label>
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-white/85">
              <input
                type="checkbox"
                checked={reconfigureRespectTiers}
                onChange={(e) => setReconfigureRespectTiers(e.target.checked)}
              />
              <span>Respect difficulty tiers</span>
            </label>

            <div className="mt-3">
              <button
                type="button"
                disabled={reconfigurePreviewBusy}
                onClick={() => void previewReconfigure()}
                className="rounded bg-[#7c3aed] px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {reconfigurePreviewBusy ? "Previewing…" : "Preview"}
              </button>
            </div>

            <div className="mt-4 max-h-[36vh] overflow-auto rounded-xl border border-white/10">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 bg-[#160828] text-xs uppercase tracking-wider text-white/55">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Slot</th>
                    <th className="px-3 py-2">Current content</th>
                    <th className="px-3 py-2">Proposed new content</th>
                  </tr>
                </thead>
                <tbody>
                  {reconfigureTableRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-center text-white/60">
                        Run Preview to see proposed fills for empty slots.
                      </td>
                    </tr>
                  ) : (
                    reconfigureTableRows.map((row) => (
                      <tr key={`${row.active_date}-${row.position}`} className="border-t border-white/10">
                        <td className="px-3 py-2 text-white/90">{row.active_date}</td>
                        <td className="px-3 py-2 text-white/80">{row.position}</td>
                        <td className="px-3 py-2 text-white/60">{row.current_title?.trim() ? row.current_title : "—"}</td>
                        <td className="px-3 py-2 text-white">
                          {row.proposed_title?.trim() ? row.proposed_title : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-sm text-white/85">
              <span className="font-semibold text-emerald-300">{reconfigureGapsFilled}</span> gaps will be filled,{" "}
              <span className="font-semibold text-amber-300">{reconfigureGapsUnfillable}</span> gaps cannot be filled
              (insufficient assets)
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={reconfigureConfirmBusy || reconfigureAssignments.length === 0}
                onClick={() => void confirmReconfigure()}
                className="rounded bg-[#7c3aed] px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {reconfigureConfirmBusy ? "Confirming…" : "Confirm"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setReconfigureOpen(false);
                  setReconfigureTableRows([]);
                  setReconfigureAssignments([]);
                }}
                className="rounded border border-white/20 px-3 py-2 text-sm font-semibold text-white/85"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {unscheduleAllOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#160828] p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Unschedule future content</h2>
              <button
                type="button"
                disabled={unscheduleAllConfirmBusy}
                className="text-sm text-white/60 disabled:opacity-40"
                onClick={() => {
                  if (unscheduleAllConfirmBusy) return;
                  setUnscheduleAllOpen(false);
                  setUnscheduleAllSummary(null);
                }}
              >
                Close
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm text-white/80">
                <span className="mb-1 block text-xs uppercase text-white/55">Start date</span>
                <input
                  type="date"
                  value={unscheduleAllStart}
                  onChange={(e) => setUnscheduleAllStart(e.target.value)}
                  disabled={unscheduleAllConfirmBusy}
                  className="w-full rounded border border-white/15 bg-black/30 px-2 py-2 text-white disabled:opacity-50"
                />
              </label>
              <label className="text-sm text-white/80">
                <span className="mb-1 block text-xs uppercase text-white/55">End date</span>
                <input
                  type="date"
                  value={unscheduleAllEnd}
                  onChange={(e) => setUnscheduleAllEnd(e.target.value)}
                  disabled={unscheduleAllConfirmBusy}
                  className="w-full rounded border border-white/15 bg-black/30 px-2 py-2 text-white disabled:opacity-50"
                />
              </label>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-white/80">
              {unscheduleAllSummary ? (
                <>
                  This will unschedule{" "}
                  <span className="font-semibold text-white">{unscheduleAllSummary.count}</span> challenges across{" "}
                  <span className="font-semibold text-white">{unscheduleAllSummary.days}</span> days. Today and past
                  dates will not be affected.
                </>
              ) : (
                <span className="text-white/55">Updating summary…</span>
              )}
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={
                  unscheduleAllConfirmBusy ||
                  !unscheduleAllSummary ||
                  unscheduleAllSummary.count === 0
                }
                onClick={() => void runConfirmUnscheduleAll()}
                className="rounded px-3 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                style={{ background: "#ef4444" }}
              >
                {unscheduleAllConfirmBusy ? "Working…" : "Confirm Unschedule"}
              </button>
              <button
                type="button"
                disabled={unscheduleAllConfirmBusy}
                onClick={() => {
                  if (unscheduleAllConfirmBusy) return;
                  setUnscheduleAllOpen(false);
                  setUnscheduleAllSummary(null);
                }}
                className="rounded border border-white/20 px-3 py-2 text-sm font-semibold text-white/85 disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {goLiveAllProgress ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" role="status" aria-live="polite">
          <div className="rounded-xl border border-white/15 bg-[#160828] px-6 py-4 text-center text-sm font-semibold text-white">
            Publishing day {goLiveAllProgress.current} of {goLiveAllProgress.total}…
          </div>
        </div>
      ) : null}

      {unscheduleAllProgress ? (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/60 p-4" role="status" aria-live="polite">
          <div className="rounded-xl border border-white/15 bg-[#160828] px-6 py-4 text-center text-sm font-semibold text-white">
            Unscheduling {unscheduleAllProgress.current} of {unscheduleAllProgress.total}…
          </div>
        </div>
      ) : null}

      {editAsset && (
        <EditAssetModal
          asset={editAsset}
          onClose={() => setEditAsset(null)}
          onSaveSuccess={(patch) => {
            setAssets((prev) => prev.map((a) => (a.id === patch.id ? { ...a, ...patch } : a)));
          }}
        />
      )}
    </div>
  );
}

function EditAssetModal({
  asset,
  onClose,
  onSaveSuccess,
}: {
  asset: AssetRow;
  onClose: () => void;
  onSaveSuccess: (patch: Partial<AssetRow> & { id: string }) => void;
}) {
  const [title, setTitle] = useState(asset.title);
  const [creator_name, setCreator_name] = useState(asset.creator_name ?? "");
  const [software, setSoftware] = useState(asset.software as SoftwareOption);
  const [category, setCategory] = useState(asset.category as CategoryOption);
  const [layer_count, setLayer_count] = useState(String(asset.layer_count));
  const [is_sponsored, setIs_sponsored] = useState(asset.is_sponsored);
  const [sponsor_name, setSponsor_name] = useState(asset.sponsor_name ?? "");
  const [saveUi, setSaveUi] = useState<"idle" | "saving" | "success" | "error">("idle");
  const autoCloseAfterSaveTimerRef = useRef<number | null>(null);

  const clearAutoCloseAfterSaveTimer = () => {
    if (autoCloseAfterSaveTimerRef.current != null) {
      window.clearTimeout(autoCloseAfterSaveTimerRef.current);
      autoCloseAfterSaveTimerRef.current = null;
    }
  };

  const handleClose = () => {
    clearAutoCloseAfterSaveTimer();
    onClose();
  };

  useEffect(() => {
    clearAutoCloseAfterSaveTimer();
    setSaveUi("idle");
    return () => clearAutoCloseAfterSaveTimer();
  }, [asset.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog">
      <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#160828] p-5">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold text-white">Edit asset</h2><button type="button" onClick={handleClose} className="text-sm text-white/60">Close</button></div>
        <div className="space-y-2">
          <input className="w-full rounded border border-white/10 bg-black/30 px-2 py-2 text-sm text-white" value={title} onChange={(e) => setTitle(e.target.value)} />
          <CreatorAutocompleteInput value={creator_name} onChange={setCreator_name} />
          <div className="grid grid-cols-2 gap-2">
            <select className="rounded border border-white/10 bg-black/30 px-2 py-2 text-sm text-white" value={software} onChange={(e) => setSoftware(e.target.value as SoftwareOption)}>{SOFTWARE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}</select>
            <select className="rounded border border-white/10 bg-black/30 px-2 py-2 text-sm text-white" value={category} onChange={(e) => setCategory(e.target.value as CategoryOption)}>{CATEGORY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}</select>
          </div>
          <input className="w-full rounded border border-white/10 bg-black/30 px-2 py-2 text-sm text-white" value={layer_count} onChange={(e) => setLayer_count(e.target.value)} />
          <label className="flex items-center gap-2 text-sm text-white/80"><input type="checkbox" checked={is_sponsored} onChange={(e) => setIs_sponsored(e.target.checked)} />Sponsored</label>
          {is_sponsored ? <input className="w-full rounded border border-white/10 bg-black/30 px-2 py-2 text-sm text-white" value={sponsor_name} onChange={(e) => setSponsor_name(e.target.value)} placeholder="Sponsor name" /> : null}
        </div>
        <button
          type="button"
          disabled={saveUi === "saving"}
          className={`mt-3 w-full rounded-xl py-2.5 text-sm font-bold disabled:opacity-60 ${
            saveUi === "error"
              ? "bg-[#7c3aed] text-red-300"
              : saveUi === "success"
                ? "bg-[#7c3aed] text-emerald-200"
                : "bg-[#7c3aed] text-white"
          }`}
          onClick={async () => {
            setSaveUi("saving");
            const r = await updateAssetAction(asset.id, {
              title,
              creator_name,
              software,
              category,
              layer_count: Number(layer_count),
              is_sponsored,
              sponsor_name,
            });
            if (!r.ok) {
              setSaveUi("error");
              return;
            }
            const layerCountNum = Math.trunc(Number(layer_count));
            const patch: Partial<AssetRow> & { id: string } = {
              id: asset.id,
              title: title.trim(),
              creator_name: creator_name.trim() || null,
              software,
              category,
              layer_count: layerCountNum,
              is_sponsored,
              sponsor_name: is_sponsored ? sponsor_name.trim() || null : null,
            };
            onSaveSuccess(patch);
            setSaveUi("success");
            clearAutoCloseAfterSaveTimer();
            autoCloseAfterSaveTimerRef.current = window.setTimeout(() => {
              autoCloseAfterSaveTimerRef.current = null;
              onClose();
            }, 2000);
          }}
        >
          {saveUi === "success" ? "✅ Saved" : saveUi === "error" ? "⚠ Failed to save" : saveUi === "saving" ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

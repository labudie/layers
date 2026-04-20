"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabase } from "@/lib/supabase";
import {
  buildPairSpecs,
  formatTitleFromStem,
  isPsdFile,
  isRasterGameImage,
  type FilePairSpec,
} from "@/lib/asset-pairing";
import {
  difficultyBadgeClass,
  difficultyFromLayerCount,
  type AdminDifficulty,
} from "@/lib/asset-difficulty";
import { CATEGORY_OPTIONS, type CategoryOption } from "@/lib/challenge-categories";
import { parsePsdLayerCount } from "@/lib/psd-layer-count";
import {
  SOFTWARE_OPTIONS,
  type SoftwareOption,
  layerCountGuidanceForSoftware,
} from "@/lib/software-options";
import { CreatorAutocompleteInput } from "@/app/studio/AdminChallengeFormClient";
import {
  deleteAssetAction,
  insertDraftAssetAction,
  markAssetReadyAction,
  publishScheduledDayAction,
  reorderScheduledDayAction,
  scheduleAssetAction,
  unscheduleAssetAction,
  updateAssetAction,
  type AssetUpsertFields,
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
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PublishedExtra = {
  asset_id: string;
  challenge_id: string;
  active_date: string;
  position: number;
  total_guesses: number;
  unique_players: number;
  solve_rate_pct: number;
  downloads: number;
};

type TabId = "draft" | "ready" | "scheduled" | "published";

function assetDraftStoragePath(safeTitle: string, ext: "png" | "jpg") {
  return `asset-draft/${crypto.randomUUID()}-${safeTitle || "asset"}.${ext}`;
}

const TABS: { id: TabId; label: string }[] = [
  { id: "draft", label: "Draft" },
  { id: "ready", label: "Ready" },
  { id: "scheduled", label: "Scheduled" },
  { id: "published", label: "Published" },
];

function DifficultyBadge({ layerCount }: { layerCount: number }) {
  const d = difficultyFromLayerCount(layerCount);
  return (
    <span
      className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${difficultyBadgeClass(d)}`}
    >
      {d}
    </span>
  );
}

function LibraryTabBar({
  current,
  onChange,
}: {
  current: TabId;
  onChange: (t: TabId) => void;
}) {
  const activeIndex = Math.max(0, TABS.findIndex((t) => t.id === current));
  const rowRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [underlineX, setUnderlineX] = useState(0);

  const updateUnderline = useCallback(() => {
    const row = rowRef.current;
    const el = tabRefs.current[activeIndex];
    if (!row || !el) return;
    const rr = row.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    setUnderlineX(er.left - rr.left + er.width / 2 - 20);
  }, [activeIndex]);

  useLayoutEffect(() => {
    updateUnderline();
  }, [updateUnderline]);

  useEffect(() => {
    const row = rowRef.current;
    if (!row || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => updateUnderline());
    ro.observe(row);
    return () => ro.disconnect();
  }, [updateUnderline]);

  return (
    <div className="mt-4 w-full" role="tablist" aria-label="Asset library views">
      <div ref={rowRef} className="relative flex w-full items-stretch pb-1">
        {TABS.map((t, i) => {
          const active = current === t.id;
          return (
            <button
              key={t.id}
              type="button"
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              role="tab"
              aria-selected={active}
              onClick={() => onChange(t.id)}
              className={`tap-press flex flex-1 items-center justify-center py-3 text-sm outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-[rgba(124,58,237,0.45)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f0520] ${
                active
                  ? "font-bold text-white"
                  : "font-normal text-[rgba(255,255,255,0.45)]"
              }`}
            >
              {t.label}
            </button>
          );
        })}
        <div
          className="pointer-events-none absolute bottom-0 left-0 h-0.5 w-10 rounded-sm bg-[#7c3aed]"
          style={{
            transform: `translateX(${underlineX}px)`,
            transition: "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
          aria-hidden
        />
      </div>
    </div>
  );
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
  for (let r = 0; r < cells.length / 7; r++) {
    rows.push(cells.slice(r * 7, r * 7 + 7));
  }
  return rows;
}

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
};

export function AssetLibraryClient({
  initialAssets,
  publishedExtras,
  todayYmd,
}: {
  initialAssets: AssetRow[];
  publishedExtras: PublishedExtra[];
  todayYmd: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("draft");
  const [assets, setAssets] = useState<AssetRow[]>(initialAssets);
  const [publishedStats, setPublishedStats] = useState<PublishedExtra[]>(publishedExtras);

  useEffect(() => {
    setAssets(initialAssets);
  }, [initialAssets]);

  useEffect(() => {
    setPublishedStats(publishedExtras);
  }, [publishedExtras]);

  const statsByChallenge = useMemo(() => {
    const m = new Map<string, PublishedExtra>();
    for (const p of publishedStats) m.set(p.challenge_id, p);
    return m;
  }, [publishedStats]);

  const scheduledByDate = useMemo(() => {
    const counts: Record<string, number> = {};
    const slots: Record<string, (AssetRow | null)[]> = {};
    for (const a of assets) {
      if (a.status !== "scheduled" || !a.scheduled_date) continue;
      const d = a.scheduled_date;
      counts[d] = (counts[d] ?? 0) + 1;
      if (!slots[d]) slots[d] = [null, null, null, null, null];
      const p = (a.scheduled_position ?? 1) - 1;
      if (p >= 0 && p < 5) slots[d][p] = a;
    }
    return { counts, slots };
  }, [assets]);

  const [viewMonth, setViewMonth] = useState(() => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() };
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slotPickIndex, setSlotPickIndex] = useState<number | null>(null);
  const [publishBusy, setPublishBusy] = useState(false);
  const [dragAssetId, setDragAssetId] = useState<string | null>(null);

  const [readyFilterDiff, setReadyFilterDiff] = useState<AdminDifficulty | "all">("all");
  const [readyFilterSoftware, setReadyFilterSoftware] = useState<string>("all");
  const [readyFilterCategory, setReadyFilterCategory] = useState<string>("all");
  const [readySearch, setReadySearch] = useState("");

  const [pubSearch, setPubSearch] = useState("");
  const [pubFilterDiff, setPubFilterDiff] = useState<AdminDifficulty | "all">("all");
  const [pubFilterSoftware, setPubFilterSoftware] = useState<string>("all");
  const [pubFilterCategory, setPubFilterCategory] = useState<string>("all");

  const [draftPairs, setDraftPairs] = useState<DraftPairLocal[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editAsset, setEditAsset] = useState<AssetRow | null>(null);

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  const ingestFiles = useCallback(async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((f) => isRasterGameImage(f) || isPsdFile(f));
    const capped = files.slice(0, 50);
    const specs = buildPairSpecs(capped);
    const next: DraftPairLocal[] = [];
    for (const spec of specs) {
      if (!spec.raster) continue;
      let layerCount: number | null = null;
      if (spec.psd) {
        const buf = await spec.psd.arrayBuffer();
        layerCount = parsePsdLayerCount(buf);
      }
      const rasterUrl = URL.createObjectURL(spec.raster);
      next.push({
        key: spec.key,
        spec,
        previewUrl: rasterUrl,
        layerCount,
        title: formatTitleFromStem(spec.displayStem),
        creator_name: "",
        software: "Photoshop",
        category: CATEGORY_OPTIONS[0],
        layer_count: layerCount != null ? String(layerCount) : "",
        is_sponsored: false,
        sponsor_name: "",
        uploadProgress: 0,
        uploadPhase: "idle",
        errorText: null,
        successText: null,
      });
    }
    setDraftPairs((prev) => {
      for (const p of prev) {
        if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
      }
      return next;
    });
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer.files?.length) void ingestFiles(e.dataTransfer.files);
    },
    [ingestFiles],
  );

  const saveDraftPair = async (row: DraftPairLocal) => {
    if (!row.spec.raster) return;
    const title = row.title.trim();
    const software = row.software;
    const category = row.category;
    const layerCount = Number(row.layer_count);
    if (!title) {
      setDraftPairs((list) =>
        list.map((r) => (r.key === row.key ? { ...r, errorText: "Title is required." } : r)),
      );
      return;
    }
    if (!Number.isFinite(layerCount)) {
      setDraftPairs((list) =>
        list.map((r) => (r.key === row.key ? { ...r, errorText: "Layer count must be a number." } : r)),
      );
      return;
    }
    if (row.is_sponsored && !row.sponsor_name.trim()) {
      setDraftPairs((list) =>
        list.map((r) =>
          r.key === row.key ? { ...r, errorText: "Sponsor name is required when sponsored." } : r,
        ),
      );
      return;
    }

    setDraftPairs((list) =>
      list.map((r) =>
        r.key === row.key
          ? { ...r, uploadPhase: "uploading", uploadProgress: 5, errorText: null, successText: null }
          : r,
      ),
    );

    const tick = window.setInterval(() => {
      setDraftPairs((list) =>
        list.map((r) =>
          r.key === row.key && r.uploadPhase === "uploading" && r.uploadProgress < 88
            ? { ...r, uploadProgress: r.uploadProgress + 6 }
            : r,
        ),
      );
    }, 160);

    const sb = supabase();
    const safeTitle = title
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-_]/g, "")
      .slice(0, 80);
    const storagePath = assetDraftStoragePath(
      safeTitle,
      row.spec.raster.type === "image/jpeg" ? "jpg" : "png",
    );

    const { error: uploadError } = await sb.storage.from("challenge-images").upload(storagePath, row.spec.raster, {
      contentType: row.spec.raster.type || "image/png",
      upsert: true,
    });
    window.clearInterval(tick);

    if (uploadError) {
      setDraftPairs((list) =>
        list.map((r) =>
          r.key === row.key
            ? { ...r, uploadPhase: "error", errorText: uploadError.message, uploadProgress: 0 }
            : r,
        ),
      );
      return;
    }

    const { data: pub } = sb.storage.from("challenge-images").getPublicUrl(storagePath);
    if (!pub?.publicUrl) {
      setDraftPairs((list) =>
        list.map((r) =>
          r.key === row.key ? { ...r, uploadPhase: "error", errorText: "Failed to resolve public URL." } : r,
        ),
      );
      return;
    }

    setDraftPairs((list) =>
      list.map((r) =>
        r.key === row.key ? { ...r, uploadPhase: "saving", uploadProgress: 92 } : r,
      ),
    );

    const payload: AssetUpsertFields = {
      title,
      creator_name: row.creator_name.trim(),
      software,
      category,
      layer_count: Math.trunc(layerCount),
      is_sponsored: row.is_sponsored,
      sponsor_name: row.sponsor_name.trim(),
      image_url: pub.publicUrl,
    };

    const res = await insertDraftAssetAction(payload);
    if (!res.ok) {
      setDraftPairs((list) =>
        list.map((r) =>
          r.key === row.key ? { ...r, uploadPhase: "error", errorText: res.error ?? "Save failed." } : r,
        ),
      );
      return;
    }

    setDraftPairs((list) =>
      list.map((r) =>
        r.key === row.key
          ? { ...r, uploadPhase: "done", uploadProgress: 100, successText: "Saved to draft." }
          : r,
      ),
    );
    refresh();
    window.setTimeout(() => {
      setDraftPairs((list) => list.filter((r) => r.key !== row.key));
      if (row.previewUrl) URL.revokeObjectURL(row.previewUrl);
    }, 1200);
  };

  const readyRows = useMemo(() => {
    return assets.filter((a) => a.status === "draft" || a.status === "ready");
  }, [assets]);

  const filteredReady = useMemo(() => {
    return readyRows.filter((a) => {
      const diff = difficultyFromLayerCount(a.layer_count);
      if (readyFilterDiff !== "all" && diff !== readyFilterDiff) return false;
      if (readyFilterSoftware !== "all" && a.software !== readyFilterSoftware) return false;
      if (readyFilterCategory !== "all" && a.category !== readyFilterCategory) return false;
      const q = readySearch.trim().toLowerCase();
      if (q) {
        const t = (a.title ?? "").toLowerCase();
        const c = (a.creator_name ?? "").toLowerCase();
        if (!t.includes(q) && !c.includes(q)) return false;
      }
      return true;
    });
  }, [readyRows, readyFilterDiff, readyFilterSoftware, readyFilterCategory, readySearch]);

  /** Published list: assets linked to a challenge (live or past). */
  const publishedList = useMemo(() => {
    const rows: Array<{
      asset: AssetRow;
      active_date: string;
      position: number;
      stats: PublishedExtra | null;
    }> = [];
    for (const a of assets) {
      if (!a.challenge_id) continue;
      const st = statsByChallenge.get(a.challenge_id);
      if (!st) continue;
      if (st.active_date > todayYmd) continue;
      rows.push({
        asset: a,
        active_date: st.active_date,
        position: st.position,
        stats: st,
      });
    }
    rows.sort((a, b) => (a.active_date < b.active_date ? 1 : a.active_date > b.active_date ? -1 : 0));
    return rows.filter((r) => {
      const diff = difficultyFromLayerCount(r.asset.layer_count);
      if (pubFilterDiff !== "all" && diff !== pubFilterDiff) return false;
      if (pubFilterSoftware !== "all" && r.asset.software !== pubFilterSoftware) return false;
      if (pubFilterCategory !== "all" && r.asset.category !== pubFilterCategory) return false;
      const q = pubSearch.trim().toLowerCase();
      if (q) {
        const t = (r.asset.title ?? "").toLowerCase();
        const c = (r.asset.creator_name ?? "").toLowerCase();
        if (!t.includes(q) && !c.includes(q)) return false;
      }
      return true;
    });
  }, [
    assets,
    statsByChallenge,
    pubFilterDiff,
    pubFilterSoftware,
    pubFilterCategory,
    pubSearch,
    todayYmd,
  ]);

  const matrix = monthMatrix(viewMonth.y, viewMonth.m);
  const monthLabel = new Date(viewMonth.y, viewMonth.m, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const selectedSlots =
    selectedDate && scheduledByDate.slots[selectedDate]
      ? scheduledByDate.slots[selectedDate]
      : [null, null, null, null, null];

  const readyPickList = useMemo(
    () => assets.filter((a) => a.status === "ready" && !a.scheduled_date),
    [assets],
  );

  const slotIdsForReorder = selectedSlots.map((s) => (s ? s.id : ""));

  const onReorderDrop = async (fromIndex: number, toIndex: number) => {
    if (!selectedDate || fromIndex === toIndex) return;
    const next = [...slotIdsForReorder];
    const [id] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, id);
    const res = await reorderScheduledDayAction(selectedDate, next);
    if (!res.ok) {
      window.alert(res.error ?? "Reorder failed.");
      return;
    }
    refresh();
  };

  const publishDay = async () => {
    if (!selectedDate) return;
    setPublishBusy(true);
    const res = await publishScheduledDayAction(selectedDate);
    setPublishBusy(false);
    if (!res.ok) {
      window.alert(res.error ?? "Publish failed.");
      return;
    }
    refresh();
  };

  const filledCount = selectedDate ? (scheduledByDate.counts[selectedDate] ?? 0) : 0;
  const canPublish =
    selectedDate &&
    filledCount >= 5 &&
    selectedDate > todayYmd &&
    !publishBusy;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-4 md:px-5 md:py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/studio"
          className="tap-press inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-sm font-semibold text-white/90 hover:bg-white/10"
        >
          ← Back
        </Link>
      </div>

      <LibraryTabBar current={tab} onChange={setTab} />

      {tab === "draft" && (
        <div className="mt-6 space-y-6">
          <div
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className="flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#7c3aed]/50 bg-[#1a0a2e]/80 px-6 py-12 text-center transition hover:border-[#7c3aed] hover:bg-[#1a0a2e]"
          >
            <p className="text-lg font-semibold text-white">Drop PSD + PNG pairs here</p>
            <p className="mt-2 max-w-md text-sm text-white/55">
              Up to 50 files at once. We pair by filename (case-insensitive). PSD supplies automatic layer
              counts.
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

          <div className="grid gap-5 md:grid-cols-1 lg:grid-cols-2">
            {draftPairs.map((row) => (
              <div
                key={row.key}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-[0_0_0_1px_rgba(124,58,237,0.08)]"
              >
                <div className="flex gap-4">
                  <div className="relative h-36 w-44 shrink-0 overflow-hidden rounded-xl bg-black/40">
                    {row.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={row.previewUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-white/40">No preview</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <DifficultyBadge
                        layerCount={Number(row.layer_count) || row.layerCount || 0}
                      />
                      <span className="text-xs text-white/50">
                        {row.layerCount != null ? `${row.layerCount} layers (auto)` : "PSD missing — enter layers"}
                      </span>
                    </div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-white/45">
                      Title
                      <input
                        className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white"
                        value={row.title}
                        onChange={(e) =>
                          setDraftPairs((list) =>
                            list.map((r) => (r.key === row.key ? { ...r, title: e.target.value } : r)),
                          )
                        }
                      />
                    </label>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-white/45">
                      Creator
                      <CreatorAutocompleteInput
                        value={row.creator_name}
                        onChange={(v) =>
                          setDraftPairs((list) =>
                            list.map((r) => (r.key === row.key ? { ...r, creator_name: v } : r)),
                          )
                        }
                      />
                    </label>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-white/45">
                    Software
                    <select
                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white"
                      value={row.software}
                      onChange={(e) =>
                        setDraftPairs((list) =>
                          list.map((r) =>
                            r.key === row.key ? { ...r, software: e.target.value as SoftwareOption } : r,
                          ),
                        )
                      }
                    >
                      {SOFTWARE_OPTIONS.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[11px] text-white/40">{layerCountGuidanceForSoftware(row.software)}</p>
                  </label>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-white/45">
                    Category
                    <select
                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white"
                      value={row.category}
                      onChange={(e) =>
                        setDraftPairs((list) =>
                          list.map((r) =>
                            r.key === row.key ? { ...r, category: e.target.value as CategoryOption } : r,
                          ),
                        )
                      }
                    >
                      {CATEGORY_OPTIONS.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-sm text-white/80">
                    <input
                      type="checkbox"
                      checked={row.is_sponsored}
                      onChange={(e) =>
                        setDraftPairs((list) =>
                          list.map((r) => (r.key === row.key ? { ...r, is_sponsored: e.target.checked } : r)),
                        )
                      }
                    />
                    Sponsored
                  </label>
                  {row.is_sponsored && (
                    <label className="block text-xs font-semibold uppercase tracking-wide text-white/45">
                      Sponsor name
                      <input
                        className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white"
                        value={row.sponsor_name}
                        onChange={(e) =>
                          setDraftPairs((list) =>
                            list.map((r) => (r.key === row.key ? { ...r, sponsor_name: e.target.value } : r)),
                          )
                        }
                      />
                    </label>
                  )}
                  <label className="block text-xs font-semibold uppercase tracking-wide text-white/45 sm:col-span-2">
                    Layer count
                    <input
                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white"
                      value={row.layer_count}
                      onChange={(e) =>
                        setDraftPairs((list) =>
                          list.map((r) => (r.key === row.key ? { ...r, layer_count: e.target.value } : r)),
                        )
                      }
                    />
                  </label>
                </div>
                {row.uploadPhase !== "idle" && row.uploadPhase !== "error" && (
                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-[#7c3aed] transition-all"
                      style={{ width: `${row.uploadProgress}%` }}
                    />
                  </div>
                )}
                {row.errorText && <p className="mt-2 text-sm text-red-300">{row.errorText}</p>}
                {row.successText && <p className="mt-2 text-sm text-emerald-300">{row.successText}</p>}
                <button
                  type="button"
                  onClick={() => void saveDraftPair(row)}
                  disabled={row.uploadPhase === "uploading" || row.uploadPhase === "saving"}
                  className="mt-4 w-full rounded-xl bg-[#7c3aed] py-2.5 text-sm font-bold text-white shadow-lg shadow-violet-900/30 disabled:opacity-50"
                >
                  Save to Draft
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "ready" && (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap gap-2">
            <input
              placeholder="Search title or creator…"
              className="min-w-[200px] flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
              value={readySearch}
              onChange={(e) => setReadySearch(e.target.value)}
            />
            <select
              className="rounded-xl border border-white/10 bg-black/30 px-2 py-2 text-sm text-white"
              value={readyFilterDiff}
              onChange={(e) => setReadyFilterDiff(e.target.value as AdminDifficulty | "all")}
            >
              <option value="all">All difficulties</option>
              <option value="Easy">Easy</option>
              <option value="Medium">Medium</option>
              <option value="Hard">Hard</option>
            </select>
            <select
              className="rounded-xl border border-white/10 bg-black/30 px-2 py-2 text-sm text-white"
              value={readyFilterSoftware}
              onChange={(e) => setReadyFilterSoftware(e.target.value)}
            >
              <option value="all">All software</option>
              {SOFTWARE_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            <select
              className="rounded-xl border border-white/10 bg-black/30 px-2 py-2 text-sm text-white"
              value={readyFilterCategory}
              onChange={(e) => setReadyFilterCategory(e.target.value)}
            >
              <option value="all">All categories</option>
              {CATEGORY_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredReady.map((a) => (
              <div
                key={a.id}
                className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-3"
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-black/40">
                  {a.image_url ? (
                    <Image src={a.image_url} alt="" fill className="object-cover" sizes="280px" unoptimized />
                  ) : null}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <DifficultyBadge layerCount={a.layer_count} />
                  <span className="text-xs uppercase text-white/40">{a.status}</span>
                </div>
                <p className="mt-1 line-clamp-2 font-semibold text-white">{a.title}</p>
                <p className="text-sm text-white/60">{a.creator_name ?? "—"}</p>
                <p className="text-xs text-white/45">
                  {a.software} · {a.category} · {a.layer_count} layers
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {a.status === "draft" && (
                    <button
                      type="button"
                      className="rounded-lg bg-emerald-600/90 px-2 py-1 text-xs font-bold text-white"
                      onClick={async () => {
                        const r = await markAssetReadyAction(a.id);
                        if (!r.ok) window.alert(r.error);
                        else refresh();
                      }}
                    >
                      Mark Ready
                    </button>
                  )}
                  <button
                    type="button"
                    className="rounded-lg border border-white/20 px-2 py-1 text-xs font-semibold text-white/90"
                    onClick={() => setEditAsset(a)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-red-400/40 px-2 py-1 text-xs font-semibold text-red-200"
                    onClick={async () => {
                      if (!window.confirm("Delete this asset?")) return;
                      const r = await deleteAssetAction(a.id);
                      if (!r.ok) window.alert(r.error);
                      else refresh();
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "scheduled" && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0">
            <div className="mb-3 flex items-center justify-between">
              <button
                type="button"
                className="rounded-lg border border-white/15 px-2 py-1 text-sm text-white/80"
                onClick={() =>
                  setViewMonth((v) => {
                    const d = new Date(v.y, v.m - 1, 1);
                    return { y: d.getFullYear(), m: d.getMonth() };
                  })
                }
              >
                ←
              </button>
              <div className="text-sm font-semibold text-white">{monthLabel}</div>
              <button
                type="button"
                className="rounded-lg border border-white/15 px-2 py-1 text-sm text-white/80"
                onClick={() =>
                  setViewMonth((v) => {
                    const d = new Date(v.y, v.m + 1, 1);
                    return { y: d.getFullYear(), m: d.getMonth() };
                  })
                }
              >
                →
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase text-white/40">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {matrix.flat().map((cell, idx) => {
                if (!cell) return <div key={`e-${idx}`} className="aspect-square" />;
                const ymd = toYmd(cell);
                const n = scheduledByDate.counts[ymd] ?? 0;
                const dot =
                  n >= 5 ? "bg-emerald-400" : n > 0 ? "bg-amber-400" : "bg-transparent";
                const sel = selectedDate === ymd;
                return (
                  <button
                    key={ymd}
                    type="button"
                    onClick={() => setSelectedDate(ymd)}
                    className={`relative flex aspect-square flex-col items-center justify-center rounded-lg border text-sm font-semibold transition ${
                      sel ? "border-[#7c3aed] bg-[#7c3aed]/25 text-white" : "border-white/10 bg-white/[0.03] text-white/85"
                    }`}
                  >
                    {cell.getDate()}
                    <span className={`mt-1 h-1.5 w-1.5 rounded-full ${dot}`} />
                  </button>
                );
              })}
            </div>

            {selectedDate && (
              <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-white">{selectedDate}</p>
                  <button
                    type="button"
                    disabled={!canPublish}
                    onClick={() => void publishDay()}
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
                  >
                    Publish Day
                  </button>
                </div>
                <p className="mb-3 text-xs text-white/50">
                  Drag cards to reorder. Future dates only for publishing ({filledCount}/5 filled).
                </p>
                <div className="grid gap-2 sm:grid-cols-5">
                  {selectedSlots.map((slot, idx) => (
                    <div
                      key={idx}
                      className="min-h-[120px] rounded-xl border border-dashed border-white/15 bg-black/25 p-2"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (dragAssetId == null) return;
                        const fromIdx = selectedSlots.findIndex((s) => s?.id === dragAssetId);
                        if (fromIdx >= 0) void onReorderDrop(fromIdx, idx);
                        setDragAssetId(null);
                      }}
                    >
                      <div className="mb-1 text-center text-[10px] font-bold uppercase text-white/35">
                        #{idx + 1}
                      </div>
                      {slot ? (
                        <div
                          draggable
                          onDragStart={() => setDragAssetId(slot.id)}
                          className="space-y-1 rounded-lg bg-white/[0.06] p-1"
                        >
                          <div className="relative mx-auto aspect-square w-full max-w-[100px] overflow-hidden rounded-lg bg-black/40">
                            {slot.image_url ? (
                              <Image
                                src={slot.image_url}
                                alt=""
                                fill
                                className="object-cover"
                                sizes="100px"
                                unoptimized
                              />
                            ) : null}
                          </div>
                          <p className="line-clamp-2 text-center text-[11px] font-medium text-white">{slot.title}</p>
                          <div className="flex justify-center">
                            <DifficultyBadge layerCount={slot.layer_count} />
                          </div>
                          <button
                            type="button"
                            className="mt-1 w-full rounded bg-white/10 py-1 text-[10px] font-semibold text-white/80"
                            onClick={async () => {
                              const r = await unscheduleAssetAction(slot.id);
                              if (!r.ok) window.alert(r.error);
                              else refresh();
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setSlotPickIndex(idx)}
                          className="flex h-full min-h-[72px] w-full flex-col items-center justify-center rounded-lg border border-white/10 text-2xl font-light text-white/40 hover:bg-white/[0.06]"
                        >
                          +
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#160828] p-3 lg:sticky lg:top-24">
            <p className="text-sm font-semibold text-white">Ready assets</p>
            <p className="mt-1 text-xs text-white/45">
              Select a day, click <span className="text-white/70">+</span> in a slot, then tap an asset here to
              assign to that position.
            </p>
            {slotPickIndex != null && (
              <p className="mt-2 text-xs font-semibold text-violet-200">
                Assigning to slot #{slotPickIndex + 1}
              </p>
            )}
            <div className="mt-3 max-h-[min(60vh,520px)] space-y-2 overflow-y-auto pr-1">
              {readyPickList.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-2 text-left hover:bg-white/[0.08]"
                  onClick={async () => {
                    if (!selectedDate) {
                      window.alert("Select a calendar day first.");
                      return;
                    }
                    const emptyIdx = selectedSlots.findIndex((s) => !s);
                    const pos =
                      slotPickIndex != null
                        ? slotPickIndex + 1
                        : emptyIdx >= 0
                          ? emptyIdx + 1
                          : 1;
                    const r = await scheduleAssetAction(a.id, selectedDate, pos);
                    if (!r.ok) window.alert(r.error);
                    else {
                      refresh();
                      setSlotPickIndex(null);
                    }
                  }}
                >
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-black/40">
                    {a.image_url ? (
                      <Image src={a.image_url} alt="" fill className="object-cover" sizes="48px" unoptimized />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-white">{a.title}</p>
                    <DifficultyBadge layerCount={a.layer_count} />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "published" && (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap gap-2">
            <input
              placeholder="Search title or creator…"
              className="min-w-[200px] flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
              value={pubSearch}
              onChange={(e) => setPubSearch(e.target.value)}
            />
            <select
              className="rounded-xl border border-white/10 bg-black/30 px-2 py-2 text-sm text-white"
              value={pubFilterDiff}
              onChange={(e) => setPubFilterDiff(e.target.value as AdminDifficulty | "all")}
            >
              <option value="all">All difficulties</option>
              <option value="Easy">Easy</option>
              <option value="Medium">Medium</option>
              <option value="Hard">Hard</option>
            </select>
            <select
              className="rounded-xl border border-white/10 bg-black/30 px-2 py-2 text-sm text-white"
              value={pubFilterSoftware}
              onChange={(e) => setPubFilterSoftware(e.target.value)}
            >
              <option value="all">All software</option>
              {SOFTWARE_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            <select
              className="rounded-xl border border-white/10 bg-black/30 px-2 py-2 text-sm text-white"
              value={pubFilterCategory}
              onChange={(e) => setPubFilterCategory(e.target.value)}
            >
              <option value="all">All categories</option>
              {CATEGORY_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full min-w-[720px] text-left text-sm text-white/90">
              <thead className="bg-white/[0.06] text-xs uppercase tracking-wide text-white/50">
                <tr>
                  <th className="px-3 py-2">Thumb</th>
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Pos</th>
                  <th className="px-3 py-2">Creator</th>
                  <th className="px-3 py-2">Guesses</th>
                  <th className="px-3 py-2">Players</th>
                  <th className="px-3 py-2">Solve %</th>
                  <th className="px-3 py-2">DL</th>
                </tr>
              </thead>
              <tbody>
                {publishedList.map(({ asset, active_date, position, stats }) => (
                  <tr key={asset.id} className="border-t border-white/10">
                    <td className="px-3 py-2">
                      <div className="relative h-12 w-16 overflow-hidden rounded-lg bg-black/40">
                        {asset.image_url ? (
                          <Image
                            src={asset.image_url}
                            alt=""
                            fill
                            className="object-cover"
                            sizes="64px"
                            unoptimized
                          />
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <DifficultyBadge layerCount={asset.layer_count} />
                        <span className="font-medium">{asset.title}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-white/70">{active_date}</td>
                    <td className="px-3 py-2">{position}</td>
                    <td className="px-3 py-2 text-white/70">{asset.creator_name ?? "—"}</td>
                    <td className="px-3 py-2">{stats?.total_guesses?.toLocaleString() ?? "—"}</td>
                    <td className="px-3 py-2">{stats?.unique_players?.toLocaleString() ?? "—"}</td>
                    <td className="px-3 py-2">
                      {stats != null ? `${stats.solve_rate_pct.toFixed(1)}%` : "—"}
                    </td>
                    <td className="px-3 py-2">{stats?.downloads?.toLocaleString() ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editAsset && (
        <EditAssetModal
          asset={editAsset}
          onClose={() => setEditAsset(null)}
          onSaved={() => {
            setEditAsset(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function EditAssetModal({
  asset,
  onClose,
  onSaved,
}: {
  asset: AssetRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(asset.title);
  const [creator_name, setCreator_name] = useState(asset.creator_name ?? "");
  const [software, setSoftware] = useState(asset.software as SoftwareOption);
  const [category, setCategory] = useState(asset.category as CategoryOption);
  const [layer_count, setLayer_count] = useState(String(asset.layer_count));
  const [is_sponsored, setIs_sponsored] = useState(asset.is_sponsored);
  const [sponsor_name, setSponsor_name] = useState(asset.sponsor_name ?? "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/15 bg-[#160828] p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Edit asset</h2>
          <button type="button" className="text-sm text-white/60" onClick={onClose}>
            Close
          </button>
        </div>
        <label className="mb-3 block text-xs font-semibold uppercase text-white/45">
          Title
          <input
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm text-white"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="mb-3 block text-xs font-semibold uppercase text-white/45">
          Creator
          <CreatorAutocompleteInput value={creator_name} onChange={setCreator_name} />
        </label>
        <div className="mb-3 grid grid-cols-2 gap-2">
          <label className="block text-xs font-semibold uppercase text-white/45">
            Software
            <select
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm text-white"
              value={software}
              onChange={(e) => setSoftware(e.target.value as SoftwareOption)}
            >
              {SOFTWARE_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-semibold uppercase text-white/45">
            Category
            <select
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm text-white"
              value={category}
              onChange={(e) => setCategory(e.target.value as CategoryOption)}
            >
              {CATEGORY_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="mb-3 block text-xs font-semibold uppercase text-white/45">
          Layer count
          <input
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm text-white"
            value={layer_count}
            onChange={(e) => setLayer_count(e.target.value)}
          />
        </label>
        <label className="mb-3 flex items-center gap-2 text-sm text-white/80">
          <input type="checkbox" checked={is_sponsored} onChange={(e) => setIs_sponsored(e.target.checked)} />
          Sponsored
        </label>
        {is_sponsored && (
          <label className="mb-4 block text-xs font-semibold uppercase text-white/45">
            Sponsor name
            <input
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm text-white"
              value={sponsor_name}
              onChange={(e) => setSponsor_name(e.target.value)}
            />
          </label>
        )}
        <button
          type="button"
          className="w-full rounded-xl bg-[#7c3aed] py-2.5 text-sm font-bold text-white"
          onClick={async () => {
            const r = await updateAssetAction(asset.id, {
              title,
              creator_name,
              software,
              category,
              layer_count: Number(layer_count),
              is_sponsored,
              sponsor_name,
            });
            if (!r.ok) window.alert(r.error);
            else onSaved();
          }}
        >
          Save changes
        </button>
      </div>
    </div>
  );
}

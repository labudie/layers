"use client";

import { useMemo, useState } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { difficultyFromLayerCount } from "@/lib/asset-difficulty";
import { todayYYYYMMDDUSEastern } from "@/lib/today-us-eastern";
import {
  fetchScheduledChallengesForSocialExportAction,
  type ScheduledChallengeSocialExportRow,
} from "@/app/studio/social-export-actions";

function addDaysToYmd(ymd: string, delta: number): string {
  const [y, mo, d] = ymd.split("-").map(Number);
  const dt = new Date(y, mo - 1, d);
  dt.setDate(dt.getDate() + delta);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function sanitizeFilenameSegment(raw: string | null | undefined): string {
  const spaced = String(raw ?? "").trim().replace(/\s+/g, "_");
  const cleaned = spaced.replace(/[^a-zA-Z0-9_]/g, "");
  return cleaned.slice(0, 120) || "unknown";
}

function buildZipImageName(row: ScheduledChallengeSocialExportRow): string {
  const title = sanitizeFilenameSegment(row.title);
  const creator = sanitizeFilenameSegment(row.creator_name);
  return `${row.active_date}_P${row.position}_${title}_${creator}.png`;
}

function escapeCsvCell(v: string | number): string {
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildScheduleCsv(rows: ScheduledChallengeSocialExportRow[]): string {
  const header = ["Date", "Position", "Title", "Creator", "Layer Count", "Difficulty"];
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [
        escapeCsvCell(r.active_date),
        escapeCsvCell(r.position),
        escapeCsvCell(r.title ?? ""),
        escapeCsvCell(r.creator_name ?? ""),
        escapeCsvCell(r.layer_count),
        escapeCsvCell(difficultyFromLayerCount(r.layer_count)),
      ].join(","),
    ),
  ];
  return lines.join("\n");
}

async function resizeImageForSocial(imageUrl: string): Promise<Blob> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = imageUrl;
  });

  const MAX_WIDTH = 1080;
  const scale = img.width > MAX_WIDTH ? MAX_WIDTH / img.width : 1;
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas context");

  ctx.drawImage(img, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("toBlob failed"));
      },
      "image/png",
      0.92,
    );
  });
}

export function SocialExportForSocialsButton() {
  const defaults = useMemo(() => {
    const today = todayYYYYMMDDUSEastern();
    return {
      start: addDaysToYmd(today, 1),
      end: addDaysToYmd(today, 14),
    };
  }, []);

  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);
  const [busy, setBusy] = useState(false);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);

  const runExport = async () => {
    setBusy(true);
    setProgressLabel("Loading schedule…");
    try {
      const res = await fetchScheduledChallengesForSocialExportAction(startDate, endDate);
      if (!res.ok || !res.rows) {
        window.alert(res.error ?? "Could not load challenges.");
        return;
      }
      const rows = res.rows;
      if (rows.length === 0) {
        window.alert("No scheduled challenges in this date range.");
        return;
      }

      const zip = new JSZip();
      zip.file("schedule.csv", buildScheduleCsv(rows));

      const imgFolder = zip.folder("images");
      const usedNames = new Set<string>();

      const withUrls = rows.filter((r) => Boolean(r.image_url?.trim()));
      const totalImages = withUrls.length;
      let downloaded = 0;

      for (const row of rows) {
        const url = row.image_url?.trim();
        if (!url || !imgFolder) continue;
        downloaded += 1;
        setProgressLabel(
          `Downloading image ${downloaded} of ${totalImages}… Resizing for social (1080px max)…`,
        );

        const stem = buildZipImageName(row).replace(/\.png$/i, "");
        let uniqueName = `${stem}.png`;
        let dup = 2;
        while (usedNames.has(uniqueName)) {
          uniqueName = `${stem}_${dup}.png`;
          dup += 1;
        }
        usedNames.add(uniqueName);

        try {
          const resized = await resizeImageForSocial(url);
          imgFolder.file(uniqueName, resized);
        } catch {
          /* skip failed loads / resize; row remains in CSV */
        }
      }

      setProgressLabel("Building ZIP…");
      const blob = await zip.generateAsync({ type: "blob" });
      const safeStart = startDate.replace(/-/g, "");
      const safeEnd = endDate.replace(/-/g, "");
      saveAs(blob, `layers-social-export_${safeStart}_${safeEnd}.zip`);
    } finally {
      setProgressLabel(null);
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-white/15 bg-[rgba(26,10,46,0.55)] px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-white/55">Social export</div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-white/80">
          <span className="mb-1 block text-[10px] uppercase text-white/45">Start</span>
          <input
            type="date"
            value={startDate}
            disabled={busy}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border border-white/15 bg-black/35 px-2 py-2 text-white disabled:opacity-50"
          />
        </label>
        <label className="text-sm text-white/80">
          <span className="mb-1 block text-[10px] uppercase text-white/45">End</span>
          <input
            type="date"
            value={endDate}
            disabled={busy}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-lg border border-white/15 bg-black/35 px-2 py-2 text-white disabled:opacity-50"
          />
        </label>
        <button
          type="button"
          disabled={busy}
          className="rounded-xl border border-emerald-500/45 bg-emerald-600/20 px-4 py-2.5 text-sm font-bold text-emerald-100 hover:bg-emerald-600/30 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => void runExport()}
        >
          {busy ? "Working…" : "Export for Socials"}
        </button>
      </div>
      {progressLabel ? (
        <p className="text-xs font-medium text-emerald-200/90">{progressLabel}</p>
      ) : (
        <p className="text-[11px] text-white/45">
          ZIP includes <span className="font-mono text-white/65">schedule.csv</span> and challenge images (
          <span className="font-mono text-white/65">images/</span>
          ).
        </p>
      )}
    </div>
  );
}

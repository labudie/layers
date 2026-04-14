"use client";

import type { AnalyticsExportRow } from "@/lib/admin-studio-analytics";

function escapeCsvCell(v: string | number): string {
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCsv(rows: AnalyticsExportRow[]): string {
  const header = [
    "date",
    "DAU",
    "new_users",
    "total_guesses",
    "sponsored_challenge_impressions",
  ];
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [
        escapeCsvCell(r.date),
        escapeCsvCell(r.dau),
        escapeCsvCell(r.new_users),
        escapeCsvCell(r.total_guesses),
        escapeCsvCell(r.sponsored_challenge_impressions),
      ].join(","),
    ),
  ];
  return lines.join("\n");
}

export function AnalyticsExportButton({ rows }: { rows: AnalyticsExportRow[] }) {
  return (
    <button
      type="button"
      className="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/15 px-4 py-2.5 text-sm font-bold text-white hover:bg-[var(--accent)]/25"
      onClick={() => {
        const csv = buildCsv(rows);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const d = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `layers-analytics-${d}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }}
    >
      Export Report (CSV)
    </button>
  );
}

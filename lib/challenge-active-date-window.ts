/**
 * Inclusive active_date range: UTC calendar yesterday … tomorrow (3 days).
 * Avoids missing rows when stored calendar dates don’t match a single “today” in one zone.
 */
export function utcActiveDateWindow(now: Date = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  const start = new Date(Date.UTC(y, m, d - 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(y, m, d + 1)).toISOString().slice(0, 10);
  return { start, end };
}

/** If the window returns multiple calendar days, keep only the latest active_date. */
export function narrowToLatestActiveDate<
  T extends { active_date: string | null },
>(rows: T[]): T[] {
  if (!rows.length) return [];
  const dates = [
    ...new Set(
      rows.map((r) => r.active_date).filter((x): x is string => Boolean(x))
    ),
  ].sort();
  if (!dates.length) return [];
  const pick = dates[dates.length - 1]!;
  return rows.filter((r) => r.active_date === pick);
}

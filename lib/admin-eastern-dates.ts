import { US_EASTERN_TZ } from "@/lib/today-us-eastern";

const easternParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: US_EASTERN_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function toEasternYmd(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return easternParts.format(d);
}

/** UTC instant near local noon on Eastern calendar day `ymd` (YYYY-MM-DD). */
export function easternNoonUtcMs(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  let lo = Date.UTC(y, m - 1, d - 1);
  let hi = Date.UTC(y, m - 1, d + 1);
  while (hi - lo > 1000) {
    const mid = lo + (hi - lo) / 2;
    const got = easternParts.format(new Date(mid));
    if (got === ymd) return mid;
    if (got < ymd) lo = mid;
    else hi = mid;
  }
  return lo + (hi - lo) / 2;
}

export function previousEasternYmd(ymd: string): string {
  const noon = easternNoonUtcMs(ymd);
  const prev = toEasternYmd(new Date(noon - 24 * 3600 * 1000).toISOString());
  return prev ?? ymd;
}

/** Oldest → newest: 14 Eastern calendar days ending on `todayYmd`. */
export function last14EasternDaysEnding(todayYmd: string): string[] {
  const days: string[] = new Array(14);
  let cur = todayYmd;
  for (let i = 13; i >= 0; i--) {
    days[i] = cur;
    cur = previousEasternYmd(cur);
  }
  return days;
}

/** `created_at >=` this ISO string covers signups on the oldest of the last 14 Eastern days. */
export function isoLowerBoundForLast14EasternSignups(todayYmd: string): string {
  const oldest = last14EasternDaysEnding(todayYmd)[0];
  const ms = easternNoonUtcMs(oldest) - 48 * 3600 * 1000;
  return new Date(ms).toISOString();
}

/** Next US Eastern calendar day after `ymd` (YYYY-MM-DD), for `min` on date inputs. */
export function nextEasternYmd(ymd: string): string {
  const noon = easternNoonUtcMs(ymd);
  let t = noon + 25 * 3600 * 1000;
  for (let i = 0; i < 48; i++) {
    const y = toEasternYmd(new Date(t).toISOString());
    if (y && y > ymd) return y;
    t += 3600 * 1000;
  }
  return ymd;
}

/** Walk earlier on the US Eastern calendar (non-negative `days`). */
export function subtractEasternDays(ymd: string, days: number): string {
  let cur = ymd;
  for (let i = 0; i < days; i++) cur = previousEasternYmd(cur);
  return cur;
}

/** Walk later on the US Eastern calendar (non-negative `days`). */
export function addEasternDays(ymd: string, days: number): string {
  let cur = ymd;
  for (let i = 0; i < days; i++) cur = nextEasternYmd(cur);
  return cur;
}

/** Inclusive count of Eastern calendar days from `startYmd` through `endYmd` (expects start <= end). */
export function easternDaysInclusive(startYmd: string, endYmd: string): number {
  if (endYmd < startYmd) return 0;
  let n = 0;
  let cur = startYmd;
  for (;;) {
    n++;
    if (cur === endYmd) return n;
    cur = nextEasternYmd(cur);
  }
}

const easternWeekdayLong = new Intl.DateTimeFormat("en-US", {
  timeZone: US_EASTERN_TZ,
  weekday: "long",
});

/** Monday-start week: the Eastern YYYY-MM-DD of the Monday on or before `ymd`. */
export function easternMondayOnOrBefore(ymd: string): string {
  let cur = ymd;
  for (let i = 0; i < 7; i++) {
    const noon = easternNoonUtcMs(cur);
    const wd = easternWeekdayLong.format(new Date(noon));
    if (wd === "Monday") return cur;
    cur = previousEasternYmd(cur);
  }
  return ymd;
}

export type EasternWeekRange = {
  /** Monday YYYY-MM-DD */
  start: string;
  /** Sunday YYYY-MM-DD */
  end: string;
  label: string;
};

/** `weekOffset` 0 = week containing `todayYmd`, -1 = previous, etc. Monday–Sunday Eastern. */
export function easternWeekRangeContaining(
  todayYmd: string,
  weekOffset: number,
): EasternWeekRange {
  const monThis = easternMondayOnOrBefore(todayYmd);
  const monStart = subtractEasternDays(monThis, (-weekOffset) * 7);
  const sunEnd = addEasternDays(monStart, 6);
  const label = `Week of ${formatEasternWeekLabel(monStart)}`;
  return { start: monStart, end: sunEnd, label };
}

function formatEasternWeekLabel(mondayYmd: string): string {
  const noon = easternNoonUtcMs(mondayYmd);
  return new Date(noon).toLocaleDateString("en-US", {
    timeZone: US_EASTERN_TZ,
    month: "short",
    day: "numeric",
  });
}

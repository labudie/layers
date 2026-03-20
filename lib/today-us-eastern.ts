export const US_EASTERN_TZ = "America/New_York";

/** Calendar YYYY-MM-DD in US Eastern (handles EST/EDT). */
export function todayYYYYMMDDUSEastern(date: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: US_EASTERN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  if (!y || !m || !d) {
    throw new Error("Could not format date for US Eastern");
  }
  return `${y}-${m}-${d}`;
}

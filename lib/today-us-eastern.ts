export const US_EASTERN_TZ = "America/New_York";

/** Calendar YYYY-MM-DD in US Eastern (handles EST/EDT). */
export function todayYYYYMMDDUSEastern(date: Date = new Date()) {
  const ymd = date.toLocaleDateString("en-CA", {
    timeZone: US_EASTERN_TZ,
  });
  if (!ymd) {
    throw new Error("Could not format date for US Eastern");
  }
  return ymd;
}

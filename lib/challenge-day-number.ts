/** Day index from launch calendar day (1 = LAUNCH_DATE). */
export function dayNumberFromActiveDate(activeDate: string): number {
  const LAUNCH_DATE = '2026-05-01';
  const dayNumber =
    Math.floor(
      (new Date(activeDate).getTime() - new Date(LAUNCH_DATE).getTime()) /
        (1000 * 60 * 60 * 24),
    ) + 1;
  return dayNumber;
}

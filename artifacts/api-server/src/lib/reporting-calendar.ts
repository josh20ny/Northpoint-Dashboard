export const REPORTING_TIMEZONE = "America/Chicago";
const reportingDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: REPORTING_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Monday–Sunday local reporting week, identified by the upcoming/ending Sunday.
 * Calendar arithmetic uses UTC on a local-date string, never fixed 24h intervals
 * added to a Chicago instant (which breaks at DST).
 */
export function reportingWeekEnding(instant: Date): string {
  if (Number.isNaN(instant.getTime())) throw new Error("Invalid reporting instant");
  const parts = reportingDateFormatter.formatToParts(instant);
  const part = (kind: string) => parts.find((item) => item.type === kind)!.value;
  const localDate = new Date(`${part("year")}-${part("month")}-${part("day")}T00:00:00Z`);
  localDate.setUTCDate(localDate.getUTCDate() + ((7 - localDate.getUTCDay()) % 7));
  return localDate.toISOString().slice(0, 10);
}

/** Calendar-only Sunday labels must not shift when the browser is outside Chicago. */
export function formatDate(iso?: string, withTime = false) {
  if (!iso) return "—";
  const calendarOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const date = new Date(calendarOnly ? `${iso}T12:00:00Z` : iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(withTime && !calendarOnly
      ? ({ hour: "numeric", minute: "2-digit", timeZoneName: "short" } as const)
      : {}),
  }).format(date);
}

import type { AttendanceRevision, AttendanceWeek } from "@workspace/api-zod";
import { reportingWeekEnding } from "./reporting-calendar";
import { validCalendarDate } from "./administration";

export const SLOTS = ["adult_service_1", "adult_service_2"] as const;
export const UNRECORDED_SUNDAYS = ["2026-04-12", "2026-04-19", "2026-04-26", "2026-05-03"];
export const DEFINITION_TEXT =
  "People seated in the auditorium attending the service; excludes volunteers and people on stage. Sum of service headcounts, not unique people.";
export function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const chicagoDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Chicago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export function chicagoDate(now: Date) {
  return chicagoDateFormatter.format(now);
}
export function completedSunday(now: Date) {
  return shiftDate(reportingWeekEnding(now), -7);
}
export function sunday(value: string) {
  return validCalendarDate(value) && new Date(`${value}T12:00:00Z`).getUTCDay() === 0;
}
export function calculateWeeks(
  revisions: AttendanceRevision[],
  start: string,
  end: string,
  today: string,
  effectiveFrom: string,
): AttendanceWeek[] {
  const result: AttendanceWeek[] = [];
  for (let week = start; week <= end; week = shiftDate(week, 7)) {
    const current = SLOTS.map((slot) =>
      revisions.find((r) => r.serviceDate === week && r.slot === slot),
    );
    const recorded = current.filter(
      (r): r is AttendanceRevision => !!r && r.valid && r.status === "recorded",
    );
    const count = recorded.reduce((sum, r) => sum + r.count!, 0);
    const unrecorded =
      UNRECORDED_SUNDAYS.includes(week) || current.some((r) => r?.status === "unrecorded");
    const invalid = current.some((r) => r && !r.valid);
    const quality =
      week > today
        ? "future"
        : week < effectiveFrom
          ? "missing"
          : invalid
            ? "invalidated"
            : unrecorded
              ? "unrecorded"
              : recorded.length === 2
                ? "complete"
                : recorded.length
                  ? "partial"
                  : "missing";
    result.push({
      week,
      value: quality === "complete" ? count : null,
      knownSubtotal: recorded.length ? count : null,
      recordedServices: recorded.length,
      expectedServices: 2,
      quality,
      lastUpdatedAt:
        current
          .filter((r) => !!r)
          .map((r) => r.createdAt)
          .sort()
          .at(-1) ?? null,
    });
  }
  return result;
}

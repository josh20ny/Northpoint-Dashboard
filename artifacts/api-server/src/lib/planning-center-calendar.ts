import type { PlanningCenterSchedule } from "@workspace/api-zod";

export type ScheduleSettings = Pick<
  PlanningCenterSchedule,
  | "timeZone"
  | "localTime"
  | "frequency"
  | "weekDays"
  | "intervalCount"
  | "intervalUnit"
  | "anchorDate"
>;
export const defaultSchedule: ScheduleSettings = {
  timeZone: "America/Chicago",
  localTime: "01:00",
  frequency: "daily",
  weekDays: [0],
  intervalCount: 1,
  intervalUnit: "days",
  anchorDate: "1970-01-05",
};
export function validTimeZone(zone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone }).format();
    return true;
  } catch {
    return false;
  }
}
const DAY = 86_400_000;
// Resolve wall-clock slots explicitly: first occurrence in a repeated hour;
// advance by the DST gap when a local time does not exist (02:30 → 03:30).
export function nextScheduledAt(now: Date, settings: ScheduleSettings): Date {
  const format = new Intl.DateTimeFormat("en-CA", {
    timeZone: settings.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const wall = (date: Date) => {
    const p = Object.fromEntries(format.formatToParts(date).map((v) => [v.type, v.value]));
    return Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!);
  };
  const localNow = new Date(wall(now));
  const midnight = Date.UTC(
    localNow.getUTCFullYear(),
    localNow.getUTCMonth(),
    localNow.getUTCDate(),
  );
  const [hour, minute] = settings.localTime.split(":").map(Number);
  const start = hour! * 60 + minute!;
  const custom = settings.frequency === "custom";
  const anchor = new Date(`${settings.anchorDate}T00:00:00Z`).getTime();
  const count = settings.intervalCount;
  // Week intervals are calendar weeks beginning Monday, not elapsed 168-hour blocks.
  const weekStart = (day: number) => day - ((new Date(day).getUTCDay() + 6) % 7) * DAY;
  const firstDay = custom ? Math.max(midnight, anchor) : midnight;
  const horizon = !custom
    ? 9
    : settings.intervalUnit === "weeks"
      ? count * 7 + 8
      : settings.intervalUnit === "days"
        ? count + 2
        : Math.ceil(count / 24) + 2;
  const candidates: number[] = [];
  for (let d = 0; d < horizon; d++) {
    const day = firstDay + d * DAY;
    const weekly = settings.frequency === "weekly" || (custom && settings.intervalUnit === "weeks");
    if (weekly && !settings.weekDays.includes(new Date(day).getUTCDay())) continue;
    if (custom && settings.intervalUnit === "days" && ((day - anchor) / DAY) % count !== 0)
      continue;
    if (
      custom &&
      settings.intervalUnit === "weeks" &&
      ((weekStart(day) - weekStart(anchor)) / (7 * DAY)) % count !== 0
    )
      continue;
    const slots =
      custom && settings.intervalUnit === "hours"
        ? Array.from({ length: 24 }, (_, h) => h * 60 + minute!).filter((slot) => {
            const distance = (day - anchor) / 60_000 + slot - start;
            return distance >= 0 && distance % (count * 60) === 0;
          })
        : [start];
    for (const slot of slots) {
      const target = day + slot * 60_000;
      const offsets = new Set(
        [-DAY, 0, DAY].map((delta) => {
          const sample = target + delta;
          return wall(new Date(sample)) - sample;
        }),
      );
      const resolved = [...offsets].map((offset) => target - offset);
      const exact = resolved.filter((instant) => wall(new Date(instant)) === target);
      const shifted = resolved
        .filter((instant) => wall(new Date(instant)) > target)
        .sort((a, b) => wall(new Date(a)) - wall(new Date(b)));
      const instant = exact.length ? Math.min(...exact) : shifted[0];
      if (instant !== undefined && instant > now.getTime()) candidates.push(instant);
    }
  }
  if (!candidates.length) throw new Error("Could not calculate refresh time");
  return new Date(Math.min(...candidates));
}

const SERVICE_TIME_ZONE = "America/Chicago";
const chicagoDateTimeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SERVICE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
const chicagoZoneNameFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: SERVICE_TIME_ZONE,
  timeZoneName: "short",
});

type ChicagoParts = {
  date: string;
  time: string;
};

export type ChicagoTimeResolution =
  | { kind: "invalid" }
  | { kind: "nonexistent" }
  | { kind: "valid"; instant: string }
  | { kind: "ambiguous"; instants: [string, string] };

function partsForInstant(instant: Date): ChicagoParts {
  const parts = chicagoDateTimeFormatter.formatToParts(instant);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}:${values.second}`,
  };
}

function parseLocalDateTime(date: string, time: string) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  if (!dateMatch || !timeMatch) return null;

  const [, yearText, monthText, dayText] = dateMatch;
  const [, hourText, minuteText, secondText = "0"] = timeMatch;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const wallClockAsUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    wallClockAsUtc.getUTCFullYear() !== year ||
    wallClockAsUtc.getUTCMonth() !== month - 1 ||
    wallClockAsUtc.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null;
  }

  return {
    wallClockAsUtc,
    date,
    time: `${hourText}:${minuteText}:${String(second).padStart(2, "0")}`,
  };
}

function chicagoOffsetMinutes(instantMs: number): number {
  const instant = new Date(instantMs);
  const local = partsForInstant(instant);
  const [year, month, day] = local.date.split("-").map(Number);
  const [hour, minute, second] = local.time.split(":").map(Number);
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  return (localAsUtc - Math.floor(instantMs / 1000) * 1000) / 60_000;
}

export function resolveChicagoServiceTime(date: string, time: string): ChicagoTimeResolution {
  const local = parseLocalDateTime(date, time);
  if (!local) return { kind: "invalid" };

  const wallClockMs = local.wallClockAsUtc.getTime();
  const offsets = new Set<number>();
  for (let hours = -48; hours <= 48; hours += 3) {
    offsets.add(chicagoOffsetMinutes(wallClockMs + hours * 60 * 60 * 1000));
  }

  const instants = [...offsets]
    .map((offset) => new Date(wallClockMs - offset * 60_000))
    .filter((instant) => {
      const parts = partsForInstant(instant);
      return parts.date === local.date && parts.time === local.time;
    })
    .map((instant) => instant.toISOString())
    .sort();

  if (instants.length === 0) return { kind: "nonexistent" };
  if (instants.length === 1) return { kind: "valid", instant: instants[0] };
  return { kind: "ambiguous", instants: [instants[0], instants[1]] };
}

export function chicagoDateTimeFromInstant(value: string): ChicagoParts {
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) throw new Error("Invalid service start timestamp");
  return partsForInstant(instant);
}

export function chicagoAbbreviation(instant: string): string {
  const part = chicagoZoneNameFormatter
    .formatToParts(new Date(instant))
    .find(({ type }) => type === "timeZoneName");
  return part?.value ?? "Chicago time";
}

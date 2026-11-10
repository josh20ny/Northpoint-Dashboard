import type {
  AttendanceRollingAverage,
  AttendanceYearComparison,
} from "@workspace/api-client-react";
import { fmtCount } from "@/lib/attendance";

export const AVERAGE_WEEK_OPTIONS = Array.from({ length: 52 }, (_, i) => i + 1);
export const DEFAULT_AVERAGE_WEEKS = 4;

export function AverageWeeksControl({
  value,
  onChange,
  updating,
  testId = "select-average-weeks",
}: {
  value: number;
  onChange: (n: number) => void;
  updating: boolean;
  testId?: string;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-[12px] font-medium">
      Average over
      <select
        data-testid={testId}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-8 rounded-md border border-input bg-background px-2 text-[12.5px] font-normal"
      >
        {AVERAGE_WEEK_OPTIONS.map((n) => (
          <option key={n} value={n}>
            {n} {n === 1 ? "week" : "weeks"}
          </option>
        ))}
      </select>
      <span aria-live="polite" className="text-[11.5px] font-normal text-muted-foreground">
        {updating ? "Updating..." : ""}
      </span>
    </label>
  );
}

function avgFmt(v: number) {
  return v.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export function RollingAverageView({
  avg,
  stale,
  compact,
}: {
  avg: AttendanceRollingAverage;
  stale: boolean;
  compact?: boolean;
}) {
  return (
    <div className={stale ? "opacity-50" : undefined} aria-busy={stale}>
      <p className="font-mono text-[18px] font-semibold" data-testid="text-rolling-average">
        {avg.value !== null ? avgFmt(avg.value) : "No average"}
      </p>
      <p className="mt-1 text-[12px] text-muted-foreground" data-testid="text-rolling-window">
        {avg.windowWeeks}-week window, {avg.start} to {avg.end}.{" "}
        {avg.value !== null
          ? `Averaged over ${avg.recordedWeeks} complete week${avg.recordedWeeks === 1 ? "" : "s"}.`
          : "No complete weeks in this window."}
        {avg.excludedWeeks.length > 0 && ` ${avg.excludedWeeks.length} excluded.`}
      </p>
      {!compact && avg.excludedWeeks.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[11.5px] text-muted-foreground" data-testid="list-excluded-weeks">
          {avg.excludedWeeks.map((x) => (
            <li key={x.week}>
              <span className="font-mono">{x.week}</span> excluded: {x.reason}
            </li>
          ))}
        </ul>
      )}
      {stale && <p className="mt-1 text-[11.5px] font-medium">Recalculating for the new window.</p>}
    </div>
  );
}

const STATUS_TEXT: Record<string, string> = {
  missing_current: "No complete total for this week, so no comparison.",
  missing_baseline: "No total recorded for the same week last year.",
  conflicting_baselines: "Last year's sources disagree. Not compared.",
  zero_baseline: "Last year's total was 0, so a percent change cannot be calculated.",
};

export function YearComparisonView({
  yc,
  showCell,
}: {
  yc: AttendanceYearComparison;
  showCell: boolean;
}) {
  const ok = yc.status === "available" && yc.change !== null;
  const sign = (n: number) => (n > 0 ? "+" : n < 0 ? "-" : "");
  const sourceLabel =
    yc.source === "workbook" ? "workbook" : yc.source === "recorded" ? "recorded counts" : null;
  return (
    <div data-testid="status-yoy">
      {ok ? (
        <p className="font-mono text-[18px] font-semibold" data-testid="text-yoy-change">
          {sign(yc.change!)}
          {fmtCount(Math.abs(yc.change!))}
          {yc.percentChange !== null && (
            <span className="ml-2 text-[13px] font-normal text-muted-foreground">
              ({sign(yc.percentChange)}
              {Math.abs(yc.percentChange).toFixed(1)}%)
            </span>
          )}
        </p>
      ) : (
        <p className="text-[13px] font-medium" data-testid="text-yoy-unavailable">
          {STATUS_TEXT[yc.status] ?? "Not available."}
        </p>
      )}
      <p className="mt-1 text-[12px] text-muted-foreground">
        Week {yc.weekNumber}: {yc.currentWeek}{" "}
        ({yc.currentValue !== null ? fmtCount(yc.currentValue) : "no total"}) vs{" "}
        {yc.baselineYear}
        {yc.baselineWeek ? ` week of ${yc.baselineWeek}` : ""} (
        {yc.baselineValue !== null ? fmtCount(yc.baselineValue) : "no total"}).
        {sourceLabel && ` Baseline from ${sourceLabel}`}
        {sourceLabel && showCell && yc.sourceCell ? `, cell ${yc.sourceCell}` : ""}
        {sourceLabel && "."} Aligned by {yc.alignment}.
      </p>
    </div>
  );
}

import { useRef, useState, type FormEvent } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import {
  getGetAttendanceQueryKey,
  useGetAttendance,
  type AttendanceRevision,
  type AttendanceWorkspace,
} from "@workspace/api-client-react";
import { ListOrdered, RefreshCw, Rows3 } from "lucide-react";
import { KV, Panel, QueryError, RefreshButton, StatusPill, formatDate } from "@/components/kit";
import { Skeleton } from "@/components/ui/skeleton";
import {
  EmptyRecord,
  RestrictedState,
  SectionHeading,
  TextField,
} from "@/components/admin-controls";
import {
  AverageWeeksControl,
  DEFAULT_AVERAGE_WEEKS,
  RollingAverageView,
  YearComparisonView,
} from "@/components/attendance-comparison";
import { keepPreviousData } from "@tanstack/react-query";
import { DefinitionSetup } from "@/components/attendance-admin";
import {
  WeeklyAttendanceEntry,
  defaultEntryDate,
  type EntryTarget,
} from "@/components/weekly-attendance-entry";
import {
  QUALITY_LABEL,
  QUALITY_TONE,
  SLOTS,
  attendancePolling,
  currentRevision,
  fmtCount,
  slotLabel,
  type SlotValue,
} from "@/lib/attendance";

const MAX_DAYS = 731;
function rangeError(start: string, end: string) {
  if (!start && !end) return null;
  if (!start || !end) return "Enter both dates.";
  const s = Date.parse(start);
  const e = Date.parse(end);
  if (Number.isNaN(s) || Number.isNaN(e)) return "Enter valid dates.";
  if (s > e) return "Start must be on or before end.";
  if ((e - s) / 86400000 > MAX_DAYS) return "Range is limited to 2 years.";
  return null;
}

export default function AttendanceDetails() {
  const { user, enabled, isLoading: authLoading, csrfToken } = useAuth();
  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState("");
  const [range, setRange] = useState<{ start?: string; end?: string } | undefined>(undefined);
  const [definitionId, setDefinitionId] = useState("");
  const [averageWeeks, setAverageWeeks] = useState(DEFAULT_AVERAGE_WEEKS);
  const params = {
    ...(range ?? {}),
    ...(definitionId ? { definitionId } : {}),
    averageWeeks,
  };
  const q = useGetAttendance(params, {
    query: {
      enabled: !!user,
      queryKey: getGetAttendanceQueryKey(params),
      placeholderData: keepPreviousData,
      ...attendancePolling,
    },
  });
  const w = q.data;
  const stale = q.isPlaceholderData;
  const [editTarget, setEditTarget] = useState<EntryTarget | null>(null);
  const filterError = rangeError(draftStart, draftEnd);
  // Seed only: the entry form owns its own single-week query.
  const seedRef = useRef<{ userId: string; date: string } | null>(null);
  if (user && w && seedRef.current?.userId !== user.id)
    seedRef.current = { userId: user.id, date: defaultEntryDate(w.latestCompletedWeek) };
  const seed = user && seedRef.current?.userId === user.id ? seedRef.current.date : null;

  const header = (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="font-display text-xl font-semibold">Adult attendance</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Seated auditorium counts by service, with every edit kept.
        </p>
      </div>
      {user && <RefreshButton busy={q.isFetching} onClick={() => void q.refetch()} />}
    </div>
  );

  if (authLoading)
    return (
      <>
        {header}
        <Skeleton className="h-40 w-full" />
      </>
    );
  if (!enabled)
    return (
      <>
        {header}
        <RestrictedState
          title="Authentication is not enabled"
          detail="Attendance is shown only to signed-in staff."
        />
      </>
    );
  if (!user)
    return (
      <>
        {header}
        <RestrictedState
          title="Log in to continue"
          detail="Attendance is limited to invited Northpoint Austin staff."
        />
      </>
    );

  const applyFilter = (e: FormEvent) => {
    e.preventDefault();
    if (filterError) return;
    setRange(draftStart && draftEnd ? { start: draftStart, end: draftEnd } : undefined);
  };

  return (
    <>
      {header}
      <form
        onSubmit={applyFilter}
        className="mb-5 flex flex-wrap items-end gap-3 rounded-lg border bg-card px-4 py-3"
        aria-label="Date range"
      >
        <div className="w-40">
          <TextField
            name="range-start"
            label="Start (Sunday)"
            type="date"
            hint="Use Sunday dates."
            value={draftStart}
            onChange={setDraftStart}
          />
        </div>
        <div className="w-40">
          <TextField
            name="range-end"
            label="End (Sunday)"
            type="date"
            value={draftEnd}
            onChange={setDraftEnd}
          />
        </div>
        <button
          type="submit"
          data-testid="button-apply-range"
          disabled={!!filterError}
          className="h-10 rounded-md bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground disabled:opacity-50"
        >
          Apply
        </button>
        {range && (
          <button
            type="button"
            data-testid="button-reset-range"
            onClick={() => {
              setDraftStart("");
              setDraftEnd("");
              setRange(undefined);
            }}
            className="h-10 rounded-md border px-3 text-[13px]"
          >
            Default range
          </button>
        )}
        {w && w.definitions.length > 0 && (
          <label className="block w-56 text-[12px] font-medium">
            Definition version
            <select
              data-testid="select-definition-version"
              value={definitionId}
              onChange={(e) => setDefinitionId(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-[13px] font-normal"
            >
              <option value="">Latest</option>
              {[...w.definitions]
                .sort((a, b) => b.version - a.version)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    v{d.version} · from {d.effectiveFrom}
                  </option>
                ))}
            </select>
          </label>
        )}
        {filterError && (
          <p role="alert" className="w-full text-[12px] text-destructive">
            {filterError}
          </p>
        )}
        {w && (
          <p className="ml-auto text-[11.5px] text-muted-foreground" data-testid="text-range">
            {w.start} to {w.end} · {w.timezone}
          </p>
        )}
      </form>

      {q.isRefetchError && w && (
        <div
          role="alert"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-950"
        >
          <span>Refresh failed. Showing data from {formatDate(w.asOf, true)}.</span>
          <button
            type="button"
            onClick={() => void q.refetch()}
            className="inline-flex h-8 items-center gap-2 rounded-md border border-amber-400 px-2.5 text-[12px] font-medium hover:bg-amber-100"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Retry
          </button>
        </div>
      )}

      {seed && (
        <div className="mb-5">
          <WeeklyAttendanceEntry
            key={`${user.id}:${definitionId || "latest"}`}
            initialDate={seed}
            definitionId={definitionId || undefined}
            csrfToken={csrfToken}
            target={editTarget}
          />
        </div>
      )}

      {q.isError && !w ? (
        <QueryError
          title="Attendance unavailable"
          error={q.error}
          onRetry={() => void q.refetch()}
        />
      ) : q.isLoading || !w ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <div className="min-w-0 space-y-5 [overflow-wrap:anywhere]">
          {!w.isCurrentDefinition && w.definition && (
            <div
              role="status"
              data-testid="status-prior-definition"
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-950"
            >
              <span>
                Viewing prior version{w.definition ? ` v${w.definition.version}` : ""}. Read only.
              </span>
              <button
                type="button"
                data-testid="button-latest-definition"
                onClick={() => setDefinitionId("")}
                className="h-8 rounded-md border border-amber-400 px-2.5 text-[12px] font-medium hover:bg-amber-100"
              >
                View latest
              </button>
            </div>
          )}
          <Summary
            w={w}
            averageWeeks={averageWeeks}
            onAverageWeeks={setAverageWeeks}
            stale={stale}
            showCell={user.role !== "staff"}
          />
          <WeeklyTable
            w={w}
            onEdit={(date, slot) => setEditTarget({ date, slot, nonce: Date.now() })}
          />
          <RevisionLog revisions={w.revisions} truncated={w.historyTruncated} />
          {user.role === "admin" && (
            <>
              <DefinitionSetup
                key={w.definition?.id ?? "none"}
                workspace={w}
                csrfToken={csrfToken}
              />
              <Panel className="p-5 sm:p-6">
                <h2 className="text-[13px] font-semibold">Workbook history</h2>
                <p className="mt-2 text-[12.5px] text-muted-foreground">
                  Accepted workbook attendance is imported in bulk. You do not need to publish each
                  week. Source mappings and any unreadable records are managed in Imports.
                </p>
              </Panel>
            </>
          )}
        </div>
      )}
    </>
  );
}

function Summary({
  w,
  averageWeeks,
  onAverageWeeks,
  stale,
  showCell,
}: {
  w: AttendanceWorkspace;
  averageWeeks: number;
  onAverageWeeks: (n: number) => void;
  stale: boolean;
  showCell: boolean;
}) {
  const latest = [...w.weeks].reverse().find((x) => x.week <= w.latestCompletedWeek);
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] [&>section]:min-w-0">
      <Panel className="np-grid-bg relative overflow-hidden">
        <div className="bg-gradient-to-br from-card via-card/95 to-card/70 p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            {latest ? `Week of ${formatDate(latest.week)}` : "No completed Sunday in this range"}
          </p>
          <p
            className="mt-3 font-display text-[44px] font-semibold leading-none tracking-tight"
            data-testid="text-latest-total"
          >
            {latest?.value !== null && latest?.value !== undefined
              ? fmtCount(latest.value)
              : "No total"}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
            {latest ? (
              <>
                <StatusPill
                  status={QUALITY_TONE[latest.quality]}
                  label={QUALITY_LABEL[latest.quality]}
                  testId="status-latest-quality"
                />
                <span>
                  {latest.recordedServices} of {latest.expectedServices} services
                </span>
                {latest.value === null && latest.knownSubtotal !== null && (
                  <span>Known subtotal {fmtCount(latest.knownSubtotal)}</span>
                )}
              </>
            ) : (
              <span>No week in range.</span>
            )}
          </div>
          <p className="mt-4 max-w-md text-[12.5px] text-muted-foreground">{w.definitionText}</p>
        </div>
      </Panel>
      <Panel title="Context" className="[&>dl>div]:flex-wrap [&_dd]:min-w-0 [&_dd]:break-words">
        <dl>
          <div className="space-y-2 px-5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt className="text-[12.5px] text-muted-foreground">Rolling average</dt>
              <AverageWeeksControl value={averageWeeks} onChange={onAverageWeeks} updating={stale} />
            </div>
            <dd>
              <RollingAverageView avg={w.rollingAverage} stale={stale} />
            </dd>
          </div>
          <div className="space-y-1 border-t px-5 py-3">
            <dt className="text-[12.5px] text-muted-foreground">Same week last year</dt>
            <dd className={stale ? "opacity-50" : undefined}>
              <YearComparisonView yc={w.yearComparison} showCell={showCell} />
            </dd>
          </div>
          <KV
            label="Last count entered"
            value={latest?.lastUpdatedAt ? formatDate(latest.lastUpdatedAt, true) : "None"}
            testId="text-freshness"
          />
          <KV label="Checked" value={formatDate(w.asOf, true)} testId="text-as-of" />
        </dl>
      </Panel>
    </div>
  );
}

function SlotCell({ rev }: { rev?: AttendanceRevision }) {
  if (!rev) return <span className="text-muted-foreground">Missing</span>;
  if (!rev.valid) return <StatusPill status="error" label="Invalidated" />;
  if (rev.status === "unrecorded") return <span className="text-muted-foreground">Unrecorded</span>;
  return (
    <span className="font-mono">
      {fmtCount(rev.count)}
      {rev.source === "workbook" && (
        <span className="ml-1.5 text-[10.5px] text-muted-foreground">WB</span>
      )}
    </span>
  );
}

function WeeklyTable({
  w,
  onEdit,
}: {
  w: AttendanceWorkspace;
  onEdit: (date: string, slot: SlotValue) => void;
}) {
  const defId = w.definition?.id;
  const rows = [...w.weeks].reverse();
  return (
    <Panel className="p-5 sm:p-6">
      <SectionHeading
        icon={Rows3}
        title="Weekly history"
        detail="Newest first. Totals appear only when both services are recorded."
      />
      {rows.length === 0 ? (
        <EmptyRecord>No weeks in this range.</EmptyRecord>
      ) : (
        <div className="max-w-full overflow-x-auto rounded-md border [contain:inline-size_paint]">
          <table className="w-full text-[13px]">
            <caption className="sr-only">Adult attendance by week</caption>
            <thead className="bg-muted/50 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2">
                  Week
                </th>
                {SLOTS.map((s) => (
                  <th key={s.value} scope="col" className="px-3 py-2 text-right">
                    {s.label}
                  </th>
                ))}
                <th scope="col" className="px-3 py-2 text-right">
                  Total
                </th>
                <th scope="col" className="px-3 py-2">
                  Quality
                </th>
                <th scope="col" className="px-3 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.week} data-testid={`row-week-${row.week}`}>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[12px]">{row.week}</td>
                  {SLOTS.map((s) => (
                    <td key={s.value} className="px-3 py-2 text-right">
                      <SlotCell rev={currentRevision(w.revisions, row.week, s.value, defId)} />
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right font-mono font-semibold">
                    {row.value !== null ? (
                      fmtCount(row.value)
                    ) : row.knownSubtotal !== null ? (
                      <span
                        className="font-normal text-muted-foreground"
                        title="Known subtotal, not a total"
                      >
                        {fmtCount(row.knownSubtotal)} known
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill
                      status={QUALITY_TONE[row.quality]}
                      label={QUALITY_LABEL[row.quality]}
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {row.quality !== "future" &&
                      w.definition &&
                      w.isCurrentDefinition &&
                      SLOTS.map((s, i) => (
                        <button
                          key={s.value}
                          type="button"
                          data-testid={`button-edit-${row.week}-${s.value}`}
                          onClick={() => onEdit(row.week, s.value)}
                          className="ml-1 h-7 rounded-md border px-2 text-[11.5px] hover:bg-secondary"
                          aria-label={`Edit ${s.label} for ${row.week}`}
                        >
                          Edit {i + 1}
                        </button>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function RevisionLog({
  revisions,
  truncated,
}: {
  revisions: AttendanceRevision[];
  truncated: boolean;
}) {
  return (
    <Panel className="p-5 sm:p-6">
      <SectionHeading
        icon={ListOrdered}
        title="Edit history"
        detail="All revisions, newest first."
      />
      {truncated && (
        <p
          className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-950"
          data-testid="status-history-truncated"
        >
          History is truncated. Narrow the date range to see every revision.
        </p>
      )}
      {revisions.length === 0 ? (
        <EmptyRecord>No revisions in this range.</EmptyRecord>
      ) : (
        <div className="max-h-[420px] max-w-full overflow-auto rounded-md border [contain:inline-size_paint]">
          <table className="w-full text-[12.5px]">
            <caption className="sr-only">Attendance revisions</caption>
            <thead className="sticky top-0 bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2">
                  Saved
                </th>
                <th scope="col" className="px-3 py-2">
                  Date
                </th>
                <th scope="col" className="px-3 py-2">
                  Service
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  Count
                </th>
                <th scope="col" className="px-3 py-2">
                  Source
                </th>
                <th scope="col" className="px-3 py-2">
                  Note
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {revisions.map((r) => (
                <tr key={r.id} className={r.valid ? undefined : "text-muted-foreground"}>
                  <td className="whitespace-nowrap px-3 py-2">{formatDate(r.createdAt, true)}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono">{r.serviceDate}</td>
                  <td className="px-3 py-2">{slotLabel(r.slot)}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {r.status === "recorded" ? fmtCount(r.count) : "Unrecorded"}
                  </td>
                  <td className="px-3 py-2">
                    {r.source === "workbook"
                      ? `Workbook${r.reviewMethod ? ` · ${r.reviewMethod}` : ""}`
                      : "Manual"}
                    {!r.valid && (
                      <span className="ml-1.5">
                        <StatusPill status="error" label="Invalid" />
                      </span>
                    )}
                    {r.previousId && <span className="ml-1.5 text-[10.5px]">correction</span>}
                  </td>
                  <td className="max-w-[280px] px-3 py-2">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

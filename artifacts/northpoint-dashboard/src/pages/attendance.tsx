import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@workspace/replit-auth-web";
import {
  getGetAttendanceQueryKey,
  useGetAttendance,
  useSaveAttendance,
  type AttendanceRevision,
  type AttendanceWorkspace,
} from "@workspace/api-client-react";
import { ClipboardPen, ListOrdered, RefreshCw, Rows3 } from "lucide-react";
import {
  KV,
  PageHeader,
  Panel,
  QueryError,
  RefreshButton,
  StatusPill,
  formatDate,
  usePageTitle,
} from "@/components/kit";
import { Skeleton } from "@/components/ui/skeleton";
import {
  EmptyRecord,
  FormError,
  RestrictedState,
  SectionHeading,
  SelectField,
  TextField,
} from "@/components/admin-controls";
import { DefinitionSetup, HistoryPromotion } from "@/components/attendance-admin";
import {
  QUALITY_LABEL,
  QUALITY_TONE,
  SLOTS,
  attendancePolling,
  csrfRequest,
  currentRevision,
  fmtCount,
  invalidateAttendance,
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

export default function Attendance() {
  usePageTitle("Adult attendance");
  const { user, enabled, isLoading: authLoading, csrfToken } = useAuth();
  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState("");
  const [range, setRange] = useState<{ start?: string; end?: string } | undefined>(undefined);
  const [definitionId, setDefinitionId] = useState("");
  const params =
    range || definitionId
      ? { ...(range ?? {}), ...(definitionId ? { definitionId } : {}) }
      : undefined;
  const q = useGetAttendance(params, {
    query: { enabled: !!user, queryKey: getGetAttendanceQueryKey(params), ...attendancePolling },
  });
  const w = q.data;
  const [editTarget, setEditTarget] = useState<{ date: string; slot: SlotValue } | null>(null);
  const filterError = rangeError(draftStart, draftEnd);

  const header = (
    <PageHeader
      eyebrow="Northpoint Austin · Weekly"
      title="Adult attendance"
      description="Seated auditorium counts by service, with every edit kept."
      actions={
        user ? <RefreshButton busy={q.isFetching} onClick={() => void q.refetch()} /> : undefined
      }
    />
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
        <div className="space-y-5">
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
          <Summary w={w} />
          <WeeklyTable w={w} onEdit={(date, slot) => setEditTarget({ date, slot })} />
          <EntryForm
            key={w.definition?.id ?? "none"}
            w={w}
            csrfToken={csrfToken}
            target={editTarget}
            reloadWorkspace={() => q.refetch().then((result) => result.data)}
          />
          <RevisionLog revisions={w.revisions} truncated={w.historyTruncated} />
          {user.role === "admin" && (
            <>
              <DefinitionSetup
                key={w.definition?.id ?? "none"}
                workspace={w}
                csrfToken={csrfToken}
              />
              <HistoryPromotion workspace={w} csrfToken={csrfToken} />
            </>
          )}
        </div>
      )}
    </>
  );
}

function Summary({ w }: { w: AttendanceWorkspace }) {
  const latest = w.weeks.find((x) => x.week === w.latestCompletedWeek);
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] [&>section]:min-w-0">
      <Panel className="np-grid-bg relative overflow-hidden">
        <div className="bg-gradient-to-br from-card via-card/95 to-card/70 p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            Week of {formatDate(w.latestCompletedWeek)}
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
          <KV label="4-week average" value={w.fourWeek} testId="text-four-week" />
          <KV label="Year over year" value={w.yoy} testId="text-yoy" />
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
        <div className="max-w-full overflow-x-auto rounded-md border">
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

function EntryForm({
  w,
  csrfToken,
  target,
  reloadWorkspace,
}: {
  w: AttendanceWorkspace;
  csrfToken: string | null;
  target: { date: string; slot: SlotValue } | null;
  reloadWorkspace: () => Promise<AttendanceWorkspace | undefined>;
}) {
  const qc = useQueryClient();
  const mutation = useSaveAttendance(csrfRequest(csrfToken));
  const [serviceDate, setServiceDate] = useState("");
  const [slot, setSlot] = useState<SlotValue>("adult_service_1");
  const [status, setStatus] = useState<"recorded" | "unrecorded">("recorded");
  const [count, setCount] = useState("");
  const [occurrenceId, setOccurrenceId] = useState("");
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);
  // Edit baseline: captured only on explicit date/slot selection, Edit click, or reload.
  const [baseline, setBaseline] = useState<{ expectedRevision: string | null } | null>(null);
  const pendingRef = useRef<{ sig: string; requestId: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const wRef = useRef(w);
  wRef.current = w;

  const def = w.definition;

  const load = (date: string, nextSlot: SlotValue, keepNote = false, ws = wRef.current) => {
    const cur = date ? currentRevision(ws.revisions, date, nextSlot, ws.definition?.id) : undefined;
    setServiceDate(date);
    setSlot(nextSlot);
    setStatus(cur?.status ?? "recorded");
    setCount(cur && cur.count !== null ? String(cur.count) : "");
    setOccurrenceId(cur?.occurrenceId ?? "");
    if (!keepNote) setNote("");
    setBaseline(date ? { expectedRevision: cur?.id ?? null } : null);
    pendingRef.current = null;
    mutation.reset();
  };
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (!target) return;
    loadRef.current(target.date, target.slot);
    setSaved(false);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [target]);

  const reloadCurrent = (keepNote: boolean) => {
    void reloadWorkspace().then((fresh) => {
      if (fresh) loadRef.current(serviceDate, slot, keepNote, fresh);
    });
  };

  const live = serviceDate ? currentRevision(w.revisions, serviceDate, slot, def?.id) : undefined;
  const current = baseline?.expectedRevision
    ? w.revisions.find((r) => r.id === baseline.expectedRevision)
    : undefined;
  const changedSinceBaseline = !!baseline && (live?.id ?? null) !== baseline.expectedRevision;
  const conflict = !!mutation.error && (mutation.error as { status?: number }).status === 409;

  if (def && !w.isCurrentDefinition)
    return (
      <Panel className="p-5 sm:p-6">
        <SectionHeading
          icon={ClipboardPen}
          title="Record a count"
          detail="Edits are disabled for prior definition versions. Switch to the latest version."
        />
      </Panel>
    );
  if (!def)
    return (
      <Panel className="p-5 sm:p-6">
        <SectionHeading
          icon={ClipboardPen}
          title="Record a count"
          detail="Unavailable until an admin saves the count definition."
        />
      </Panel>
    );

  const occurrences = w.services.filter((s) => s.serviceDate === serviceDate);
  const countNum = count.trim() === "" ? null : Number(count);
  const errors: string[] = [];
  if (!serviceDate || !baseline) errors.push("Choose a service date.");
  if (status === "recorded") {
    if (countNum === null || !Number.isInteger(countNum) || countNum < 0)
      errors.push("Enter a whole-number count.");
    if (!occurrenceId) errors.push("Choose the service occurrence for this date.");
  }
  if (note.trim().length < 3) errors.push("Note needs at least 3 characters.");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (errors.length) return;
    if (!baseline) return;
    const body = {
      definitionId: def.id,
      serviceDate,
      slot,
      occurrenceId: occurrenceId || null,
      count: status === "recorded" ? countNum : null,
      status,
      note: note.trim(),
      expectedRevision: baseline.expectedRevision,
    };
    const sig = JSON.stringify(body);
    // Retry of an identical payload reuses its requestId; any input change gets a new one.
    if (!pendingRef.current || pendingRef.current.sig !== sig)
      pendingRef.current = { sig, requestId: crypto.randomUUID() };
    const requestId = pendingRef.current.requestId;
    setSaved(false);
    mutation.mutate(
      { data: { requestId, ...body } },
      {
        onSuccess: (revision) => {
          pendingRef.current = null;
          setBaseline({ expectedRevision: revision.id });
          setNote("");
          setSaved(true);
          void invalidateAttendance(qc);
        },
      },
    );
  };

  return (
    <Panel className="scroll-mt-6 p-5 sm:p-6">
      <form ref={formRef} onSubmit={submit} className="space-y-3">
        <SectionHeading
          icon={ClipboardPen}
          title={current ? "Correct a count" : "Record a count"}
          detail="Seated auditorium attendees only. Exclude volunteers and stage. Saves are visible immediately."
        />
        {current && (
          <p
            className="rounded-md bg-accent/50 px-3 py-2 text-[12px]"
            data-testid="text-current-revision"
          >
            Editing from: {current.status === "recorded" ? fmtCount(current.count) : "Unrecorded"} ·{" "}
            {current.source} · {formatDate(current.createdAt, true)}. Saving adds a new revision.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TextField
            name="entry-date"
            label="Service date (Sunday)"
            type="date"
            required
            value={serviceDate}
            onChange={(v) => load(v, slot)}
          />
          <SelectField
            name="entry-slot"
            label="Service"
            value={slot}
            onChange={(v) => load(serviceDate, v as SlotValue)}
          >
            {SLOTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </SelectField>
          <SelectField
            name="entry-status"
            label="Status"
            value={status}
            onChange={(v) => setStatus(v as "recorded" | "unrecorded")}
          >
            <option value="recorded">Recorded</option>
            <option value="unrecorded">Unrecorded (not zero)</option>
          </SelectField>
          {status === "recorded" && (
            <TextField
              name="entry-count"
              label="Count"
              type="number"
              min={0}
              step={1}
              required
              value={count}
              onChange={setCount}
            />
          )}
        </div>
        <label className="block text-[12px] font-medium">
          Service occurrence{status === "unrecorded" ? " (optional)" : ""}
          <select
            data-testid="select-entry-occurrence"
            value={occurrenceId}
            onChange={(e) => setOccurrenceId(e.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-[13px] font-normal"
          >
            <option value="">
              {occurrences.length ? "Select…" : "None configured for this date"}
            </option>
            {occurrences.map((o) => (
              <option key={o.id} value={o.id}>
                {formatDate(o.startAt, true)}
              </option>
            ))}
          </select>
        </label>
        {serviceDate && occurrences.length === 0 && status === "recorded" && (
          <p className="text-[12px] text-muted-foreground">
            Add a service occurrence for this date in Administration, or mark it unrecorded.
          </p>
        )}
        <TextField
          name="entry-note"
          label="Note"
          required
          maxLength={1000}
          value={note}
          onChange={setNote}
          hint="Source of the count, or why it is unrecorded (online-only, off Sunday)."
        />
        {errors.length > 0 && (serviceDate || note) && (
          <ul className="text-[12px] text-muted-foreground">
            {errors.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        )}
        <FormError error={mutation.error} />
        {conflict ? (
          <div
            role="alert"
            data-testid="status-conflict"
            className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-950"
          >
            <span className="flex-1">
              Someone saved this service since you started. Your edits are kept.
            </span>
            <button
              type="button"
              data-testid="button-reload-current"
              onClick={() => reloadCurrent(true)}
              className="h-8 rounded-md border border-amber-400 px-2.5 font-medium hover:bg-amber-100"
            >
              Reload current, keep note
            </button>
            <button
              type="button"
              data-testid="button-discard-edits"
              onClick={() => reloadCurrent(false)}
              className="h-8 rounded-md border border-amber-400 px-2.5 font-medium hover:bg-amber-100"
            >
              Discard my edits
            </button>
          </div>
        ) : (
          changedSinceBaseline && (
            <p
              role="status"
              className="text-[12px] text-amber-900"
              data-testid="status-newer-revision"
            >
              A newer revision exists. Saving will be rejected until you reload.{" "}
              <button
                type="button"
                onClick={() => reloadCurrent(true)}
                className="font-medium underline"
              >
                Reload
              </button>
            </p>
          )
        )}
        {mutation.isError && !conflict && (
          <p className="text-[11.5px] text-muted-foreground">
            Retrying unchanged input sends the same request.
          </p>
        )}
        {saved && (
          <p role="status" className="text-[12px] text-muted-foreground">
            Saved.
          </p>
        )}
        <button
          type="submit"
          data-testid="button-save-attendance"
          disabled={errors.length > 0 || mutation.isPending}
          className="inline-flex h-9 items-center rounded-md bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {mutation.isPending ? "Saving…" : current ? "Save correction" : "Save count"}
        </button>
      </form>
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
        <div className="max-h-[420px] overflow-auto rounded-md border">
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

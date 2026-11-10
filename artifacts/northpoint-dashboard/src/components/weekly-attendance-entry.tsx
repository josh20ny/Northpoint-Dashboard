import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetAttendanceQueryKey,
  useGetAttendance,
  useSaveAttendanceWeek,
  type AttendanceRevision,
  type AttendanceWorkspace,
} from "@workspace/api-client-react";
import { CalendarCheck2, ChevronDown, RotateCw } from "lucide-react";
import { Panel, formatDate } from "@/components/kit";
import { Skeleton } from "@/components/ui/skeleton";
import { FormError } from "@/components/admin-controls";
import {
  SLOTS,
  attendancePolling,
  csrfRequest,
  currentRevision,
  fmtCount,
  invalidateAttendance,
  type SlotValue,
} from "@/lib/attendance";

type Status = "recorded" | "unrecorded";
type Draft = { status: Status; count: string };
type Baseline = {
  date: string;
  definitionId: string | null;
  first: string | null;
  second: string | null;
};
export type EntryTarget = { date: string; slot: SlotValue; nonce: number };

const KEYS = ["first", "second"] as const;
type Key = (typeof KEYS)[number];
const SLOT_OF: Record<Key, SlotValue> = { first: SLOTS[0].value, second: SLOTS[1].value };
const EMPTY: Draft = { status: "recorded", count: "" };

function chicagoToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, sunday: get("weekday") === "Sun" };
}

export function defaultEntryDate(latestCompletedWeek: string) {
  const t = chicagoToday();
  return t.sunday ? t.date : latestCompletedWeek;
}

const isSunday = (d: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const ms = Date.parse(`${d}T00:00:00Z`);
  return !Number.isNaN(ms) && new Date(ms).getUTCDay() === 0;
};

const draftFrom = (rev?: AttendanceRevision): Draft =>
  rev && rev.valid
    ? { status: rev.status, count: rev.count !== null ? String(rev.count) : "" }
    : EMPTY;

const countError = (d: Draft) => {
  if (d.status === "unrecorded") return null;
  if (d.count.trim() === "") return "Enter a count or mark not recorded.";
  const n = Number(d.count);
  if (!Number.isInteger(n) || n < 0 || n > 2147483647) return "Whole number, 0 or more.";
  return null;
};

export function WeeklyAttendanceEntry({
  initialDate,
  csrfToken,
  target,
  definitionId,
}: {
  initialDate: string;
  definitionId?: string;
  csrfToken: string | null;
  target: EntryTarget | null;
}) {
  const qc = useQueryClient();
  const [date, setDate] = useState(initialDate);
  const validDate = isSunday(date);
  const params = { start: date, end: date, ...(definitionId ? { definitionId } : {}) };
  const q = useGetAttendance(params, {
    query: {
      enabled: validDate,
      queryKey: getGetAttendanceQueryKey(params),
      ...attendancePolling,
    },
  });
  const mutation = useSaveAttendanceWeek(csrfRequest(csrfToken));

  const [drafts, setDrafts] = useState<Record<Key, Draft>>({ first: EMPTY, second: EMPTY });
  const [note, setNote] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const [saved, setSaved] = useState<{
    first: AttendanceRevision;
    second: AttendanceRevision;
  } | null>(null);
  const pendingLoad = useRef<{ date: string; focus?: Key } | null>({ date: initialDate });
  const requestRef = useRef<{ sig: string; requestId: string } | null>(null);
  const inputs = useRef<Record<Key, HTMLInputElement | null>>({ first: null, second: null });
  const panelRef = useRef<HTMLDivElement>(null);
  const resetRef = useRef(mutation.reset);
  resetRef.current = mutation.reset;

  const ws = q.data;
  const defId = ws?.definition?.id;
  const live = (k: Key, w: AttendanceWorkspace | undefined = ws) =>
    w ? currentRevision(w.revisions, date, SLOT_OF[k], w.definition?.id) : undefined;

  const apply = (
    w: AttendanceWorkspace,
    forDate: string,
    mode: "all" | "baseline",
    focus?: Key,
  ) => {
    const cur = (k: Key) => currentRevision(w.revisions, forDate, SLOT_OF[k], w.definition?.id);
    if (mode === "all") {
      setDrafts({ first: draftFrom(cur("first")), second: draftFrom(cur("second")) });
      setNote("");
    }
    setBaseline({
      date: forDate,
      definitionId: w.definition?.id ?? null,
      first: cur("first")?.id ?? null,
      second: cur("second")?.id ?? null,
    });
    requestRef.current = null;
    resetRef.current();
    if (focus) setTimeout(() => inputs.current[focus]?.focus(), 30);
  };
  const applyRef = useRef(apply);
  applyRef.current = apply;

  // Explicit scope load: only fires when a load was requested for this date.
  useEffect(() => {
    const p = pendingLoad.current;
    if (!p || p.date !== date || !q.data || q.isFetching) return;
    pendingLoad.current = null;
    applyRef.current(q.data, date, "all", p.focus);
  }, [q.data, q.isFetching, date]);

  const loadDate = (d: string, focus?: Key) => {
    setDate(d);
    setSaved(null);
    setBaseline(null);
    requestRef.current = null;
    pendingLoad.current = { date: d, focus };
    if (d === date) void q.refetch();
  };
  const loadRef = useRef(loadDate);
  loadRef.current = loadDate;

  useEffect(() => {
    if (!target) return;
    const key: Key = target.slot === SLOT_OF.second ? "second" : "first";
    loadRef.current(target.date, key);
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [target]);

  const reload = (mode: "all" | "baseline") => {
    void q.refetch().then((r) => {
      if (r.data) applyRef.current(r.data, date, mode);
    });
  };

  const loaded = !!baseline && baseline.date === date && !!ws;
  const defChanged = loaded && (ws.definition?.id ?? null) !== baseline.definitionId;
  const changed =
    loaded &&
    (defChanged ||
      (live("first")?.id ?? null) !== baseline.first ||
      (live("second")?.id ?? null) !== baseline.second);
  const conflict = (mutation.error as { status?: number } | null)?.status === 409;

  const errs = { first: countError(drafts.first), second: countError(drafts.second) };
  const canSave =
    loaded &&
    !!defId &&
    !defChanged &&
    defId === baseline.definitionId &&
    !!ws?.isCurrentDefinition &&
    !errs.first &&
    !errs.second &&
    !mutation.isPending;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSave || !baseline || !baseline.definitionId) return;
    const slot = (k: Key) => ({
      count: drafts[k].status === "recorded" ? Number(drafts[k].count) : null,
      status: drafts[k].status,
      expectedRevision: baseline[k],
    });
    const body = {
      definitionId: baseline.definitionId,
      serviceDate: date,
      first: slot("first"),
      second: slot("second"),
      ...(note.trim() ? { note: note.trim() } : {}),
    };
    const sig = JSON.stringify(body);
    if (!requestRef.current || requestRef.current.sig !== sig)
      requestRef.current = { sig, requestId: crypto.randomUUID() };
    const requestId = requestRef.current.requestId;
    setSaved(null);
    mutation.mutate(
      { data: { requestId, ...body } },
      {
        onSuccess: (res) => {
          requestRef.current = null;
          setBaseline({
            date: body.serviceDate,
            definitionId: body.definitionId,
            first: res.first.id,
            second: res.second.id,
          });
          setNote("");
          setSaved(res);
          void invalidateAttendance(qc);
        },
      },
    );
  };

  const setDraft = (k: Key, patch: Partial<Draft>) => {
    setSaved(null);
    setDrafts((d) => ({ ...d, [k]: { ...d[k], ...patch } }));
  };

  const total =
    drafts.first.status === "recorded" &&
    drafts.second.status === "recorded" &&
    !errs.first &&
    !errs.second
      ? Number(drafts.first.count) + Number(drafts.second.count)
      : null;

  return (
    <div ref={panelRef} className="scroll-mt-6">
      <Panel className="overflow-hidden">
        <form onSubmit={submit} data-testid="form-weekly-attendance">
          <div className="flex flex-wrap items-end gap-x-5 gap-y-3 border-b bg-accent/30 px-5 py-4 sm:px-6">
            <div className="mr-auto flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent text-primary">
                <CalendarCheck2 className="h-4 w-4" aria-hidden />
              </span>
              <div>
                <h2 className="font-display text-[17px] font-semibold">Enter Sunday counts</h2>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  Seated auditorium adults only. Both services save together.
                </p>
              </div>
            </div>
            <label className="block text-[12px] font-medium">
              Sunday
              <input
                type="date"
                data-testid="input-entry-date"
                disabled={mutation.isPending}
                value={date}
                onChange={(e) => loadDate(e.target.value)}
                className="mt-1 block h-10 w-44 rounded-md border border-input bg-background px-3 font-mono text-[13px] font-normal"
              />
            </label>
          </div>

          <div className="space-y-3 px-5 py-4 sm:px-6">
            {!validDate ? (
              <p
                role="alert"
                className="text-[12.5px] text-destructive"
                data-testid="text-entry-date-error"
              >
                Choose a Sunday date.
              </p>
            ) : q.isError && !ws ? (
              <div role="alert" className="flex items-center gap-3 text-[12.5px] text-destructive">
                Could not load this Sunday.
                <button
                  type="button"
                  disabled={mutation.isPending}
                  onClick={() => loadDate(date)}
                  className="h-8 rounded-md border px-2.5 text-[12px]"
                >
                  Retry
                </button>
              </div>
            ) : !loaded ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Skeleton className="h-[92px]" />
                <Skeleton className="h-[92px]" />
              </div>
            ) : !ws.definition ? (
              <p
                className="text-[12.5px] text-muted-foreground"
                data-testid="text-entry-unavailable"
              >
                Counts can be entered once the attendance definition is saved.
              </p>
            ) : !ws.isCurrentDefinition ? (
              <p className="text-[12.5px] text-muted-foreground">
                This date falls under a prior definition version and is read only.
              </p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  {KEYS.map((k, i) => {
                    const d = drafts[k];
                    const rev = live(k);
                    const showErr = errs[k] && (d.count !== "" || d.status === "unrecorded");
                    return (
                      <fieldset
                        key={k}
                        className="rounded-lg border bg-background/60 p-3"
                        data-testid={`fieldset-${k}`}
                      >
                        <legend className="sr-only">{SLOTS[i].label}</legend>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[12px] font-semibold">{SLOTS[i].label}</span>
                          <div
                            className="flex rounded-md border p-0.5 text-[11px]"
                            role="radiogroup"
                          >
                            {(["recorded", "unrecorded"] as const).map((s) => (
                              <button
                                key={s}
                                type="button"
                                role="radio"
                                aria-checked={d.status === s}
                                data-testid={`toggle-${k}-${s}`}
                                disabled={mutation.isPending}
                                onClick={() => setDraft(k, { status: s })}
                                className={`rounded px-2 py-0.5 ${
                                  d.status === s
                                    ? "bg-primary text-primary-foreground"
                                    : "text-muted-foreground hover:bg-secondary"
                                }`}
                              >
                                {s === "recorded" ? "Count" : "Not recorded"}
                              </button>
                            ))}
                          </div>
                        </div>
                        {d.status === "recorded" ? (
                          <input
                            ref={(el) => {
                              inputs.current[k] = el;
                            }}
                            data-testid={`input-count-${k}`}
                            disabled={mutation.isPending}
                            aria-label={`${SLOTS[i].label} count`}
                            type="number"
                            onWheel={(event) => event.currentTarget.blur()}
                            inputMode="numeric"
                            min={0}
                            step={1}
                            value={d.count}
                            onChange={(e) => setDraft(k, { count: e.target.value })}
                            placeholder="0"
                            className="mt-2 h-11 w-full rounded-md border border-input bg-background px-3 font-mono text-[20px] font-semibold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          />
                        ) : (
                          <p className="mt-2 flex h-11 items-center rounded-md border border-dashed px-3 text-[12px] text-muted-foreground">
                            No count taken. Not the same as 0.
                          </p>
                        )}
                        <p
                          className="mt-1.5 min-h-4 text-[11px] text-muted-foreground"
                          data-testid={`text-current-${k}`}
                        >
                          {showErr ? (
                            <span className="text-destructive">{errs[k]}</span>
                          ) : rev ? (
                            <>
                              Saved:{" "}
                              {rev.status === "recorded" ? fmtCount(rev.count) : "not recorded"}
                              {rev.source === "workbook" ? " (workbook)" : ""} ·{" "}
                              {formatDate(rev.createdAt, true)}
                            </>
                          ) : (
                            "Nothing saved yet"
                          )}
                        </p>
                      </fieldset>
                    );
                  })}
                </div>

                <div>
                  <button
                    type="button"
                    data-testid="button-toggle-details"
                    disabled={mutation.isPending}
                    onClick={() => setShowDetails((v) => !v)}
                    className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
                    aria-expanded={showDetails}
                  >
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform ${showDetails ? "rotate-180" : ""}`}
                      aria-hidden
                    />
                    Optional note
                  </button>
                  {showDetails && (
                    <input
                      data-testid="input-entry-note"
                      disabled={mutation.isPending}
                      maxLength={1000}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="e.g. counted from balcony clicker"
                      className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-[13px]"
                    />
                  )}
                </div>

                {conflict || changed ? (
                  <div
                    role="alert"
                    data-testid={conflict ? "status-conflict" : "status-newer-revision"}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-950"
                  >
                    <span className="flex-1">
                      {defChanged
                        ? "The count definition changed after you loaded this Sunday."
                        : "Someone saved this Sunday after you loaded it."}{" "}
                      Your entries are kept.
                    </span>
                    <button
                      type="button"
                      data-testid="button-reload-current"
                      disabled={mutation.isPending}
                      onClick={() => reload("baseline")}
                      className="h-8 rounded-md border border-amber-400 px-2.5 font-medium hover:bg-amber-100"
                    >
                      Reload current, keep my entries
                    </button>
                    <button
                      type="button"
                      data-testid="button-discard-edits"
                      disabled={mutation.isPending}
                      onClick={() => reload("all")}
                      className="h-8 rounded-md border border-amber-400 px-2.5 font-medium hover:bg-amber-100"
                    >
                      Discard my entries
                    </button>
                  </div>
                ) : (
                  <FormError error={mutation.error} />
                )}
                {mutation.isError && !conflict && (
                  <p className="text-[11.5px] text-muted-foreground">
                    Saving again with the same entries retries safely.
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-3 border-t pt-3">
                  <button
                    type="submit"
                    data-testid="button-save-week"
                    disabled={!canSave}
                    className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-[13px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {mutation.isPending && (
                      <RotateCw className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    )}
                    {mutation.isPending ? "Saving…" : "Save both services"}
                  </button>
                  <span
                    className="text-[12px] text-muted-foreground"
                    data-testid="text-entry-total"
                  >
                    Total{" "}
                    <span className="font-mono font-semibold text-foreground">
                      {total !== null ? fmtCount(total) : "—"}
                    </span>
                  </span>
                  {saved && (
                    <span
                      role="status"
                      className="ml-auto text-[12px] text-emerald-800"
                      data-testid="status-saved"
                    >
                      Saved {formatDate(date)}.
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </form>
      </Panel>
    </div>
  );
}

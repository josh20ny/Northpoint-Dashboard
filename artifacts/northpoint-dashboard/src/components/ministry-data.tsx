import { useMemo, useState, type FormEvent } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { useAuth } from "@workspace/replit-auth-web";
import {
  getGetGivingTransactionsQueryKey,
  getGetMinistryDataQueryKey,
  useGetGivingTransactions,
  useGetMinistryData,
  type GetMinistryDataParams,
  type MinistryDataWorkspace,
} from "@workspace/api-client-react";
import { RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Panel, QueryError, StatusPill, formatDate } from "@/components/kit";
import { CollapsibleSection } from "@/components/collapsible-section";
import { MinistryHealthSection } from "@/components/ministry-health-section";
import {
  SERVING_MEASURES,
  buildSeries,
  currencyOf,
  formatMetricValue,
  scopeLabel,
  seriesScopeLabel,
  formatMinor,
  isGuestServicesSeries,
  ministryPolling,
  previousSunday,
  sundaysDesc,
  validateRange,
  type Series,
} from "@/lib/ministry-data";

const slugId = (s: string) => s.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
const ATTENDANCE_MEASURES = new Set([
  "attendance",
  "attendance_headcount",
  "group_attendance",
  "member_attendance",
]);

function RangeControl({
  ministry,
  onApply,
  active,
  busy,
}: {
  ministry: string;
  onApply: (p: GetMinistryDataParams | undefined) => void;
  active: boolean;
  busy: boolean;
}) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const err = validateRange(start, end);
    setError(err);
    if (!err) onApply({ start, end });
  };
  const id = slugId(ministry);
  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3" aria-label="Date range">
      <label className="grid gap-1 text-[12px] font-medium">
        Start Sunday
        <input
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          data-testid={`input-range-start-${id}`}
          className="h-9 rounded-md border border-input bg-background px-2 text-[13px]"
        />
      </label>
      <label className="grid gap-1 text-[12px] font-medium">
        End Sunday
        <input
          type="date"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          data-testid={`input-range-end-${id}`}
          className="h-9 rounded-md border border-input bg-background px-2 text-[13px]"
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        data-testid={`button-range-apply-${id}`}
        className="h-9 rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground disabled:opacity-60"
      >
        Show range
      </button>
      {active && (
        <button
          type="button"
          onClick={() => {
            setError(null);
            onApply(undefined);
          }}
          data-testid={`button-range-reset-${id}`}
          className="h-9 rounded-md border px-3 text-[12.5px]"
        >
          Last 13 weeks
        </button>
      )}
      {error && (
        <p role="alert" className="w-full text-[12px] text-destructive" data-testid={`text-range-error-${id}`}>
          {error}
        </p>
      )}
    </form>
  );
}

function qualityTone(q: string) {
  if (q === "complete" || q === "verified") return "connected";
  if (q === "missing" || q === "invalid") return "blocked";
  return "pending";
}

function SummaryCards({ series, week }: { series: Series[]; week: string }) {
  const prev = previousSunday(week);
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {series.map((s) => {
        const cur = s.byWeek.get(week);
        const before = s.byWeek.get(prev);
        const cv = cur?.value ?? null;
        const pv = before?.value ?? null;
        const change = cv !== null && pv !== null ? cv - pv : null;
        const id = slugId(s.key);
        return (
          <div key={s.key} className="rounded-lg border bg-background/60 p-4" data-testid={`card-metric-${id}`}>
            <p className="text-[12.5px] font-medium">{s.title}</p>
            <p className="font-mono text-[11px] text-muted-foreground">Scope: {scopeLabel(s.scope, cur?.source)}{currencyOf(s.unit) ? ` · ${currencyOf(s.unit)}` : ""}</p>
            <p className="mt-2 font-display text-[26px] font-semibold tabular-nums" data-testid={`text-metric-value-${id}`}>
              {formatMetricValue(cv, s.unit)}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
              {cur ? (
                <StatusPill status={qualityTone(cur.quality)} label={cur.quality} testId={`status-metric-quality-${id}`} />
              ) : (
                <StatusPill status="pending" label="No row" />
              )}
              <span data-testid={`text-metric-change-${id}`}>
                {change === null
                  ? "No comparison to prior Sunday"
                  : `${change >= 0 ? "+" : ""}${currencyOf(s.unit) ? formatMinor(change, currencyOf(s.unit)!) : change.toLocaleString("en-US")} vs ${formatDate(prev)}`}
              </span>
            </div>
            {cur && cur.flags.length > 0 && (
              <p className="mt-2 text-[11.5px] text-muted-foreground">Flags: {cur.flags.join(", ")}</p>
            )}
            {cur && cur.denominator !== null && (
              <p className="mt-1 text-[11.5px] text-muted-foreground">
                {cur.measure === "lapsed_givers" || cur.measure === "first_time_givers"
                  ? `Classified giving units: ${cur.denominator.toLocaleString("en-US")}`
                  : `Out of ${cur.denominator.toLocaleString("en-US")}`}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function HistoryTable({ series, weeks, label }: { series: Series[]; weeks: string[]; label: string }) {
  return (
    <>
    <div className="sm:hidden" data-testid={`history-mobile-${slugId(label)}`}>
      {weeks.map((week) => (
        <section key={week} className="border-b px-4 py-3 last:border-0" aria-label={`Week of ${week}`}>
          <h3 className="mb-2 font-mono text-[12px] font-medium">{week}</h3>
          <dl className="space-y-3">
            {series.map((s) => {
              const metric = s.byWeek.get(week);
              return (
                <div key={s.key} className="flex items-start justify-between gap-4">
                  <dt className="min-w-0 text-[12px]">
                    {s.measure === "member_attendance" ? "Attendance (workbook)" : s.title}
                    <span className="block text-[11px] text-muted-foreground">{scopeLabel(s.scope, metric?.source)}</span>
                    {metric && <span className="block text-[11px] text-muted-foreground">{metric.source === "workbook" ? "Accepted workbook" : "Planning Center"}</span>}
                  </dt>
                  <dd className="shrink-0 text-right text-[13px] tabular-nums" data-testid={`history-value-${slugId(s.key)}-${week}`}>
                    {formatMetricValue(metric?.value ?? null, s.unit)}
                    {metric && metric.quality !== "complete" && (
                      <span className="block text-[10.5px] text-muted-foreground">{metric.quality}</span>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
      ))}
    </div>
    <div className="hidden overflow-x-auto sm:block">
      <table className="w-full min-w-[480px] text-[12.5px]" aria-label={label}>
        <thead>
          <tr className="border-b bg-muted/40 text-left">
            <th scope="col" className="px-4 py-2 font-medium">Sunday</th>
            {series.map((s) => (
              <th key={s.key} scope="col" className="px-4 py-2 text-right font-medium">
                {s.measure === "member_attendance" ? "Attendance (workbook)" : s.title}
                <span className="block font-mono text-[10.5px] font-normal text-muted-foreground">{seriesScopeLabel(s, weeks)}{currencyOf(s.unit) ? ` · ${currencyOf(s.unit)}` : ""}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) => (
            <tr key={w} className="border-b last:border-0" data-testid={`row-week-${w}`}>
              <th scope="row" className="px-4 py-2 text-left font-mono text-[12px] font-normal">{w}</th>
              {series.map((s) => {
                const m = s.byWeek.get(w);
                const v = m?.value ?? null;
                return (
                  <td
                    key={s.key}
                    className={`px-4 py-2 text-right tabular-nums ${v === null ? "text-muted-foreground" : ""}`}
                    title={m ? `Quality: ${m.quality}. Source: ${m.source}, as of ${m.sourceAsOf}. Definition ${m.definitionVersion}${m.flags.length ? `. Flags: ${m.flags.join(", ")}` : ""}` : "No value published"}
                  >
                    {formatMetricValue(v, s.unit)}
                    {m && m.quality !== "complete" && v !== null && (
                      <span className="ml-1 text-[10.5px] text-muted-foreground">({m.quality})</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}

function KpiInventory({ ws }: { ws: MinistryDataWorkspace }) {
  if (ws.kpis.length === 0)
    return <p className="px-5 py-4 text-[13px] text-muted-foreground">No KPIs are listed for this ministry.</p>;
  return (
    <ul className="divide-y">
      {ws.kpis.map((k) => (
        <li key={k.key} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-start sm:gap-4" data-testid={`row-kpi-${k.key}`}>
          <div className="sm:w-1/3">
            <p className="text-[13.5px] font-medium">{k.title}</p>
            <p className="font-mono text-[11px] text-muted-foreground">{k.key}</p>
          </div>
          <StatusPill status={k.status} label={k.status.replace(/_/g, " ")} testId={`status-kpi-${k.key}`} />
          <p className="flex-1 text-[12.5px] text-muted-foreground" data-testid={`text-kpi-reason-${k.key}`}>{k.reason}</p>
        </li>
      ))}
    </ul>
  );
}

/** Ministry data view. mode "serving" shows serving facts only (secondary data). */
export function MinistryDataView({ ministry, mode = "full" }: { ministry: string; mode?: "full" | "serving" }) {
  const { user } = useAuth();
  const [params, setParams] = useState<GetMinistryDataParams | undefined>(undefined);
  const q = useGetMinistryData(ministry, params, {
    query: {
      enabled: !!user,
      queryKey: getGetMinistryDataQueryKey(ministry, params),
      placeholderData: keepPreviousData,
      ...ministryPolling,
    },
  });
  const shared = useGetMinistryData("shared-teams", params, {
    query: {
      enabled: !!user && ministry === "connection",
      queryKey: getGetMinistryDataQueryKey("shared-teams", params),
      placeholderData: keepPreviousData,
      ...ministryPolling,
    },
  });
  const guestServing = useMemo(
    () => buildSeries(shared.data?.metrics ?? []).filter(isGuestServicesSeries),
    [shared.data],
  );
  const ws = q.data;
  const all = useMemo(() => buildSeries(ws?.metrics ?? []), [ws]);
  const primary = all.filter((s) => !SERVING_MEASURES.has(s.measure));
  const serving = all.filter((s) => SERVING_MEASURES.has(s.measure));
  const isGiving = ministry === "giving";
  const lead = primary.filter((s) =>
    isGiving ? s.measure === "giving_total" : ATTENDANCE_MEASURES.has(s.measure),
  );
  const other = primary.filter((s) =>
    isGiving ? s.measure !== "giving_total" : !ATTENDANCE_MEASURES.has(s.measure),
  );
  const weeks = useMemo(() => (ws ? sundaysDesc(ws.start, ws.end) : []), [ws]);
  const id = slugId(ministry);

  if (!user) return <p className="text-[13px] text-muted-foreground">Sign in to view ministry data.</p>;
  if (q.isError && !ws) return <QueryError title="Ministry data unavailable" error={q.error} onRetry={() => void q.refetch()} />;
  if (!ws)
    return (
      <div className="space-y-3" data-testid={`status-ministry-data-loading-${id}`}>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );

  const stale = q.isPlaceholderData;
  const header = (
    <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="text-[12.5px] text-muted-foreground">
        <p data-testid={`text-ministry-range-${id}`}>
          {formatDate(ws.start)} to {formatDate(ws.end)} · Latest completed Sunday{" "}
          <strong className="text-foreground" data-testid={`text-latest-week-${id}`}>{formatDate(ws.latestCompletedWeek)}</strong>
        </p>
        <p>Updated {formatDate(ws.asOf, true)} · {ws.timezone}{stale ? " · Updating" : ""}</p>
      </div>
    </div>
  );
  const refetchBanner = q.isRefetchError && (
    <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-950">
      <span>Refresh failed. Showing data from {formatDate(ws.asOf, true)}.</span>
      <button type="button" onClick={() => void q.refetch()} data-testid={`button-ministry-retry-${id}`} className="inline-flex h-8 items-center gap-2 rounded-md border border-amber-400 px-2.5 text-[12px] font-medium hover:bg-amber-100">
        <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Retry
      </button>
    </div>
  );
  const issues = ws.issues.length > 0 && (
    <ul className="mb-4 space-y-1 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-950" data-testid={`list-issues-${id}`}>
      {ws.issues.map((i) => <li key={i}>{i}</li>)}
    </ul>
  );
  const servingDefinition = (
    <p className="text-[12px] text-muted-foreground" data-testid={`text-serving-definition-${id}`}>
      Each figure counts distinct Planning Center Services people within that team or ministry and reporting week.
      Scheduled includes confirmed, unconfirmed and declined assignments; accepted includes confirmed responses only.
      Neither figure proves actual participation. Team figures may overlap and must not be added to calculate a church-wide total.
    </p>
  );

  if (mode === "serving")
    return (
      <div className={`space-y-5 ${stale ? "opacity-60" : ""}`}>
        {refetchBanner}
        {header}
        {issues}
        <Panel title="Serving" meta={<span className="font-mono text-[11px] text-muted-foreground">Planning Center Services</span>}>
          <div className="space-y-4 p-5">
            {servingDefinition}
            {serving.length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-[13px] text-muted-foreground" data-testid={`status-serving-empty-${id}`}>
                No serving facts are published for this ministry yet. An administrator maps service types or teams, then publishes a completed scan.
              </p>
            ) : (
              <SummaryCards series={serving} week={ws.latestCompletedWeek} />
            )}
          </div>
        </Panel>
        {serving.length > 0 && (
          <Panel title="Serving history" meta={<span className="text-[11px] text-muted-foreground">Newest first</span>}>
            <HistoryTable series={serving} weeks={weeks} label="Weekly serving history" />
          </Panel>
        )}
        <CollapsibleSection
          title="Serving reporting controls"
          description="Change the reporting dates for this ministry."
          testId={`section-reporting-controls-${id}`}
        >
          <RangeControl ministry={ministry} onApply={setParams} active={!!params} busy={q.isFetching} />
        </CollapsibleSection>
      </div>
    );

  return (
    <div className={`space-y-5 ${stale ? "opacity-60" : ""}`}>
      {refetchBanner}
      {header}
      {issues}
      <Panel
        title={isGiving ? "General Giving" : "Attendance"}
        meta={<span className="font-mono text-[11px] text-muted-foreground">Week of {formatDate(ws.latestCompletedWeek)}</span>}
      >
        <div className="p-5">
          {lead.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-[13px] text-muted-foreground" data-testid={`status-metrics-empty-${id}`}>
              {isGiving
                ? "No giving figures are published in this range. Missing weeks are shown as missing, not zero."
                : "No attendance figures are published in this range. Missing weeks are shown as missing, not zero."}
            </p>
          ) : (
            <SummaryCards series={lead} week={ws.latestCompletedWeek} />
          )}
        </div>
      </Panel>
      <MinistryHealthSection ministry={ministry} />
      <Panel title="Other KPIs" meta={<span className="text-[11px] text-muted-foreground">Published and planned measures</span>}>
        <div className="space-y-5 p-5">
          {other.length > 0 && <SummaryCards series={other} week={ws.latestCompletedWeek} />}
          {serving.length > 0 && (
            <div className={other.length > 0 ? "border-t pt-4" : undefined}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-[12.5px] font-medium">Serving</h3>
                <span className="font-mono text-[10.5px] text-muted-foreground">Planning Center Services</span>
              </div>
              <div className="mb-3">{servingDefinition}</div>
              <SummaryCards series={serving} week={ws.latestCompletedWeek} />
            </div>
          )}
          {other.length === 0 && serving.length === 0 && (
            <p className="text-[13px] text-muted-foreground">No other KPI figures are published yet.</p>
          )}
        </div>
        <div className="border-t">
          <KpiInventory ws={ws} />
        </div>
      </Panel>
      {ministry === "connection" && (
        <Panel title="Guest Services teams" meta={<span className="font-mono text-[11px] text-muted-foreground">Planning Center Services</span>}>
          <div className="space-y-4 p-5" data-testid="section-connection-guest-services">
            {servingDefinition}
            <p className="text-[12px] text-muted-foreground">
              LU weekly and Safety remain separate teams. Shared Kids’ Check-In is reported in the Ministries directory, not in these figures.
              These scheduling responses are distinct from the workbook’s historical volunteer counts above.
            </p>
            {shared.isError && (
              <QueryError
                title={shared.data ? "Guest Services refresh failed; showing the last loaded figures" : "Guest Services data unavailable"}
                error={shared.error}
                onRetry={() => void shared.refetch()}
              />
            )}
            {shared.data ? (
              <div className={shared.isPlaceholderData ? "opacity-60" : undefined} aria-busy={shared.isFetching}>
                <p className="mb-3 text-[12px] text-muted-foreground">
                  {formatDate(shared.data.start)} to {formatDate(shared.data.end)} · Updated {formatDate(shared.data.asOf, true)}
                  {shared.isPlaceholderData ? " · Updating selected dates" : ""}
                </p>
                {guestServing.length ? (
                  <SummaryCards series={guestServing} week={ws.latestCompletedWeek} />
                ) : (
                  <p className="text-[13px] text-muted-foreground">No Guest Services scheduling figures are published for this range.</p>
                )}
              </div>
            ) : !shared.isError ? <Skeleton className="h-24 w-full" /> : null}
          </div>
        </Panel>
      )}
      {lead.length > 0 && (
        <Panel title={isGiving ? "General Giving history" : "Attendance history"} meta={<span className="text-[11px] text-muted-foreground">Newest first</span>}>
          {isGiving && (
            <p className="border-b px-4 py-3 text-[12px] text-muted-foreground" data-testid="text-giving-history-sources">
              General Giving only: mapped Planning Center fund designations and accepted workbook General Giving.
              Complete PCO values take precedence on overlapping weeks; sources are never added.
              All-fund receipts, refunds and other giving KPIs are shown separately below.
            </p>
          )}
          {ministry === "connection" && (
            <p className="border-b px-4 py-3 text-[12px] text-muted-foreground" data-testid="text-connection-history-sources">
              Planning Center meeting attendance and accepted workbook attendance are separate series, not added together.
              The default view shows 13 weeks; use Reporting controls below to view earlier years.
              Workbook history is limited to its accepted snapshot date; later weeks remain missing.
            </p>
          )}
          <HistoryTable series={lead} weeks={weeks} label={isGiving ? "General Giving history" : "Attendance history"} />
        </Panel>
      )}
      {other.length > 0 && (
        <Panel title="Other KPI history" meta={<span className="text-[11px] text-muted-foreground">Newest first</span>}>
          {ministry === "connection" && (
            <p className="border-b px-4 py-3 text-[12px] text-muted-foreground" data-testid="text-connection-snapshot-history">
              Active groups, memberships and leaders describe the source observation week, not historical weekly totals.
              Missing means no eligible value was published for that week; current counts are not copied into past weeks.
            </p>
          )}
          <HistoryTable series={other} weeks={weeks} label="Other KPI history" />
        </Panel>
      )}
      {serving.length > 0 && (
        <Panel title="Serving history" meta={<span className="text-[11px] text-muted-foreground">Newest first</span>}>
          <HistoryTable series={serving} weeks={weeks} label="Serving history" />
        </Panel>
      )}
      {ministry === "connection" && guestServing.length > 0 && (
        <Panel title="Guest Services scheduling history" meta={<span className="text-[11px] text-muted-foreground">Newest first</span>}>
          <div className={shared.isPlaceholderData ? "opacity-60" : undefined}>
            <HistoryTable
              series={guestServing}
              weeks={shared.data ? sundaysDesc(shared.data.start, shared.data.end) : []}
              label="Weekly Guest Services scheduling history"
            />
          </div>
        </Panel>
      )}
      <CollapsibleSection
        title="Reporting controls"
        description="Change the reporting dates for this ministry."
        testId={`section-reporting-controls-${id}`}
      >
        <RangeControl ministry={ministry} onApply={setParams} active={!!params} busy={q.isFetching} />
      </CollapsibleSection>
    </div>
  );
}

/** Admin-only. Callers must not render this for other roles; the query is also disabled. */
export function GivingTransactions() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [page, setPage] = useState(1);
  const params = { page };
  const q = useGetGivingTransactions(params, {
    query: {
      enabled: isAdmin,
      queryKey: getGetGivingTransactionsQueryKey(params),
      placeholderData: keepPreviousData,
      ...ministryPolling,
    },
  });
  if (!isAdmin) return null;
  const d = q.data;
  return (
    <Panel title="Giving transactions" meta={<span className="text-[11px] text-muted-foreground">Admin only</span>}>
      <p className="border-b px-5 py-3 text-[12px] text-muted-foreground">
        Person IDs are PCO Giving person IDs. They are not matched to people in other Planning Center products.
      </p>
      {q.isError && !d ? (
        <div className="p-5"><QueryError title="Transactions unavailable" error={q.error} onRetry={() => void q.refetch()} /></div>
      ) : !d ? (
        <div className="space-y-2 p-5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
      ) : d.transactions.length === 0 ? (
        <p className="p-6 text-center text-[13px] text-muted-foreground" data-testid="status-transactions-empty">No transactions on this page.</p>
      ) : (
        <div className={`overflow-x-auto ${q.isPlaceholderData ? "opacity-60" : ""}`}>
          <table className="w-full min-w-[720px] text-[12.5px]" aria-label="Giving transactions">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                {["Received", "Amount", "Status", "Refunded", "PCO Giving person ID", "Recurring ID", "Transaction ID"].map((h) => (
                  <th key={h} scope="col" className="px-4 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.transactions.map((t) => (
                <tr key={t.id} className="border-b last:border-0" data-testid={`row-transaction-${t.id}`}>
                  <td className="px-4 py-2">{t.receivedAt ? formatDate(t.receivedAt, true) : "Unknown"}</td>
                  <td className="px-4 py-2 tabular-nums" data-testid={`text-transaction-amount-${t.id}`}>
                    {t.amountMinor === null ? "Missing" : t.currency ? formatMinor(t.amountMinor, t.currency) : `${t.amountMinor} (minor units, currency unknown)`}
                  </td>
                  <td className="px-4 py-2">{t.status ?? "Unknown"}</td>
                  <td className="px-4 py-2">{t.refunded === null ? "Unknown" : t.refunded ? "Yes" : "No"}</td>
                  <td className="px-4 py-2 font-mono text-[11.5px]">{t.personId ?? "None"}</td>
                  <td className="px-4 py-2 font-mono text-[11.5px]">{t.recurringId ?? "None"}</td>
                  <td className="px-4 py-2 font-mono text-[11.5px]">{t.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center justify-between border-t px-5 py-3">
        <span className="text-[11.5px] text-muted-foreground" data-testid="text-transactions-page">
          Page {page}{d ? ` · Updated ${formatDate(d.asOf, true)}` : ""}
        </span>
        <div className="flex gap-2">
          <button type="button" data-testid="button-transactions-previous" disabled={page <= 1 || q.isFetching} onClick={() => setPage((p) => Math.max(1, p - 1))} className="h-8 rounded-md border px-3 text-[12px] disabled:opacity-45">Previous</button>
          <button type="button" data-testid="button-transactions-next" disabled={!d?.hasMore || q.isFetching} onClick={() => setPage((p) => Math.min(10000, p + 1))} className="h-8 rounded-md border px-3 text-[12px] disabled:opacity-45">Next</button>
        </div>
      </div>
    </Panel>
  );
}

/** Dashboard card: values for the query's own latestCompletedWeek. */
export function MinistrySummaryCard({ slug, name }: { slug: string; name: string }) {
  const { user } = useAuth();
  const q = useGetMinistryData(slug, undefined, {
    query: { enabled: !!user, queryKey: getGetMinistryDataQueryKey(slug), ...ministryPolling },
  });
  const ws = q.data;
  const rows = useMemo(
    () =>
      ws
        ? buildSeries(ws.metrics.filter((m) => m.week === ws.latestCompletedWeek && !SERVING_MEASURES.has(m.measure))).slice(0, 4)
        : [],
    [ws],
  );
  return (
    <div className="rounded-lg border bg-background/60 p-4" data-testid={`card-ministry-summary-${slug}`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-display text-[14px] font-semibold">{name}</p>
        {ws && <span className="font-mono text-[11px] text-muted-foreground" data-testid={`text-summary-week-${slug}`}>{formatDate(ws.latestCompletedWeek)}</span>}
      </div>
      {q.isError && !ws ? (
        <div className="mt-2 flex items-center justify-between gap-2 text-[12px] text-destructive">
          <span>Unavailable</span>
          <button type="button" onClick={() => void q.refetch()} data-testid={`button-summary-retry-${slug}`} className="h-7 rounded-md border px-2 text-[11.5px] text-foreground">Retry</button>
        </div>
      ) : !ws ? (
        <div className="mt-3 space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" /></div>
      ) : rows.length === 0 ? (
        <p className="mt-2 text-[12.5px] text-muted-foreground">No figures published for this Sunday.</p>
      ) : (
        <dl className="mt-2 space-y-1">
          {rows.map((s) => {
            const m = s.byWeek.get(ws.latestCompletedWeek)!;
            return (
              <div key={s.key} className="flex items-baseline justify-between gap-3 text-[12.5px]">
                <dt className="text-muted-foreground">{s.title}{s.scope !== "all" ? ` (${scopeLabel(s.scope, m.source)})` : ""}</dt>
                <dd className="font-medium tabular-nums" data-testid={`text-summary-value-${slug}-${slugId(s.key)}`}>{formatMetricValue(m.value, m.unit)}</dd>
              </div>
            );
          })}
        </dl>
      )}
    </div>
  );
}

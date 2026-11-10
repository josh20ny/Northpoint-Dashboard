import { useState } from "react";
import { Link } from "wouter";
import { keepPreviousData } from "@tanstack/react-query";
import {
  AverageWeeksControl,
  DEFAULT_AVERAGE_WEEKS,
  RollingAverageView,
  YearComparisonView,
} from "@/components/attendance-comparison";
import { Lock, RefreshCw } from "lucide-react";
import {
  getGetAttendanceQueryKey,
  useGetAttendance,
  useGetFoundation,
} from "@workspace/api-client-react";
import { QUALITY_LABEL, QUALITY_TONE, attendancePolling, fmtCount } from "@/lib/attendance";
import { Skeleton } from "@/components/ui/skeleton";
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
import { useAuth } from "@workspace/replit-auth-web";
import { MinistrySummaryCard } from "@/components/ministry-data";
import { DATA_MINISTRIES } from "@/lib/ministry-data";

export default function Dashboard() {
  usePageTitle("Dashboard");
  const { enabled, user } = useAuth();
  const [averageWeeks, setAverageWeeks] = useState(DEFAULT_AVERAGE_WEEKS);
  const attParams = { averageWeeks };
  const att = useGetAttendance(attParams, {
    query: {
      enabled: !!user,
      queryKey: getGetAttendanceQueryKey(attParams),
      placeholderData: keepPreviousData,
      ...attendancePolling,
    },
  });
  const stale = att.isPlaceholderData;
  const aw = att.data;
  const latest = aw?.weeks.find((x) => x.week === aw.latestCompletedWeek);
  const q = useGetFoundation();
  const f = q.data;
  const loading = q.isLoading || q.isFetching;

  return (
    <>
      <PageHeader
        eyebrow="Northpoint Church"
        title="Weekly overview"
        actions={<RefreshButton busy={q.isFetching} onClick={() => q.refetch()} />}
      />

      {q.isError ? (
        <QueryError
          title="Foundation status unavailable"
          error={q.error}
          onRetry={() => q.refetch()}
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <Panel className="np-grid-bg relative overflow-hidden" delay={60}>
            <div className="flex min-h-[260px] flex-col justify-between bg-gradient-to-br from-card via-card/95 to-card/70 p-6">
              <div>
                {!user ? (
                  <>
                    <StatusPill
                      status="placeholder"
                      label="Sign in required"
                      testId="status-dashboard-data"
                    />
                    <h2 className="mt-4 max-w-md text-xl font-semibold tracking-tight">
                      Adult attendance
                    </h2>
                    <p className="mt-2 max-w-md text-[14px] leading-relaxed text-muted-foreground">
                      Sign in to view weekly counts.
                    </p>
                  </>
                ) : att.isError && !aw ? (
                  <QueryError
                    title="Attendance unavailable"
                    error={att.error}
                    onRetry={() => void att.refetch()}
                  />
                ) : !aw ? (
                  <div className="space-y-3">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-12 w-40" />
                    <Skeleton className="h-4 w-64" />
                  </div>
                ) : (
                  <>
                    {att.isRefetchError && (
                      <div
                        role="alert"
                        data-testid="status-dashboard-stale"
                        className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-950"
                      >
                        <span>
                          Refresh failed. Showing saved data from {formatDate(aw.asOf, true)}; it
                          may be out of date.
                        </span>
                        <button
                          type="button"
                          data-testid="button-dashboard-retry"
                          onClick={() => void att.refetch()}
                          className="inline-flex h-8 items-center gap-2 rounded-md border border-amber-400 px-2.5 text-[12px] font-medium hover:bg-amber-100"
                        >
                          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Retry
                        </button>
                      </div>
                    )}
                    <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                      Adult attendance · week of {formatDate(aw.latestCompletedWeek)}
                    </p>
                    <p
                      className="mt-4 font-display text-[48px] font-semibold leading-none tracking-tight tabular-nums"
                      data-testid="text-adult-kpi"
                    >
                      {latest && latest.value !== null ? fmtCount(latest.value) : "No total"}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
                      {latest && (
                        <>
                          <StatusPill
                            status={QUALITY_TONE[latest.quality]}
                            label={QUALITY_LABEL[latest.quality]}
                            testId="status-dashboard-data"
                          />
                          <span>
                            {latest.recordedServices} of {latest.expectedServices} services
                          </span>
                          {latest.value === null && latest.knownSubtotal !== null && (
                            <span>Known subtotal {fmtCount(latest.knownSubtotal)}</span>
                          )}
                        </>
                      )}
                    </div>
                    <div className="mt-5 grid gap-5 border-t pt-5 sm:grid-cols-2 sm:gap-6">
                      <div>
                        <div className="mb-2 flex min-h-8 items-center">
                          <AverageWeeksControl
                            value={averageWeeks}
                            onChange={setAverageWeeks}
                            updating={stale}
                            testId="select-dashboard-average-weeks"
                          />
                        </div>
                        <RollingAverageView avg={aw.rollingAverage} stale={stale} compact />
                      </div>
                      <div className={stale ? "opacity-50" : undefined}>
                        <p className="mb-2 flex min-h-8 items-center text-[12px] font-medium">
                          Same week last year
                        </p>
                        <YearComparisonView
                          yc={aw.yearComparison}
                          showCell={user.role !== "staff"}
                          compact
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
              <div className="mt-6 flex flex-wrap gap-2">
                <Link
                  href="/ministries/service-programming"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-card px-3.5 text-[13px] font-medium hover:bg-secondary"
                  data-testid="link-attendance"
                >
                  Service Programming
                </Link>
              </div>
            </div>
          </Panel>

          <Panel title="Reporting context" delay={120}>
            {loading ? (
              <div className="space-y-3 p-5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-5 w-full" />
                ))}
              </div>
            ) : f ? (
              <dl>
                <KV
                  label="Attendance Sunday"
                  value={
                    aw
                      ? formatDate(aw.latestCompletedWeek)
                      : user
                        ? "Unavailable"
                        : "Sign in required"
                  }
                  testId="text-week-ending"
                />
                <KV label="Status checked" value={formatDate(f.asOf, true)} testId="text-as-of" />
                <KV label="Timezone" value={f.timezone} testId="text-timezone" />
              </dl>
            ) : null}
          </Panel>

          {user && (
            <Panel className="lg:col-span-2" title="Ministries · previous completed Sunday" delay={150}>
              <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3" data-testid="section-ministry-summaries">
                {DATA_MINISTRIES.map((m) => (
                  <Link key={m.slug} href={`/ministries/${m.slug}`} className="block rounded-lg hover:bg-secondary/40" data-testid={`link-summary-${m.slug}`}>
                    <MinistrySummaryCard slug={m.slug} name={m.name} />
                  </Link>
                ))}
              </div>
              <p className="border-t px-5 py-2.5 text-[11.5px] text-muted-foreground">
                Each ministry shows its own latest completed Sunday. Missing figures are not counted as zero.
              </p>
            </Panel>
          )}

          <Panel className="lg:col-span-2" delay={180}>
            <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
              <Lock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <p className="flex-1 text-[13.5px] text-muted-foreground">
                {enabled
                  ? "No weekly report is available yet."
                  : "Authentication is not enabled. No church records are shown."}
              </p>
              <Link
                href="/administration"
                className="text-[13px] font-medium text-primary underline-offset-4 hover:underline"
                data-testid="link-admin"
              >
                Access details
              </Link>
            </div>
          </Panel>
        </div>
      )}
    </>
  );
}

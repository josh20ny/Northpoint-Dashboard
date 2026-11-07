import {
  getGetReadinessQueryKey,
  useGetFoundation,
  useGetReadiness,
  useHealthCheck,
} from "@workspace/api-client-react";
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

function Rows() {
  return (
    <div className="space-y-3 p-5">
      <Skeleton className="h-5 w-full" />
      <Skeleton className="h-5 w-full" />
      <Skeleton className="h-5 w-2/3" />
    </div>
  );
}

export default function SystemPage() {
  usePageTitle("System");
  const health = useHealthCheck();
  const ready = useGetReadiness({ query: { queryKey: getGetReadinessQueryKey(), retry: false } });
  const found = useGetFoundation();
  const busy = health.isFetching || ready.isFetching || found.isFetching;
  const refresh = () => {
    health.refetch();
    ready.refetch();
    found.refetch();
  };
  const readyErr = ready.error as { status?: number; data?: unknown } | null;
  const readyBody =
    readyErr?.data && typeof readyErr.data === "object"
      ? (readyErr.data as { status?: string; connectivity?: string; migration?: string })
      : null;
  const r = ready.data ?? (readyBody?.status ? readyBody : null);

  return (
    <>
      <PageHeader
        eyebrow="Foundation health"
        title="System"
        description="Live checks against the API. Values come straight from the server on each refresh."
        actions={<RefreshButton busy={busy} onClick={refresh} />}
      />
      <div className="grid gap-5 md:grid-cols-2">
        <Panel
          title="API process"
          meta={<span className="font-mono text-[11px] text-muted-foreground">/api/healthz</span>}
        >
          {health.isLoading || health.isFetching ? (
            <Rows />
          ) : health.isError ? (
            <div className="p-4">
              <QueryError error={health.error} onRetry={() => health.refetch()} />
            </div>
          ) : (
            <dl>
              <KV
                label="Status"
                value={<StatusPill status={health.data?.status} testId="status-health" />}
              />
            </dl>
          )}
        </Panel>

        <Panel
          title="Database readiness"
          meta={<span className="font-mono text-[11px] text-muted-foreground">/api/v1/readyz</span>}
          delay={60}
        >
          {ready.isLoading || ready.isFetching ? (
            <Rows />
          ) : r ? (
            <>
              <dl>
                <KV
                  label="Status"
                  value={<StatusPill status={r.status} testId="status-readiness" />}
                />
                <KV
                  label="Connectivity"
                  value={<StatusPill status={r.connectivity} />}
                  testId="text-connectivity"
                />
                <KV
                  label="Migration"
                  value={<StatusPill status={r.migration} />}
                  testId="text-migration"
                />
              </dl>
              {ready.isError && (
                <p className="border-t px-5 py-3 text-[12.5px] text-muted-foreground">
                  Readiness returned {readyErr?.status ?? "an error"}; the details above are the
                  server's own report.
                </p>
              )}
            </>
          ) : ready.isError ? (
            <div className="p-4">
              <QueryError title="Not ready" error={ready.error} onRetry={() => ready.refetch()} />
            </div>
          ) : null}
        </Panel>

        <Panel
          title="Foundation"
          className="md:col-span-2"
          meta={
            <span className="font-mono text-[11px] text-muted-foreground">/api/v1/foundation</span>
          }
          delay={120}
        >
          {found.isLoading || found.isFetching ? (
            <Rows />
          ) : found.isError || !found.data ? (
            <div className="p-4">
              <QueryError error={found.error} onRetry={() => found.refetch()} />
            </div>
          ) : (
            <dl className="grid md:grid-cols-2 md:divide-x">
              <div>
                <KV label="Phase" value={found.data.phase} mono />
                <KV label="Mode" value={<StatusPill status={found.data.mode} />} />
                <KV label="Data quality" value={<StatusPill status={found.data.quality} />} />
                <KV label="Reported at" value={formatDate(found.data.asOf, true)} />
              </div>
              <div className="border-t md:border-t-0">
                <KV label="Auth" value={<StatusPill status={found.data.auth.status} />} />
                <KV label="Database" value={<StatusPill status={found.data.database.status} />} />
                <KV label="Ministry placeholders" value={found.data.ministries.length} mono />
                <KV label="Integration placeholders" value={found.data.integrations.length} mono />
              </div>
            </dl>
          )}
        </Panel>
      </div>
    </>
  );
}

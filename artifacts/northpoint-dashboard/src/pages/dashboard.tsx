import { Link } from "wouter";
import { ArrowUpRight, Lock } from "lucide-react";
import { useGetFoundation } from "@workspace/api-client-react";
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

export default function Dashboard() {
  usePageTitle("Dashboard");
  const { enabled } = useAuth();
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
                <StatusPill
                  status="placeholder"
                  label="No operational data"
                  testId="status-dashboard-data"
                />
                <h2 className="mt-4 max-w-md text-xl font-semibold tracking-tight">
                  Weekly ministry reporting
                </h2>
                <p className="mt-2 max-w-md text-[14px] leading-relaxed text-muted-foreground">
                  No weekly reports are available yet.
                </p>
              </div>
              <div className="mt-6 flex flex-wrap gap-2">
                <Link
                  href="/system"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
                  data-testid="link-system"
                >
                  View system status <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
                <Link
                  href="/documentation"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-card px-3.5 text-[13px] font-medium hover:bg-secondary"
                  data-testid="link-docs"
                >
                  View documentation
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
                  label="Week ending"
                  value={formatDate(f.weekEnding)}
                  testId="text-week-ending"
                />
                <KV label="Status checked" value={formatDate(f.asOf, true)} testId="text-as-of" />
                <KV label="Timezone" value={f.timezone} testId="text-timezone" />
              </dl>
            ) : null}
          </Panel>

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

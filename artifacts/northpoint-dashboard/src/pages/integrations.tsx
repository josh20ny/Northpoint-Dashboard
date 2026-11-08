import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useGetFoundation } from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { RestrictedState } from "@/components/admin-controls";
import { PlanningCenterAdmin } from "@/components/planning-center";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader, QueryError, RefreshButton, StatusPill, usePageTitle } from "@/components/kit";

export default function Integrations() {
  usePageTitle("Integrations");
  const q = useGetFoundation();
  const list = q.data?.integrations.filter((it) => it.id !== "planning-center");
  const { user, enabled, isLoading } = useAuth();
  const admin = isLoading ? (
    <Skeleton className="mb-8 h-40 w-full" />
  ) : !enabled ? (
    <RestrictedState
      title="Authentication is not enabled"
      detail="Planning Center management is unavailable until invite-only sign-in is enabled."
    />
  ) : !user ? (
    <RestrictedState
      title="Log in to continue"
      detail="This workspace is limited to verified Northpoint Austin staff."
    />
  ) : user.role !== "admin" ? (
    <RestrictedState
      title="Administrator access required"
      detail={`Signed in as ${user.email} · ${user.role}.`}
    />
  ) : (
    <PlanningCenterAdmin />
  );

  return (
    <>
      <Link
        href="/administration"
        className="mb-6 inline-flex items-center gap-1.5 rounded text-[13px] text-muted-foreground hover:text-foreground"
        data-testid="link-back-admin"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Administration
      </Link>
      <PageHeader
        eyebrow="Administration"
        title="Integrations"
        description="Source connections and their actual status. Other providers listed below are not connected."
        actions={<RefreshButton busy={q.isFetching} onClick={() => q.refetch()} />}
      />
      <div className="mb-8">{admin}</div>
      <h2 className="mb-3 font-display text-[15px] font-semibold">Other providers</h2>
      {q.isError ? (
        <QueryError
          title="Integration list unavailable"
          error={q.error}
          onRetry={() => q.refetch()}
        />
      ) : q.isLoading || q.isFetching ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : !list || list.length === 0 ? (
        <div
          className="rounded-xl border border-dashed bg-card/60 p-10 text-center text-sm text-muted-foreground"
          data-testid="status-empty"
        >
          No integrations are defined.
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {list.map((it, i) => (
            <li
              key={it.id}
              className="np-rise rounded-xl border bg-card p-5"
              style={{ animationDelay: `${i * 40}ms` }}
              data-testid={`card-integration-${it.id}`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-[14.5px] font-medium">{it.name}</p>
                <StatusPill status={it.status} />
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                {it.purpose}
              </p>
              <p className="mt-4 border-t pt-3 font-mono text-[11px] text-muted-foreground">
                id: {it.id}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

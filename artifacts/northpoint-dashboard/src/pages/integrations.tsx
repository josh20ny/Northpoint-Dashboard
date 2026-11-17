import { Link } from "wouter";
import { useState } from "react";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { useGetFoundation } from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { RestrictedState } from "@/components/admin-controls";
import { PlanningCenterAdmin } from "@/components/planning-center";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader, QueryError, RefreshButton, StatusPill, usePageTitle } from "@/components/kit";

export default function Integrations() {
  usePageTitle("Integrations");
  const [otherExpanded, setOtherExpanded] = useState(false);
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
        description="Expand a provider to view its connection, sync controls and status."
        actions={<RefreshButton busy={q.isFetching} onClick={() => q.refetch()} />}
      />
      <div className="space-y-3">
        {admin}
        <details
          className="rounded-xl border bg-card"
          data-testid="section-other-providers"
          onToggle={(event) => setOtherExpanded(event.currentTarget.open)}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3.5 [&::-webkit-details-marker]:hidden">
            <div>
              <h2 className="font-display text-[15px] font-semibold">Other providers</h2>
              <p className="text-[12px] text-muted-foreground">
                {q.isError
                  ? "Provider list unavailable"
                  : q.isLoading
                    ? "Loading provider list"
                    : `${list?.length ?? 0} provider${list?.length === 1 ? "" : "s"} · not connected`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusPill
                status={q.isError ? "unavailable" : q.isLoading ? "loading" : "not_connected"}
                label={q.isError ? "Unavailable" : q.isLoading ? "Loading" : "Not connected"}
              />
              <ChevronDown
                aria-hidden
                className={`h-4 w-4 text-muted-foreground transition-transform ${otherExpanded ? "rotate-180" : ""}`}
              />
            </div>
          </summary>
          <div className="border-t px-4 py-4">
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
          </div>
        </details>
      </div>
    </>
  );
}

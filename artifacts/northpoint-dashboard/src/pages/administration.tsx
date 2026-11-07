import { Link } from "wouter";
import { ArrowRight, Lock } from "lucide-react";
import { useGetFoundation } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  KV,
  PageHeader,
  Panel,
  QueryError,
  RefreshButton,
  StatusPill,
  humanize,
  usePageTitle,
} from "@/components/kit";

const STEPS = [
  [
    "Verify the identity provider",
    "Authentication sits behind a provider adapter and stays disabled until the provider configuration is verified.",
  ],
  [
    "Confirm database readiness",
    "Connectivity and migrations must report ready before any records can be written.",
  ],
  [
    "Assign staff access",
    "Roles are granted to verified staff accounts. There is no self-service or simulated role.",
  ],
  ["Connect sources", "Each integration is connected individually by an authorised administrator."],
];

const PROTECTED = [
  "User and role management",
  "Ministry configuration",
  "Integration credentials",
  "Audit log",
];

export default function Administration() {
  usePageTitle("Administration");
  const q = useGetFoundation();
  const f = q.data;

  return (
    <>
      <PageHeader
        eyebrow="Read-only"
        title="Administration"
        description="How Northpoint Dashboard is set up. This page explains the process; it cannot change anything and requests no credentials."
        actions={<RefreshButton busy={q.isFetching} onClick={() => q.refetch()} />}
      />
      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <Panel title="Setup sequence">
          <ol className="divide-y">
            {STEPS.map(([t, d], i) => (
              <li key={t} className="flex gap-4 px-5 py-4">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border font-mono text-[11px] text-muted-foreground">
                  {i + 1}
                </span>
                <div>
                  <p className="text-[14px] font-medium">{t}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{d}</p>
                </div>
              </li>
            ))}
          </ol>
        </Panel>

        <div className="flex flex-col gap-5">
          <Panel title="Authentication" delay={60}>
            {q.isError ? (
              <div className="p-4">
                <QueryError error={q.error} onRetry={() => q.refetch()} />
              </div>
            ) : q.isLoading || q.isFetching || !f ? (
              <div className="space-y-3 p-5">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-full" />
              </div>
            ) : (
              <dl>
                <KV
                  label="Enabled"
                  value={f.auth.enabled ? "Yes" : "No"}
                  testId="text-auth-enabled"
                />
                <KV
                  label="Provider adapter"
                  value={f.auth.provider}
                  mono
                  testId="text-auth-provider"
                />
                <KV
                  label="Status"
                  value={<StatusPill status={f.auth.status} label={humanize(f.auth.status)} />}
                  testId="status-auth"
                />
              </dl>
            )}
          </Panel>

          <Panel
            title="Protected functions"
            meta={<Lock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />}
            delay={120}
          >
            <ul className="divide-y">
              {PROTECTED.map((p) => (
                <li key={p} className="flex items-center justify-between px-5 py-3">
                  <span className="text-[13px] text-muted-foreground">{p}</span>
                  <button
                    type="button"
                    disabled
                    aria-disabled
                    title="Requires a verified, authorised session"
                    className="h-7 cursor-not-allowed rounded-md border px-2.5 text-[12px] text-muted-foreground opacity-70"
                    data-testid={`button-disabled-${p.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    Locked
                  </button>
                </li>
              ))}
            </ul>
          </Panel>

          <Link
            href="/administration/integrations"
            data-testid="link-integrations"
            className="group flex items-center justify-between rounded-xl border bg-card px-5 py-4 transition-colors hover:bg-secondary/60"
          >
            <span>
              <span className="block text-[14px] font-medium">Integrations</span>
              <span className="block text-[13px] text-muted-foreground">
                Provider scaffolding and connection state
              </span>
            </span>
            <ArrowRight
              className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>
        </div>
      </div>
    </>
  );
}

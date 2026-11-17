import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Search, X } from "lucide-react";
import { useGetFoundation } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader, QueryError, RefreshButton, StatusPill, usePageTitle } from "@/components/kit";
import { MinistryDataView } from "@/components/ministry-data";

export default function Ministries() {
  usePageTitle("Ministries");
  const q = useGetFoundation();
  const [term, setTerm] = useState("");
  const list = q.data?.ministries;
  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase();
    if (!list) return [];
    return t ? list.filter((m) => `${m.name} ${m.description}`.toLowerCase().includes(t)) : list;
  }, [list, term]);

  return (
    <>
      <PageHeader
        eyebrow="Directory"
        title="Ministries"
        description="Ministry reporting areas."
        actions={<RefreshButton busy={q.isFetching} onClick={() => q.refetch()} />}
      />

      <div className="relative mb-5 max-w-md">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <label htmlFor="ministry-search" className="sr-only">
          Search ministries
        </label>
        <input
          id="ministry-search"
          type="search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search ministries"
          data-testid="input-search-ministries"
          className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-9 text-[14px] outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus-visible:outline-none focus:ring-2 focus:ring-ring/25"
        />
        {term && (
          <button
            type="button"
            onClick={() => setTerm("")}
            aria-label="Clear search"
            data-testid="button-clear-search"
            className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded hover:bg-secondary"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>

      {q.isError ? (
        <QueryError
          title="Ministry directory unavailable"
          error={q.error}
          onRetry={() => q.refetch()}
        />
      ) : q.isLoading || q.isFetching ? (
        <div className="divide-y rounded-xl border bg-card">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="p-4">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-2 h-3 w-3/4" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div
          className="rounded-xl border border-dashed bg-card/60 p-10 text-center"
          data-testid="status-empty"
        >
          <p className="text-sm font-medium">
            {list && list.length > 0
              ? `No ministry matches "${term}"`
              : "No ministries are defined yet"}
          </p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {list && list.length > 0 ? "Try another search." : "No ministry records are available."}
          </p>
        </div>
      ) : (
        <>
          <p
            className="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground"
            aria-live="polite"
          >
            {filtered.length} of {list?.length ?? 0}
          </p>
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {filtered.map((m, i) => (
              <li key={m.slug} className="np-rise" style={{ animationDelay: `${i * 25}ms` }}>
                <Link
                  href={`/ministries/${m.slug}`}
                  data-testid={`link-ministry-${m.slug}`}
                  className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-secondary/60 focus-visible:bg-secondary/60"
                >
                  <span
                    aria-hidden
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border bg-background font-mono text-[12px] font-medium text-primary"
                  >
                    {m.name
                      .split(/\s+/)
                      .map((w) => w[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] font-medium">{m.name}</span>
                    <span className="block truncate text-[13px] text-muted-foreground">
                      {m.description}
                    </span>
                  </span>
                  <span className="hidden sm:block">
                    <StatusPill
                      status={m.status}
                      label={m.slug === "service-programming" ? "Attendance connected" : undefined}
                    />
                  </span>
                  <ArrowRight
                    className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      {q.data && !q.isError && !term.trim() && (
        <section className="mt-8" aria-labelledby="shared-teams-title" data-testid="section-shared-serving-teams">
          <h2 id="shared-teams-title" className="mb-2 text-lg font-semibold">Shared and Guest Services teams</h2>
          <p className="mb-4 text-[13px] text-muted-foreground">
            Kids’ Check-In is a separate shared team supporting UpStreet and Waumba Land, not added to either ministry’s totals.
            Guest Services retains separate LU weekly and Safety team figures.
          </p>
          <MinistryDataView ministry="shared-teams" mode="serving" />
        </section>
      )}
    </>
  );
}

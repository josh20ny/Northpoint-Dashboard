import { useMemo } from "react";
import { Link } from "wouter";
import { FileText } from "lucide-react";
import { useListDocuments } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader, QueryError, RefreshButton, humanize, usePageTitle } from "@/components/kit";

export default function Documentation() {
  usePageTitle("Documentation");
  const q = useListDocuments();
  const groups = useMemo(() => {
    const m = new Map<string, NonNullable<typeof q.data>>();
    (q.data ?? []).forEach((d) => m.set(d.category, [...(m.get(d.category) ?? []), d]));
    return [...m.entries()];
  }, [q.data]);

  return (
    <>
      <PageHeader
        eyebrow="Specification"
        title="Documentation"
        description="Planning and operating documents."
        actions={<RefreshButton busy={q.isFetching} onClick={() => q.refetch()} />}
      />
      {q.isError ? (
        <QueryError title="Documents unavailable" error={q.error} onRetry={() => q.refetch()} />
      ) : q.isLoading || q.isFetching ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div
          className="rounded-xl border border-dashed bg-card/60 p-10 text-center text-sm text-muted-foreground"
          data-testid="status-empty"
        >
          No documents have been published yet.
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map(([cat, docs]) => (
            <section key={cat}>
              <h2 className="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                {humanize(cat)}
              </h2>
              <ul className="divide-y overflow-hidden rounded-xl border bg-card">
                {docs.map((d) => (
                  <li key={d.slug}>
                    <Link
                      href={`/documentation/${d.slug}`}
                      data-testid={`link-doc-${d.slug}`}
                      className="group flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-secondary/60"
                    >
                      <FileText
                        className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary"
                        aria-hidden
                      />
                      <span className="flex-1 text-[14px] font-medium">{d.title}</span>
                      <span className="hidden font-mono text-[11.5px] text-muted-foreground sm:block">
                        {d.path}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

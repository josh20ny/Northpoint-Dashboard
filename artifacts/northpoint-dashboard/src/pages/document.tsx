import { Link, useParams } from "wouter";
import { ArrowLeft } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useGetDocument, useListDocuments } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryError, humanize, usePageTitle } from "@/components/kit";
import { cn } from "@/lib/utils";

export default function DocumentPage() {
  const { slug } = useParams<{ slug: string }>();
  const q = useGetDocument(slug);
  const list = useListDocuments();
  usePageTitle(q.data?.title ?? "Document");
  const notFound = (q.error as { status?: number } | null)?.status === 404;

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_200px]">
      <article className="min-w-0">
        <Link
          href="/documentation"
          className="mb-6 inline-flex items-center gap-1.5 rounded text-[13px] text-muted-foreground hover:text-foreground"
          data-testid="link-back-docs"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Documentation
        </Link>
        {q.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-9 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/6" />
          </div>
        ) : notFound ? (
          <div
            className="rounded-xl border border-dashed bg-card/60 p-10 text-center"
            data-testid="status-not-found"
          >
            <p className="text-sm font-medium">This document does not exist</p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Choose one from the documentation index.
            </p>
          </div>
        ) : q.isError || !q.data ? (
          <QueryError title="Document unavailable" error={q.error} onRetry={() => q.refetch()} />
        ) : (
          <>
            <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              {humanize(q.data.category)} <span aria-hidden>/</span> {q.data.path}
            </p>
            <div
              data-testid="text-document"
              className="np-rise prose prose-stone max-w-[72ch] dark:prose-invert prose-headings:tracking-tight prose-headings:font-semibold prose-h1:text-[30px] prose-h2:mt-10 prose-h2:border-b prose-h2:pb-2 prose-h2:text-[20px] prose-h3:text-[16px] prose-p:text-[15px] prose-p:leading-[1.7] prose-li:text-[15px] prose-a:text-primary prose-a:underline-offset-4 prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:font-normal prose-code:before:content-none prose-code:after:content-none prose-pre:bg-[hsl(215_28%_14%)] prose-pre:text-[13px] prose-table:text-[13.5px] prose-th:bg-muted/60 prose-th:px-3 prose-td:px-3 prose-blockquote:border-primary prose-blockquote:font-normal prose-blockquote:not-italic"
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
                {q.data.content}
              </ReactMarkdown>
            </div>
          </>
        )}
      </article>

      <aside className="hidden lg:block">
        <div className="sticky top-10">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            All documents
          </p>
          {list.isLoading ? (
            <Skeleton className="h-32" />
          ) : (
            <ul className="space-y-0.5 border-l">
              {(list.data ?? []).map((d) => (
                <li key={d.slug}>
                  <Link
                    href={`/documentation/${d.slug}`}
                    aria-current={d.slug === slug ? "page" : undefined}
                    data-testid={`link-doc-side-${d.slug}`}
                    className={cn(
                      "-ml-px block border-l py-1 pl-3 text-[12.5px] transition-colors",
                      d.slug === slug
                        ? "border-primary font-medium text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {d.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

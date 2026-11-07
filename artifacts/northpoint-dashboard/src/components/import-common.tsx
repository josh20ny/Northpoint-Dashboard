import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";

export const IMPORT_PREFIX = "/api/v1/admin/imports";
export const IMPORT_QUERY = { staleTime: 30000, refetchOnWindowFocus: true } as const;

export const csrfRequest = (csrfToken: string | null) => ({
  request: { headers: { "X-CSRF-Token": csrfToken ?? "" } },
});

export function useInvalidateImports() {
  const queryClient = useQueryClient();
  return (id?: string) =>
    queryClient.invalidateQueries({
      predicate: (q) => {
        const k = q.queryKey[0];
        if (typeof k !== "string") return false;
        if (!id) return k.startsWith(IMPORT_PREFIX);
        return k === IMPORT_PREFIX || k.startsWith(`${IMPORT_PREFIX}/${id}`);
      },
    });
}

const base = import.meta.env.BASE_URL.replace(/\/$/, "");
export const importHref = (id: string, path: string) =>
  `${base}${IMPORT_PREFIX}/${encodeURIComponent(id)}/${path}`;

export const btn =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-md border bg-card px-2.5 text-[12px] font-medium hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-45";
export const btnPrimary =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
export const inputCls =
  "h-9 w-full rounded-md border border-input bg-background px-2.5 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function DownloadLink({
  href,
  label,
  disabled,
  testId,
}: {
  href: string;
  label: string;
  disabled?: boolean;
  testId: string;
}) {
  if (disabled)
    return (
      <span aria-disabled className={cn(btn, "cursor-not-allowed opacity-45")} data-testid={testId}>
        <Download className="h-3.5 w-3.5" aria-hidden /> {label}
      </span>
    );
  return (
    <a href={href} className={btn} data-testid={testId} download>
      <Download className="h-3.5 w-3.5" aria-hidden /> {label}
    </a>
  );
}

export function Flags({ flags }: { flags: string[] }) {
  if (flags.length === 0) return <span className="text-muted-foreground">None</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {flags.map((f) => (
        <span
          key={f}
          className="rounded border border-[hsl(36_50%_78%)] bg-[hsl(36_80%_94%)] px-1.5 font-mono text-[10.5px] text-[hsl(28_70%_28%)] dark:bg-[hsl(30_40%_14%)] dark:text-[hsl(36_70%_70%)]"
        >
          {f}
        </span>
      ))}
    </span>
  );
}

export function Nullable({ value }: { value: ReactNode | null }) {
  if (value === null || value === undefined || value === "")
    return <span className="italic text-muted-foreground">unknown</span>;
  return <>{value}</>;
}

export function Pager({
  page,
  hasMore,
  busy,
  onPage,
  label,
}: {
  page: number;
  hasMore: boolean;
  busy: boolean;
  onPage: (p: number) => void;
  label: string;
}) {
  return (
    <div className="mt-3 flex items-center justify-between gap-2 text-[11.5px] text-muted-foreground">
      <span>
        {label} page {page}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          className={btn}
          disabled={page <= 1 || busy}
          onClick={() => onPage(page - 1)}
          data-testid={`button-${label.toLowerCase().replace(/\s+/g, "-")}-previous`}
        >
          Previous
        </button>
        <button
          type="button"
          className={btn}
          disabled={!hasMore || busy}
          onClick={() => onPage(page + 1)}
          data-testid={`button-${label.toLowerCase().replace(/\s+/g, "-")}-next`}
        >
          Next
        </button>
      </div>
    </div>
  );
}

export function Note({
  children,
  tone = "accent",
}: {
  children: ReactNode;
  tone?: "accent" | "warn";
}) {
  return (
    <p
      className={cn(
        "rounded-md px-3 py-2 text-[12px] leading-relaxed",
        tone === "accent"
          ? "bg-accent/50 text-accent-foreground"
          : "border border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100",
      )}
    >
      {children}
    </p>
  );
}

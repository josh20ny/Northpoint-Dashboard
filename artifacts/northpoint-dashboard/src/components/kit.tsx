import { useEffect, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · Northpoint Dashboard`;
  }, [title]);
}

type Tone = "ok" | "warn" | "off" | "bad" | "neutral";

export function toneFor(status: string | undefined): Tone {
  const s = (status ?? "").toLowerCase();
  if (
    ["ok", "ready", "healthy", "connected", "up", "current", "applied", "pass"].some(
      (k) => s === k || s.startsWith(k),
    )
  )
    return "ok";
  if (["error", "fail", "down", "unavailable", "unreachable", "denied"].some((k) => s.includes(k)))
    return "bad";
  if (
    ["pending", "not_verified", "unverified", "partial", "degraded", "warn"].some((k) =>
      s.includes(k),
    )
  )
    return "warn";
  if (
    ["disabled", "not_connected", "unconnected", "placeholder", "future", "planned", "off"].some(
      (k) => s.includes(k),
    )
  )
    return "off";
  return "neutral";
}

const toneStyles: Record<Tone, string> = {
  ok: "bg-[hsl(163_31%_88%)] text-[hsl(209_34%_20%)] border-[hsl(163_20%_72%)] dark:bg-[hsl(163_25%_25%)] dark:text-[hsl(163_40%_82%)] dark:border-[hsl(163_20%_38%)]",
  warn: "bg-[hsl(36_80%_92%)] text-[hsl(28_70%_28%)] border-[hsl(36_50%_78%)] dark:bg-[hsl(30_40%_14%)] dark:text-[hsl(36_70%_70%)] dark:border-[hsl(30_30%_26%)]",
  bad: "bg-[hsl(4_70%_95%)] text-[hsl(4_62%_36%)] border-[hsl(4_50%_84%)] dark:bg-[hsl(4_40%_16%)] dark:text-[hsl(4_70%_74%)] dark:border-[hsl(4_30%_28%)]",
  off: "bg-muted text-muted-foreground border-border",
  neutral:
    "bg-accent text-accent-foreground border-[hsl(163_20%_72%)] dark:border-[hsl(163_20%_38%)]",
};
const dotStyles: Record<Tone, string> = {
  ok: "bg-[hsl(152_45%_36%)]",
  warn: "bg-[hsl(32_80%_48%)]",
  bad: "bg-[hsl(4_62%_48%)]",
  off: "bg-[hsl(215_10%_60%)]",
  neutral: "bg-primary",
};

export function humanize(s: string | undefined) {
  if (!s) return "Unknown";
  const t = s.replace(/[_-]+/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function StatusPill({
  status,
  label,
  testId,
}: {
  status?: string;
  label?: string;
  testId?: string;
}) {
  const tone = toneFor(status);
  return (
    <span
      data-testid={testId}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11.5px] font-medium leading-5 whitespace-nowrap",
        toneStyles[tone],
      )}
    >
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", dotStyles[tone])} />
      {label ?? humanize(status)}
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="np-rise mb-8 flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        {eyebrow && (
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            {eyebrow}
          </p>
        )}
        <h1
          className="font-display text-[28px] font-semibold leading-tight tracking-[-0.02em] sm:text-[32px]"
          data-testid="text-page-title"
        >
          {title}
        </h1>
        {description && (
          <div className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
            {description}
          </div>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Panel({
  title,
  meta,
  children,
  className,
  delay = 0,
}: {
  title?: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <section
      className={cn(
        "np-rise rounded-xl border bg-card shadow-[0_2px_8px_rgba(34,50,66,0.035)]",
        className,
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      {title && (
        <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
          <h2 className="font-display text-[13px] font-semibold tracking-tight">{title}</h2>
          {meta}
        </div>
      )}
      {children}
    </section>
  );
}

export function KV({
  label,
  value,
  mono,
  testId,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  testId?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-5 py-3 [&+&]:border-t">
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd
        data-testid={testId}
        className={cn("text-right text-[13px] font-medium", mono && "font-mono text-[12.5px]")}
      >
        {value}
      </dd>
    </div>
  );
}

export function RefreshButton({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      data-testid="button-refresh"
      className="inline-flex h-9 items-center gap-2 rounded-lg border bg-card px-3 text-[13px] font-medium transition-colors hover:bg-secondary disabled:opacity-60"
    >
      <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} aria-hidden />
      {busy ? "Refreshing" : "Refresh"}
    </button>
  );
}

export function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "status" in err) {
    const e = err as { status: number; statusText?: string };
    return `The server responded with ${e.status}${e.statusText ? ` ${e.statusText}` : ""}.`;
  }
  if (err instanceof Error) return err.message;
  return "The API could not be reached.";
}

export function QueryError({
  title = "API unavailable",
  error,
  onRetry,
}: {
  title?: string;
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="np-rise rounded-xl border border-[hsl(4_50%_84%)] bg-[hsl(4_70%_97%)] p-5 dark:border-[hsl(4_30%_28%)] dark:bg-[hsl(4_40%_12%)]"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
        <div className="flex-1">
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-1 text-[13px] text-muted-foreground" data-testid="text-error">
            {errorMessage(error)}
          </p>
          <button
            type="button"
            onClick={onRetry}
            data-testid="button-retry"
            className="mt-3 inline-flex h-8 items-center gap-2 rounded-md border bg-card px-3 text-[13px] font-medium hover:bg-secondary"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Retry
          </button>
        </div>
      </div>
    </div>
  );
}

export { formatDate } from "@/lib/reporting-format";

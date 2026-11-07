import { Link } from "wouter";
import { usePageTitle } from "@/components/kit";

export default function NotFound() {
  usePageTitle("Not found");
  return (
    <div className="flex min-h-[50dvh] flex-col items-start justify-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        This page is not part of Phase 0
      </h1>
      <p className="mt-2 max-w-md text-[14px] text-muted-foreground">
        Only the foundation routes exist right now.
      </p>
      <Link
        href="/"
        className="mt-5 inline-flex h-9 items-center rounded-lg bg-primary px-3.5 text-[13px] font-medium text-primary-foreground hover:opacity-90"
        data-testid="link-home-404"
      >
        Back to dashboard
      </Link>
    </div>
  );
}

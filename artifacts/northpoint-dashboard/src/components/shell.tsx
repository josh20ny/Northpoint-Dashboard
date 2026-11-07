import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  BookOpen,
  Compass,
  LayoutGrid,
  Lock,
  Menu,
  Plug,
  ShieldCheck,
  Activity,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", icon: Compass, exact: true },
  { href: "/ministries", label: "Ministries", icon: LayoutGrid },
  { href: "/administration", label: "Administration", icon: ShieldCheck, exact: true },
  { href: "/administration/integrations", label: "Integrations", icon: Plug, indent: true },
  { href: "/system", label: "System", icon: Activity },
  { href: "/documentation", label: "Documentation", icon: BookOpen },
];

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const [loc] = useLocation();
  return (
    <nav aria-label="Primary" className="flex flex-col gap-0.5">
      {NAV.map((n) => {
        const active = n.exact ? loc === n.href : loc === n.href || loc.startsWith(n.href + "/");
        const Icon = n.icon;
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            data-testid={`link-nav-${n.label.toLowerCase()}`}
            className={cn(
              "group relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] transition-colors",
              n.indent && "ml-4 h-8 text-[13px]",
              active
                ? "bg-card font-medium text-foreground ring-1 ring-border"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-foreground",
            )}
          >
            {active && (
              <span
                aria-hidden
                className="absolute -left-3 top-2 bottom-2 w-[2px] rounded-full bg-primary"
              />
            )}
            <Icon
              className={cn(
                "h-4 w-4 shrink-0",
                active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
              )}
              aria-hidden
            />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded-md" data-testid="link-home">
      <span
        aria-hidden
        className="grid h-7 w-7 place-items-center rounded-md border bg-card font-mono text-[11px] font-medium text-primary"
      >
        2.0
      </span>
      <span className="leading-tight">
        <span className="block text-[13.5px] font-semibold tracking-tight">
          Northpoint Dashboard
        </span>
        <span className="block font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
          Phase 0 foundation
        </span>
      </span>
    </Link>
  );
}

function SessionNote() {
  return (
    <div
      className="rounded-lg border border-dashed bg-background/60 p-3"
      data-testid="status-session"
    >
      <div className="flex items-center gap-2 text-[12px] font-semibold">
        <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> Unauthenticated preview
      </div>
      <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
        Not a signed-in session. No church records are loaded and operational APIs deny access.
      </p>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [loc] = useLocation();
  useEffect(() => {
    setOpen(false);
    window.scrollTo(0, 0);
  }, [loc]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]);

  return (
    <div className="min-h-[100dvh] bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>

      <aside className="fixed inset-y-0 left-0 hidden w-[248px] flex-col border-r bg-sidebar px-4 py-5 lg:flex">
        <div className="px-1">
          <Wordmark />
        </div>
        <div className="mt-8 flex-1 px-1">
          <NavList />
        </div>
        <SessionNote />
      </aside>

      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/90 px-4 backdrop-blur lg:hidden">
        <Wordmark />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          aria-expanded={open}
          data-testid="button-open-nav"
          className="grid h-9 w-9 place-items-center rounded-lg border bg-card hover:bg-secondary"
        >
          <Menu className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
        >
          <button
            aria-label="Close navigation"
            className="absolute inset-0 bg-foreground/25 animate-in fade-in"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-[280px] flex-col bg-sidebar px-4 py-5 animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between px-1">
              <Wordmark />
              <button
                type="button"
                autoFocus
                onClick={() => setOpen(false)}
                aria-label="Close navigation"
                data-testid="button-close-nav"
                className="grid h-8 w-8 place-items-center rounded-md hover:bg-sidebar-accent"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <div className="mt-8 flex-1 px-1">
              <NavList onNavigate={() => setOpen(false)} />
            </div>
            <SessionNote />
          </div>
        </div>
      )}

      <main id="main" className="lg:pl-[248px]">
        <div className="mx-auto max-w-[1080px] px-5 py-8 sm:px-8 sm:py-10">{children}</div>
      </main>
    </div>
  );
}

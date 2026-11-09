import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  BookOpen,
  Compass,
  LayoutGrid,
  Users,
  Lock,
  Menu,
  Plug,
  FileSpreadsheet,
  ShieldCheck,
  Activity,
  X,
  LogIn,
  LogOut,
} from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", icon: Compass, exact: true },
  { href: "/attendance", label: "Attendance", icon: Users },
  { href: "/ministries", label: "Ministries", icon: LayoutGrid },
  { href: "/administration", label: "Administration", icon: ShieldCheck, exact: true },
  { href: "/administration/integrations", label: "Integrations", icon: Plug, indent: true },
  { href: "/administration/imports", label: "Imports", icon: FileSpreadsheet, indent: true },
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
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
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
                active
                  ? "text-primary"
                  : "text-sidebar-foreground/65 group-hover:text-sidebar-accent-foreground",
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
    <Link
      href="/"
      className="flex items-center rounded-md"
      data-testid="link-home"
      aria-label="Northpoint Dashboard home"
    >
      <img
        src={`${import.meta.env.BASE_URL}brand/northpoint-logo-light.png`}
        alt="Northpoint"
        className="h-auto w-[154px] object-contain"
      />
    </Link>
  );
}

function SessionNote() {
  const { user, enabled, isLoading, error, login, logout } = useAuth();
  return (
    <div
      className="rounded-lg border border-sidebar-border bg-sidebar-accent/50 p-3"
      data-testid="status-session"
    >
      <div className="flex items-center gap-2 text-[12px] font-semibold text-sidebar-foreground">
        <Lock className="h-3.5 w-3.5 text-sidebar-foreground/70" aria-hidden />
        {isLoading
          ? "Checking access"
          : user
            ? "Signed in"
            : enabled
              ? "Invite-only access"
              : "Preview access"}
      </div>
      <p className="mt-1 break-all text-[11.5px] leading-relaxed text-sidebar-foreground/70">
        {user ? (
          <>
            {user.email}
            <span className="block mt-0.5 capitalize">Role: {user.role}</span>
          </>
        ) : enabled ? (
          "Northpoint Austin staff access is by invitation."
        ) : (
          "Authentication is not enabled."
        )}
      </p>
      {error && (
        <p role="status" className="mt-2 text-[11px] text-amber-200">
          {error}
        </p>
      )}
      {!isLoading && (
        <button
          type="button"
          onClick={() => (user ? void logout() : enabled ? login() : undefined)}
          disabled={!user && !enabled}
          data-testid={user ? "button-log-out" : "button-log-in"}
          className="mt-3 inline-flex h-8 items-center gap-2 rounded-md border border-sidebar-border px-2.5 text-[12px] font-medium text-sidebar-foreground hover:bg-sidebar-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          {user ? (
            <LogOut className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <LogIn className="h-3.5 w-3.5" aria-hidden />
          )}
          {user ? "Log out" : "Log in"}
        </button>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [loc] = useLocation();
  const [denied, setDenied] = useState(
    () => new URLSearchParams(window.location.search).get("auth") === "denied",
  );
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

      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-sidebar-border bg-sidebar px-4 text-sidebar-foreground lg:hidden">
        <Wordmark />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          aria-expanded={open}
          data-testid="button-open-nav"
          className="grid h-9 w-9 place-items-center rounded-lg border border-sidebar-border bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-accent/80"
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
        <div className="mx-auto max-w-[1080px] px-5 py-8 sm:px-8 sm:py-10">
          {denied && (
            <div
              role="alert"
              className="mb-6 flex items-start justify-between gap-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
            >
              <span>
                <strong>Access was not granted.</strong> This dashboard is invite-only. Use a
                verified email address with an active Northpoint invitation, or contact a Northpoint
                administrator.
              </span>
              <button
                type="button"
                aria-label="Dismiss access message"
                onClick={() => setDenied(false)}
                className="shrink-0 rounded px-2 py-1 hover:bg-amber-100"
              >
                Dismiss
              </button>
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}

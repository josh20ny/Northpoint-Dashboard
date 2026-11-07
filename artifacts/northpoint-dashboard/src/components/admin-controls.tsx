import type { ReactNode } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import type { AccessUser, AuditRecord, Invitation } from "@workspace/api-client-react";
import { Lock, Plus, RotateCw, type LucideIcon } from "lucide-react";
import { StatusPill, formatDate } from "@/components/kit";

export function TextField(props: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  pattern?: string;
  min?: number;
  max?: number;
  maxLength?: number;
  step?: number;
}) {
  return (
    <Field label={props.label} hint={props.hint}>
      <input
        data-testid={`input-${props.name}`}
        name={props.name}
        type={props.type ?? "text"}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        required={props.required}
        placeholder={props.placeholder}
        pattern={props.pattern}
        min={props.min}
        max={props.max}
        maxLength={props.maxLength}
        step={props.step}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-[13px] shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </Field>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  children,
  name,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  name: string;
}) {
  return (
    <Field label={label}>
      <select
        data-testid={`select-${name}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-[13px]"
      >
        <option value="" disabled>
          Select…
        </option>
        {children}
      </select>
    </Field>
  );
}

export function SubmitButton({ children, pending }: { children: ReactNode; pending: boolean }) {
  const testId = `button-${String(children)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
  return (
    <button
      data-testid={testId}
      type="submit"
      disabled={pending}
      className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
    >
      {pending ? (
        <RotateCw className="h-3.5 w-3.5 animate-spin" aria-hidden />
      ) : (
        <Plus className="h-3.5 w-3.5" aria-hidden />
      )}
      {pending ? "Saving…" : children}
    </button>
  );
}

export function FormError({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p
      role="alert"
      className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive"
    >
      {safeMutationError(error)}
    </p>
  );
}

export function SectionHeading({
  icon: Icon,
  title,
  detail,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
}) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent text-primary">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div>
        <h2 className="font-display text-[17px] font-semibold">{title}</h2>
        <p className="mt-0.5 text-[12px] text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

export function RestrictedState({ title, detail }: { title: string; detail: string }) {
  const { login, enabled, isAuthenticated } = useAuth();
  return (
    <section className="rounded-xl border bg-card p-6 sm:p-8">
      <div className="flex items-start gap-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          <Lock className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <h2 className="font-display text-[17px] font-semibold">{title}</h2>
          <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
            {detail}
          </p>
          {!isAuthenticated && enabled && (
            <button
              type="button"
              onClick={login}
              className="mt-4 h-9 rounded-md bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground"
            >
              Log in
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

export function EmptyRecord({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 rounded-lg border border-dashed bg-muted/25 px-4 py-5 text-center text-[12px] text-muted-foreground">
      {children}
    </div>
  );
}

export function InvitationRow({
  item,
  onRevoke,
  busy,
}: {
  item: Invitation;
  onRevoke: () => void;
  busy: boolean;
}) {
  const state = item.revokedAt
    ? "Revoked"
    : item.consumedAt
      ? "Used"
      : new Date(item.expiresAt).getTime() <= Date.now()
        ? "Expired"
        : "Pending";
  const canRevoke = !item.consumedAt && !item.revokedAt;
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 py-3"
      data-testid={`row-invitation-${item.id}`}
    >
      <div>
        <p className="text-[13px] font-medium">
          {item.email}
          <span className="ml-2 capitalize text-muted-foreground">{item.role}</span>
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {state} · Expires {formatDate(item.expiresAt, true)}
        </p>
      </div>
      {canRevoke && (
        <button
          type="button"
          disabled={busy}
          onClick={onRevoke}
          className="h-8 rounded-md border px-2.5 text-[12px] text-destructive hover:bg-destructive/5 disabled:opacity-50"
        >
          Revoke
        </button>
      )}
    </div>
  );
}

export function AuditRow({ item, users }: { item: AuditRecord; users: AccessUser[] }) {
  const actor =
    users.find((user) => user.id === item.actorUserId)?.email ?? item.actorUserId ?? "System";
  return (
    <tr data-testid={`row-audit-${item.id}`} className="border-b last:border-0">
      <td className="whitespace-nowrap py-3 pr-3">{formatDate(item.timestamp, true)}</td>
      <td className="max-w-[180px] truncate py-3 pr-3" title={actor}>
        {actor}
      </td>
      <td className="py-3 pr-3">
        <span className="font-medium">{item.action}</span>
        <span className="block text-[10px] text-muted-foreground">
          {item.targetType}
          {item.targetId ? ` · ${item.targetId}` : ""}
        </span>
      </td>
      <td className="py-3">
        <StatusPill status={item.outcome} />
      </td>
    </tr>
  );
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[12px] font-medium text-foreground">{label}</span>
      {children}
      {hint && (
        <span className="block text-[11px] leading-relaxed text-muted-foreground">{hint}</span>
      )}
    </label>
  );
}

function safeMutationError(error: unknown) {
  if (error && typeof error === "object" && "status" in error) {
    const apiError = error as { status: number; data?: unknown };
    const data = apiError.data as { error?: unknown } | null;
    const reason = typeof data?.error === "string" ? data.error : null;
    if (apiError.status === 409) {
      return (
        reason ||
        "This change conflicts with current access policy. Review active administrators and try again."
      );
    }
    return reason || `The request could not be completed (${apiError.status}).`;
  }
  return "The request could not be completed. Check the connection and try again.";
}

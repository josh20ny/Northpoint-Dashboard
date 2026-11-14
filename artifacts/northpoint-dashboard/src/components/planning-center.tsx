import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@workspace/replit-auth-web";
import {
  getGetPlanningCenterQueryKey,
  useAdvancePlanningCenterSync,
  useAuthorizePlanningCenter,
  useCancelPlanningCenterSync,
  useConfirmPlanningCenter,
  useDisconnectPlanningCenter,
  useGetPlanningCenter,
  useStartPlanningCenterSync,
  useSetPlanningCenterAutomation,
  type PlanningCenterSync,
  type PlanningCenterSyncInputMode,
  type PlanningCenterSyncInputProduct,
  type PlanningCenterWorkspace,
} from "@workspace/api-client-react";
import { Link2, RefreshCcw, Settings2 } from "lucide-react";
import { Panel, QueryError, RefreshButton, StatusPill } from "@/components/kit";
import { EmptyRecord, FormError, SectionHeading } from "@/components/admin-controls";
import { Skeleton } from "@/components/ui/skeleton";
import { btn, btnPrimary, csrfRequest, Note } from "@/components/import-common";
import { RefreshSchedule } from "@/components/planning-center-schedule";
import { SourceLifecycle } from "@/components/planning-center-lifecycle";

const PRODUCTS: [PlanningCenterSyncInputProduct, string][] = [
  ["people", "People"],
  ["services", "Services"],
  ["check_ins", "Check-Ins"],
  ["giving", "Giving"],
  ["groups", "Groups"],
  ["serving", "Serving"],
];
/** Planning Center scope each sync product needs. Serving uses the Services scope. */
const SCOPE_FOR: Record<string, string> = {
  people: "people",
  services: "services",
  check_ins: "check_ins",
  giving: "giving",
  groups: "groups",
  serving: "services",
};
const MODE_LABEL: Record<string, string> = {
  backfill: "Backfill",
  incremental: "Incremental",
  current: "Current",
};
const ADDITIONAL = ["giving", "groups"] as const;
type Additional = (typeof ADDITIONAL)[number];
const fmt = (s: string | null) => (s ? new Date(s).toLocaleString() : "Never");
const n = (v: number) => v.toLocaleString();

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: getGetPlanningCenterQueryKey() });
}

function Setup({ ws }: { ws: PlanningCenterWorkspace }) {
  return (
    <Panel className="p-5 sm:p-6">
      <SectionHeading
        icon={Settings2}
        title="Setup"
        detail="Server configuration required before connecting."
      />
      <ol className="list-decimal space-y-1.5 pl-5 text-[13px] leading-relaxed">
        <li>
          A Planning Center organization Admin creates a confidential OAuth application at{" "}
          <a
            href="https://api.planningcenteronline.com/oauth/applications"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-2"
            data-testid="link-pco-oauth-apps"
          >
            api.planningcenteronline.com/oauth/applications
          </a>
          .
        </li>
        <li>
          Register this callback URL on that application:{" "}
          {ws.callbackUrl ? (
            <code
              className="break-all rounded bg-muted px-1.5 py-0.5 font-mono text-[12px]"
              data-testid="text-callback-url"
            >
              {ws.callbackUrl}
            </code>
          ) : (
            <span className="text-muted-foreground">
              unavailable until AUTH_ORIGIN is set (the callback is derived from it).
            </span>
          )}
        </li>
        <li>
          Store <code className="font-mono text-[12px]">PCO_CLIENT_ID</code>,{" "}
          <code className="font-mono text-[12px]">PCO_CLIENT_SECRET</code> and{" "}
          <code className="font-mono text-[12px]">PCO_TOKEN_ENCRYPTION_KEY</code> (64 hex
          characters, generated privately) as server secrets. Values are never entered or shown
          here.
        </li>
      </ol>
      <p className="mt-3 text-[12px] text-muted-foreground">
        Requested scopes:{" "}
        <span className="font-mono" data-testid="text-requested-scopes">
          {ws.requestedScopes.length ? ws.requestedScopes.join(", ") : "none"}
        </span>
        . Giving and Groups are not requested.
      </p>
      {!ws.configured && (
        <div className="mt-3">
          <Note tone="warn">
            Not configured. Missing:{" "}
            <span className="font-mono" data-testid="text-missing-config">
              {ws.missingConfiguration.join(", ") || "unknown"}
            </span>
          </Note>
        </div>
      )}
    </Panel>
  );
}

function Connection({ ws }: { ws: PlanningCenterWorkspace }) {
  const { csrfToken } = useAuth();
  const invalidate = useInvalidate();
  const opts = { ...csrfRequest(csrfToken), mutation: { onSettled: () => void invalidate() } };
  const authorize = useAuthorizePlanningCenter(csrfRequest(csrfToken));
  const confirm = useConfirmPlanningCenter(opts);
  const disconnect = useDisconnectPlanningCenter(opts);
  const [checked, setChecked] = useState(false);
  const [askDisconnect, setAskDisconnect] = useState(false);
  const [extra, setExtra] = useState<Additional[]>([]);
  const [ackEnv, setAckEnv] = useState(false);
  const [ackGiving, setAckGiving] = useState(false);
  const [ackGroups, setAckGroups] = useState(false);
  const [ackConsent, setAckConsent] = useState(false);
  const c = ws.connection;
  const active = c && c.state !== "disconnected";
  const busy = authorize.isPending || confirm.isPending || disconnect.isPending;

  return (
    <Panel className="p-5 sm:p-6">
      <SectionHeading
        icon={Link2}
        title="Connection"
        detail="One Planning Center organization per workspace."
      />
      {!c ? (
        <EmptyRecord>No Planning Center organization has been connected.</EmptyRecord>
      ) : (
        <div className="space-y-2 text-[13px]" data-testid="card-pco-connection">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">
              {c.accountName}{" "}
              <span className="font-mono text-[11px] text-muted-foreground">
                org {c.accountRef}
              </span>
            </p>
            <StatusPill
              status={
                c.state === "connected" ? "current" : c.state === "disconnected" ? "off" : "pending"
              }
              label={
                {
                  pending: "Awaiting confirmation",
                  connected: "Connected",
                  reconnect_required: "Reconnect required",
                  disconnected: "Disconnected",
                }[c.state]
              }
            />
          </div>
          <p className="text-[12px] text-muted-foreground">
            Scopes <span className="font-mono">{c.scopes.join(", ") || "none"}</span> · Connected by{" "}
            {c.connectedBy} · Updated {fmt(c.updatedAt)} · Last success {fmt(c.lastSuccessAt)}
          </p>
          {c.error && <Note tone="warn">{c.error}</Note>}
        </div>
      )}

      {c?.state === "pending" && (
        <div className="mt-4 space-y-2 rounded-md border bg-muted/25 p-3">
          <label className="flex items-start gap-2 text-[12.5px]">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              disabled={busy}
              data-testid="checkbox-confirm-org"
            />
            I confirm <strong className="mx-1">{c.accountName}</strong> (org {c.accountRef}) is the
            correct Northpoint Austin organization and its permissions were checked. Nothing is
            ingested before this confirmation.
          </label>
          <button
            type="button"
            className={btnPrimary}
            disabled={!checked || busy}
            onClick={() =>
              confirm.mutate(
                { data: { accountRef: c.accountRef } },
                { onSuccess: () => setChecked(false) },
              )
            }
            data-testid="button-confirm-org"
          >
            {confirm.isPending ? "Confirming" : "Confirm organization"}
          </button>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {!active ? (
          <button
            type="button"
            className={btnPrimary}
            disabled={!ws.configured || busy}
            onClick={() =>
              authorize.mutate({ data: undefined }, { onSuccess: (r) => window.location.assign(r.url) })
            }
            data-testid="button-authorize-pco"
          >
            {authorize.isPending
              ? "Redirecting"
              : c
                ? "Reconnect Planning Center"
                : "Connect Planning Center"}
          </button>
        ) : (
          <p className="self-center text-[12px] text-muted-foreground">
            To connect a different account or reconnect, disconnect first.
          </p>
        )}
        {active && (
          <button
            type="button"
            className={btn}
            disabled={busy}
            onClick={() => setAskDisconnect(true)}
            data-testid="button-disconnect-pco"
          >
            Disconnect
          </button>
        )}
      </div>
      {ws.configured && (!c || c.state !== "pending") && (
        <form
          className="mt-4 space-y-2.5 rounded-md border bg-muted/20 p-3 text-[12.5px]"
          aria-label="Add Giving or Groups access"
          data-testid="form-pco-additional"
          onSubmit={(e) => {
            e.preventDefault();
            const ok =
              extra.length > 0 &&
              ackEnv &&
              ackConsent &&
              (!extra.includes("giving") || ackGiving) &&
              (!extra.includes("groups") || ackGroups);
            if (!ok || busy) return;
            authorize.mutate(
              {
                data: {
                  additionalProducts: extra,
                  replaceExisting: !!active,
                  acknowledgeSensitiveData: true,
                },
              },
              { onSuccess: (r) => window.location.assign(r.url) },
            );
          }}
        >
          <p className="font-medium">Optional: add Giving or Groups access</p>
          <p className="text-muted-foreground">
            The current People, Services and Check-Ins access stays as it is.{" "}
            {active
              ? "Your existing connection is kept unless the upgrade succeeds for the same organization."
              : "This connects with the base access plus the products you choose."}
          </p>
          <fieldset className="flex flex-wrap gap-4">
            <legend className="sr-only">Products to add</legend>
            {ADDITIONAL.map((p) => (
              <label key={p} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={extra.includes(p)}
                  disabled={busy}
                  onChange={(e) =>
                    setExtra((x) => (e.target.checked ? [...x, p] : x.filter((y) => y !== p)))
                  }
                  data-testid={`checkbox-add-${p}`}
                />
                {p === "giving" ? "Giving" : "Groups"}
                {c?.scopes.includes(p) && (
                  <span className="text-[11px] text-muted-foreground">(already granted)</span>
                )}
              </label>
            ))}
          </fieldset>
          {extra.includes("giving") && (
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={ackGiving} disabled={busy} onChange={(e) => setAckGiving(e.target.checked)} data-testid="checkbox-ack-giving" />
              I understand Giving imports pseudonymous PCO Giving donor IDs and individual transactions into this development database.
            </label>
          )}
          {extra.includes("groups") && (
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={ackGroups} disabled={busy} onChange={(e) => setAckGroups(e.target.checked)} data-testid="checkbox-ack-groups" />
              I understand Groups imports pseudonymous membership and attendance person IDs into this development database.
            </label>
          )}
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={ackEnv} disabled={busy} onChange={(e) => setAckEnv(e.target.checked)} data-testid="checkbox-ack-environment" />
            I accept storing this data in this environment and the privacy responsibility that comes with it.
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={ackConsent} disabled={busy} onChange={(e) => setAckConsent(e.target.checked)} data-testid="checkbox-ack-consent" />
            I will review and accept the Planning Center consent screen for these permissions.
          </label>
          <button
            type="submit"
            className={btnPrimary}
            disabled={
              busy ||
              extra.length === 0 ||
              !ackEnv ||
              !ackConsent ||
              (extra.includes("giving") && !ackGiving) ||
              (extra.includes("groups") && !ackGroups)
            }
            data-testid="button-authorize-additional"
          >
            {authorize.isPending ? "Redirecting" : "Continue to Planning Center"}
          </button>
        </form>
      )}
      {askDisconnect && (
        <div className="mt-3 space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-[12.5px]">
          <p>
            Disconnecting revokes stored Planning Center tokens. Synced source history is retained.
            You can reconnect afterward.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className={btnPrimary}
              disabled={disconnect.isPending}
              onClick={() =>
                disconnect.mutate(undefined, { onSuccess: () => setAskDisconnect(false) })
              }
              data-testid="button-confirm-disconnect"
            >
              {disconnect.isPending ? "Disconnecting" : "Revoke and disconnect"}
            </button>
            <button
              type="button"
              className={btn}
              disabled={disconnect.isPending}
              onClick={() => setAskDisconnect(false)}
              data-testid="button-cancel-disconnect"
            >
              Keep connection
            </button>
          </div>
        </div>
      )}
      <div className="mt-2 space-y-1">
        <FormError error={authorize.error} />
        <FormError error={confirm.error} />
        <FormError error={disconnect.error} />
      </div>
    </Panel>
  );
}

function SyncRow({ s }: { s: PlanningCenterSync }) {
  const { csrfToken } = useAuth();
  const invalidate = useInvalidate();
  const opts = { ...csrfRequest(csrfToken), mutation: { onSettled: () => void invalidate() } };
  const advance = useAdvancePlanningCenterSync(opts);
  const cancel = useCancelPlanningCenterSync(opts);
  const automation = useSetPlanningCenterAutomation(opts);
  const open = s.status === "running" || s.status === "retry";
  const busy = advance.isPending || cancel.isPending || automation.isPending;
  const retryWait = s.status === "retry" && s.retryAt && new Date(s.retryAt).getTime() > Date.now();
  return (
    <li className="rounded-lg border bg-card p-3.5" data-testid={`card-sync-${s.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-medium">
          {PRODUCTS.find((p) => p[0] === s.product)?.[1]} ·{" "}
          {MODE_LABEL[s.mode] ?? s.mode}
          {s.coverageStart && (
            <span className="font-normal text-muted-foreground" data-testid={`text-coverage-${s.id}`}>
              {" "}· From {s.coverageStart.slice(0, 10)}
              {s.coverageEnd && ` through ${s.coverageEnd.slice(0, 10)}`}
            </span>
          )}
        </p>
        <StatusPill
          status={
            s.status === "complete"
              ? "current"
              : s.status === "failed"
                ? "error"
                : s.status === "cancelled"
                  ? "off"
                  : "pending"
          }
          label={
            {
              running: "In progress",
              retry: "Waiting to retry",
              complete: "Complete",
              failed: "Failed",
              cancelled: "Cancelled",
            }[s.status]
          }
        />
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-[12px] sm:grid-cols-4">
        {(
          [
            ["Fetched", s.fetched],
            ["Revisions", s.revised],
            ["Pages", s.pages],
            ["Pending pages", s.pendingPages],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="rounded-md border bg-muted/30 px-2.5 py-1.5">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="font-mono text-[14px] font-semibold">{n(v)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[11.5px] text-muted-foreground">
        Started {fmt(s.startedAt)}
        {s.finishedAt && ` · Finished ${fmt(s.finishedAt)}`}
        {s.retryAt && ` · Retry after ${fmt(s.retryAt)}`}
      </p>
      {open && (
        <p className="mt-2 text-[12px]" role="status">
          {s.automatic
            ? "Automatic processing is enabled. You can close this tab; progress is saved after each page."
            : "Automatic processing is paused. Saved progress is retained."}
          {s.lastAutomaticAt && ` Last automatic page attempt ${fmt(s.lastAutomaticAt)}.`}
        </p>
      )}
      {s.error && (
        <div className="mt-2">
          <Note tone="warn">{s.error}</Note>
        </div>
      )}
      {open && (
        <>
          <p className="mt-2 text-[11.5px] text-muted-foreground">
            Committed pages stay staged until completion. A complete sync refreshes applicable
            published ministry metrics; partial syncs do not.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className={btnPrimary}
              disabled={busy}
              onClick={() => automation.mutate({ id: s.id, data: { enabled: !s.automatic } })}
              data-testid={`button-automatic-${s.id}`}
            >
              {automation.isPending
                ? "Saving"
                : s.automatic
                  ? "Pause automatic processing"
                  : "Run to completion"}
            </button>
            <button
              type="button"
              className={btnPrimary}
              disabled={busy || !!retryWait || s.automatic}
              onClick={() => advance.mutate({ id: s.id })}
              data-testid={`button-advance-${s.id}`}
            >
              {advance.isPending ? "Processing" : "Process next page"}
            </button>
            <button
              type="button"
              className={btn}
              disabled={busy}
              onClick={() => cancel.mutate({ id: s.id })}
              data-testid={`button-cancel-sync-${s.id}`}
            >
              {cancel.isPending ? "Cancelling" : "Cancel sync"}
            </button>
          </div>
        </>
      )}
      <div className="mt-2 space-y-1">
        <FormError error={advance.error} />
        <FormError error={cancel.error} />
        <FormError error={automation.error} />
      </div>
    </li>
  );
}

function Syncs({ ws }: { ws: PlanningCenterWorkspace }) {
  const { csrfToken } = useAuth();
  const invalidate = useInvalidate();
  const start = useStartPlanningCenterSync({
    ...csrfRequest(csrfToken),
    mutation: { onSettled: () => void invalidate() },
  });
  const connected = ws.connection?.state === "connected";
  const backfilled = (p: string) =>
    ws.syncs.some((s) => s.product === p && s.mode === "backfill" && s.status === "complete");
  const openFor = (p: string) =>
    ws.syncs.some((s) => s.product === p && (s.status === "running" || s.status === "retry"));
  const granted = (p: string) => !!ws.connection?.scopes.includes(SCOPE_FOR[p] ?? p);
  const [since, setSince] = useState<Record<string, string>>({
    check_ins: "2026-11-06",
  });
  const [until, setUntil] = useState<Record<string, string>>({
    check_ins: "2026-11-08",
  });
  const [askBackfill, setAskBackfill] = useState<string | null>(null);
  const go = (product: PlanningCenterSyncInputProduct, mode: PlanningCenterSyncInputMode) =>
    start.mutate(
      {
        data:
          mode === "current"
            ? {
                product,
                mode,
                since: since[product],
                ...(product === "check_ins" ? { until: until[product] } : {}),
              }
            : { product, mode },
      },
      { onSuccess: () => setAskBackfill(null) },
    );
  const currentWindowValid = (product: PlanningCenterSyncInputProduct) => {
    const startDate = since[product] ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return false;
    if (product !== "check_ins") return true;
    const endDate = until[product] ?? "";
    const startTime = Date.parse(`${startDate}T00:00:00Z`);
    const endTime = Date.parse(`${endDate}T00:00:00Z`);
    return (
      /^\d{4}-\d{2}-\d{2}$/.test(endDate) &&
      Number.isFinite(startTime) &&
      Number.isFinite(endTime) &&
      new Date(startTime).toISOString().slice(0, 10) === startDate &&
      new Date(endTime).toISOString().slice(0, 10) === endDate &&
      endTime >= startTime &&
      endTime - startTime < 31 * 24 * 60 * 60 * 1000
    );
  };

  return (
    <Panel className="p-5 sm:p-6">
      <SectionHeading
        icon={RefreshCcw}
        title="Syncs"
        detail="Run to completion or process one page at a time."
      />
      <div className="space-y-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
        <p>
          Run to completion continues a sync on the server, even after you close this tab. You can
          pause and resume without losing saved pages. Processing resumes when the API is running;
          closing the tab does not keep a sleeping workspace awake.
        </p>
        <p>
          <strong className="text-foreground">Backfill</strong> reads all history the connection can
          access. That is not guaranteed to be the source's full lifetime.
        </p>
        <p>
          <strong className="text-foreground">Incremental</strong> rescans accessible records and
          stores only changed revisions. Absence is flagged only after a complete scan, never as
          deletion. Requires a completed backfill for that product.
        </p>
        <p>
          <strong className="text-foreground">Current</strong> reads records from the chosen date
          onward, without a historical backfill. Check-Ins can also use an inclusive end date for a
          short, bounded refresh.
        </p>
      </div>
      <p className="mt-3 text-[12.5px]">
        Source records stored:{" "}
        <span className="font-mono font-semibold" data-testid="text-source-records">
          {n(ws.sourceRecords)}
        </span>
      </p>
      {!connected && (
        <div className="mt-3">
          <Note>Syncs require a confirmed, connected organization.</Note>
        </div>
      )}
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {PRODUCTS.map(([p, label]) => (
          <div key={p} className="rounded-md border bg-muted/20 p-3">
            <p className="text-[13px] font-medium">{label}</p>
            {connected && !granted(p) && (
              <p className="mt-1 text-[11px] text-muted-foreground" data-testid={`text-scope-missing-${p}`}>
                Not granted: needs the {SCOPE_FOR[p]} permission.
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                className={btn}
                disabled={!connected || !granted(p) || start.isPending || openFor(p)}
                onClick={() => setAskBackfill(p)}
                data-testid={`button-backfill-${p}`}
              >
                Backfill
              </button>
              <button
                type="button"
                className={btn}
                disabled={!connected || !granted(p) || start.isPending || openFor(p) || !backfilled(p)}
                onClick={() => go(p, "incremental")}
                data-testid={`button-incremental-${p}`}
              >
                Incremental
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-end gap-1.5">
              <label className="grid gap-0.5 text-[11px] text-muted-foreground">
                {p === "check_ins" ? "Check-Ins from" : "Current since"}
                <input
                  type="date"
                  value={since[p] ?? ""}
                  onChange={(e) => setSince((x) => ({ ...x, [p]: e.target.value }))}
                  className="h-8 rounded-md border border-input bg-background px-2 text-[12px] text-foreground"
                  data-testid={`input-since-${p}`}
                />
              </label>
              {p === "check_ins" && (
                <label className="grid gap-0.5 text-[11px] text-muted-foreground">
                  Through (inclusive)
                  <input
                    type="date"
                    value={until[p] ?? ""}
                    onChange={(e) => setUntil((x) => ({ ...x, [p]: e.target.value }))}
                    className="h-8 rounded-md border border-input bg-background px-2 text-[12px] text-foreground"
                    data-testid="input-until-check_ins"
                  />
                </label>
              )}
              <button
                type="button"
                className={btn}
                disabled={
                  !connected || !granted(p) || start.isPending || openFor(p) ||
                  !currentWindowValid(p)
                }
                onClick={() => go(p, "current")}
                data-testid={`button-current-${p}`}
              >
                {p === "check_ins" ? "Start bounded sync" : "Current"}
              </button>
            </div>
            {p === "check_ins" && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Inclusive dates, up to 31 days. A completed sync can refresh published Check-In
                metrics.
              </p>
            )}
            {askBackfill === p && (
              <div className="mt-2 space-y-1.5 rounded-md border border-amber-300 bg-amber-50 p-2 text-[11.5px] text-amber-950">
                <p>Full backfill reads all accessible history for {label}. This can take a long time.</p>
                <div className="flex gap-1.5">
                  <button type="button" className={btnPrimary} disabled={start.isPending} onClick={() => go(p, "backfill")} data-testid={`button-confirm-backfill-${p}`}>
                    {start.isPending ? "Starting" : "Start full backfill"}
                  </button>
                  <button type="button" className={btn} onClick={() => setAskBackfill(null)} data-testid={`button-cancel-backfill-${p}`}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {openFor(p) && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">A sync is open below.</p>
            )}
          </div>
        ))}
      </div>
      <div className="mt-2">
        <FormError error={start.error} />
      </div>
      {ws.syncs.length === 0 ? (
        <EmptyRecord>No syncs have been started.</EmptyRecord>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {ws.syncs.map((s) => (
            <SyncRow key={s.id} s={s} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function PlanningCenterAdmin() {
  const q = useGetPlanningCenter({
    query: {
      enabled: true,
      staleTime: 10000,
      refetchInterval: 15000,
      queryKey: getGetPlanningCenterQueryKey(),
    },
  });
  const ws = q.data;
  return (
    <section className="space-y-5" data-testid="section-planning-center">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-[17px] font-semibold">Planning Center</h2>
          <p className="text-[12px] text-muted-foreground">
            {ws ? `As of ${fmt(ws.asOf)}` : "Loading status"}
          </p>
        </div>
        <RefreshButton busy={q.isFetching} onClick={() => void q.refetch()} />
      </div>
      {q.isError && !ws ? (
        <QueryError
          title="Planning Center status unavailable"
          error={q.error}
          onRetry={() => void q.refetch()}
        />
      ) : !ws ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <>
          {q.isRefetchError && <Note tone="warn">Refresh failed. Showing last loaded status.</Note>}
          <Setup ws={ws} />
          <Connection
            key={`${ws.connection?.accountRef ?? "none"}:${ws.connection?.state ?? "none"}`}
            ws={ws}
          />
          <RefreshSchedule ws={ws} />
          <Syncs ws={ws} />
          <SourceLifecycle ws={ws} />
        </>
      )}
    </section>
  );
}

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

const PRODUCTS: [PlanningCenterSyncInputProduct, string][] = [
  ["people", "People"],
  ["services", "Services"],
  ["check_ins", "Check-Ins"],
];
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
              authorize.mutate(undefined, { onSuccess: (r) => window.location.assign(r.url) })
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
          {s.mode === "backfill" ? "Backfill" : "Incremental"}
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
            Committed pages are staging only. No metrics are published from a partial sync.
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
  const go = (product: PlanningCenterSyncInputProduct, mode: PlanningCenterSyncInputMode) =>
    start.mutate({ data: { product, mode } });

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
          closing the tab does not keep a sleeping workspace awake. No recurring sync schedule is
          enabled.
        </p>
        <p>
          <strong className="text-foreground">Backfill</strong> reads all history the connection can
          access. That is not guaranteed to be the source's full lifetime.
        </p>
        <p>
          <strong className="text-foreground">Incremental</strong> rescans accessible records and
          stores only changed revisions. Deleted or missing records are not inferred. Requires a
          completed backfill for that product.
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
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {PRODUCTS.map(([p, label]) => (
          <div key={p} className="rounded-md border bg-muted/20 p-3">
            <p className="text-[13px] font-medium">{label}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                className={btn}
                disabled={!connected || start.isPending || openFor(p)}
                onClick={() => go(p, "backfill")}
                data-testid={`button-backfill-${p}`}
              >
                Backfill
              </button>
              <button
                type="button"
                className={btn}
                disabled={!connected || start.isPending || openFor(p) || !backfilled(p)}
                onClick={() => go(p, "incremental")}
                data-testid={`button-incremental-${p}`}
              >
                Incremental
              </button>
            </div>
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
          <Syncs ws={ws} />
        </>
      )}
    </section>
  );
}

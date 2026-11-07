import { useState } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import {
  getGetImportQueryKey,
  getListImportsQueryKey,
  useChangeImportState,
  useGetImport,
  useListImports,
  type ImportDetail,
} from "@workspace/api-client-react";
import {
  PageHeader,
  Panel,
  QueryError,
  RefreshButton,
  StatusPill,
  usePageTitle,
} from "@/components/kit";
import { FormError, RestrictedState } from "@/components/admin-controls";
import { Skeleton } from "@/components/ui/skeleton";
import { ImportBatches } from "@/components/import-batches";
import { ImportUploads } from "@/components/import-uploads";
import { ImportInspect } from "@/components/import-inspect";
import { ImportMappings } from "@/components/import-mappings";
import { ImportReportPanel } from "@/components/import-report";
import {
  btn,
  csrfRequest,
  DownloadLink,
  IMPORT_QUERY,
  importHref,
  inputCls,
  Note,
  useInvalidateImports,
} from "@/components/import-common";

const header = (
  <PageHeader
    eyebrow="Administration"
    title="Workbook imports"
    description="Inspect legacy spreadsheet evidence. Imported values are not authoritative."
  />
);

function BatchState({ detail }: { detail: ImportDetail }) {
  const { csrfToken } = useAuth();
  const invalidate = useInvalidateImports();
  const change = useChangeImportState(csrfRequest(csrfToken));
  const [note, setNote] = useState("");
  const b = detail.batch;
  const withdrawn = b.state === "withdrawn";
  return (
    <Panel className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-[16px] font-semibold">{b.filename}</h2>
          <p className="font-mono text-[11px] text-muted-foreground break-all">
            Snapshot {b.snapshotDate} · Date system {detail.dateSystem} · SHA-256 {b.sha256}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill
            status={withdrawn ? "off" : "current"}
            label={withdrawn ? "Withdrawn" : "Active"}
          />
          <DownloadLink
            href={importHref(b.id, "original")}
            label="Original"
            disabled={withdrawn}
            testId="link-download-original"
          />
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="block text-[12px] font-medium">
          {withdrawn ? "Restore note" : "Withdrawal note"}
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            className={`${inputCls} mt-1`}
            data-testid="input-state-note"
          />
        </label>
        <button
          type="button"
          className={btn}
          disabled={note.trim().length < 5 || change.isPending}
          onClick={() =>
            change.mutate(
              { id: b.id, data: { state: withdrawn ? "active" : "withdrawn", note: note.trim() } },
              {
                onSuccess: () => {
                  setNote("");
                  void invalidate(b.id);
                },
              },
            )
          }
          data-testid="button-change-state"
        >
          {change.isPending ? "Saving" : withdrawn ? "Restore batch" : "Withdraw batch"}
        </button>
      </div>
      <div className="mt-2">
        <FormError error={change.error} />
      </div>
    </Panel>
  );
}

function BatchWorkspace({ id }: { id: string }) {
  const q = useGetImport(id, { query: { ...IMPORT_QUERY, queryKey: getGetImportQueryKey(id) } });
  if (q.isError && !q.data)
    return (
      <QueryError title="Import unavailable" error={q.error} onRetry={() => void q.refetch()} />
    );
  if (!q.data)
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  const detail = q.data;
  const disabled = detail.batch.state === "withdrawn";
  return (
    <div className="space-y-5">
      {q.isRefetchError && <Note tone="warn">Refresh failed. Showing last loaded batch.</Note>}
      <BatchState detail={detail} />
      <ImportInspect key={`cells-${id}`} detail={detail} disabled={disabled} />
      <ImportMappings detail={detail} disabled={disabled} />
      <ImportReportPanel batchId={id} disabled={disabled} />
    </div>
  );
}

export default function Imports() {
  usePageTitle("Workbook imports");
  const { user, enabled, isLoading } = useAuth();
  const isAdmin = user?.role === "admin";
  const q = useListImports({
    query: { ...IMPORT_QUERY, enabled: isAdmin, queryKey: getListImportsQueryKey() },
  });
  const [selected, setSelected] = useState("");

  if (isLoading)
    return (
      <>
        {header}
        <Skeleton className="h-48 w-full" />
      </>
    );
  if (!enabled)
    return (
      <>
        {header}
        <RestrictedState
          title="Authentication is not enabled"
          detail="Imports are unavailable until invite-only sign-in is enabled."
        />
      </>
    );
  if (!user)
    return (
      <>
        {header}
        <RestrictedState
          title="Log in to continue"
          detail="This workspace is limited to verified Northpoint Austin staff."
        />
      </>
    );
  if (!isAdmin)
    return (
      <>
        {header}
        <RestrictedState
          title="Administrator access required"
          detail={`Signed in as ${user.email} · ${user.role}.`}
        />
      </>
    );

  const list = q.data;
  const activeId = selected || "";
  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Workbook imports"
        description="Inspect legacy spreadsheet evidence. Imported values are not authoritative and are never published from here."
        actions={<RefreshButton busy={q.isFetching} onClick={() => void q.refetch()} />}
      />
      {q.isError && !list ? (
        <QueryError title="Imports unavailable" error={q.error} onRetry={() => void q.refetch()} />
      ) : !list ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <div className="space-y-5">
          {q.isRefetchError && (
            <Note tone="warn">Refresh failed. Showing last loaded batches.</Note>
          )}
          <ImportBatches list={list} selectedId={activeId} onSelect={setSelected} />
          <ImportUploads />
          {activeId ? (
            <BatchWorkspace key={activeId} id={activeId} />
          ) : (
            list.batches.length > 0 && (
              <Note>Select a batch to inspect sheets, mappings, and reconciliation.</Note>
            )
          )}
        </div>
      )}
    </>
  );
}

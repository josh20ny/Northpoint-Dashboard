import { useState } from "react";
import { useListImportUploads } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { IMPORT_QUERY, Note } from "@/components/import-common";
import { QueryError } from "@/components/kit";

export function ImportUploads() {
  const [page, setPage] = useState(1);
  const q = useListImportUploads({ page }, { query: { ...IMPORT_QUERY } });
  return (
    <section
      className="rounded-lg border bg-card p-5 space-y-4"
      aria-labelledby="upload-history-title"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="upload-history-title" className="font-semibold">
          Original-file upload history
        </h2>
        <Button
          variant="outline"
          size="sm"
          disabled={q.isFetching}
          onClick={() => void q.refetch()}
        >
          Refresh uploads
        </Button>
      </div>
      <Note>
        Unlinked files appear first. Pending means an upload may still be running or was
        interrupted. Unknown storage means a file may exist; it is not safe to assume it is absent.
        Nothing is deleted here. Retention or deletion requires an owner-approved policy.
      </Note>
      {q.isError && !q.data ? (
        <QueryError
          title="Upload history unavailable"
          error={q.error}
          onRetry={() => void q.refetch()}
        />
      ) : !q.data ? (
        <p role="status">Loading upload attempts…</p>
      ) : (
        <>
          {q.isRefetchError && (
            <Note tone="warn">Refresh failed. Showing last loaded upload attempts.</Note>
          )}
          {q.data.attempts.length === 0 ? (
            <p>No upload attempts recorded.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2">Original / attempt</th>
                    <th className="p-2">Outcome</th>
                    <th className="p-2">Storage / catalog link</th>
                    <th className="p-2">Recorded</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.attempts.map((a) => (
                    <tr key={a.id} className="border-b align-top">
                      <td className="p-2 max-w-sm break-all">
                        <div className="font-medium">{a.filename}</div>
                        <div>Snapshot: {a.snapshotDate}</div>
                        <div className="text-xs">Attempt: {a.id}</div>
                        <details className="mt-1">
                          <summary className="cursor-pointer">File reference</summary>
                          <div>Private reference: {a.objectPath}</div>
                          <div>SHA-256: {a.sha256}</div>
                        </details>
                      </td>
                      <td className="p-2">
                        {a.status}
                        {a.failurePhase && (
                          <div>Failed at: {a.failurePhase.replaceAll("_", " ")}</div>
                        )}
                      </td>
                      <td className="p-2 break-all">
                        {a.storageState}
                        <div>
                          {a.linkedBatchId ? `Linked batch: ${a.linkedBatchId}` : "Unlinked"}
                        </div>
                        {a.status === "failed" && a.linkedBatchId && (
                          <div>Linked by a later retry; failed attempt retained.</div>
                        )}
                      </td>
                      <td className="p-2 whitespace-nowrap">
                        {new Date(a.createdAt).toLocaleString()}
                        <div className="text-xs">
                          Updated: {new Date(a.updatedAt).toLocaleString()}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1 || q.isFetching}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <span>Page {page}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={!q.data.hasMore || q.isFetching}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

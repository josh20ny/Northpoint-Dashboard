import { useState } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import {
  getGetImportRowsQueryKey,
  useGetImportRows,
  useReviewImportMapping,
  useStageImportMapping,
  type ImportDetail,
  type ImportMapping,
} from "@workspace/api-client-react";
import { GitBranch } from "lucide-react";
import { Panel, QueryError, StatusPill } from "@/components/kit";
import { EmptyRecord, FormError, SectionHeading } from "@/components/admin-controls";
import { Skeleton } from "@/components/ui/skeleton";
import { ImportMappingForm } from "@/components/import-mapping-form";
import {
  btn,
  btnPrimary,
  csrfRequest,
  Flags,
  IMPORT_QUERY,
  inputCls,
  Note,
  Nullable,
  Pager,
  useInvalidateImports,
} from "@/components/import-common";

const statusTone: Record<string, string> = {
  draft: "pending",
  approved: "current",
  rejected: "error",
  superseded: "off",
};

function RowsPreview({
  batchId,
  mappingId,
  period,
}: {
  batchId: string;
  mappingId: string;
  period: "week" | "month";
}) {
  const [page, setPage] = useState(1);
  const params = { page };
  const q = useGetImportRows(batchId, mappingId, params, {
    query: { ...IMPORT_QUERY, queryKey: getGetImportRowsQueryKey(batchId, mappingId, params) },
  });
  if (q.isError && !q.data)
    return (
      <QueryError
        title="Staged rows unavailable"
        error={q.error}
        onRetry={() => void q.refetch()}
      />
    );
  if (!q.data) return <Skeleton className="h-32 w-full" />;
  if (q.data.rows.length === 0) return <EmptyRecord>No staged rows on this page.</EmptyRecord>;
  return (
    <div className="mt-3">
      {q.isRefetchError && <Note tone="warn">Refresh failed. Showing last loaded rows.</Note>}
      <div className="max-h-[380px] overflow-auto rounded-md border">
        <table className="w-full min-w-[820px] text-[11.5px]">
          <caption className="sr-only">Staged rows</caption>
          <thead className="sticky top-0 bg-muted text-left">
            <tr>
              {[
                "Row",
                "Value cell",
                "Date cell",
                "Original date",
                period === "month" ? "Month start" : "Sunday",
                "Value",
                "Formula",
                "Cached",
                "Calculation",
                "Flags",
              ].map((h) => (
                <th key={h} scope="col" className="px-2 py-1.5 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y font-mono">
            {q.data.rows.map((r) => (
              <tr key={`${r.sheet}-${r.coordinate}`}>
                <td className="px-2 py-1">{r.sourceRow}</td>
                <td className="px-2 py-1">
                  {r.sheet}!{r.coordinate}
                </td>
                <td className="px-2 py-1">{r.dateCoordinate}</td>
                <td className="px-2 py-1">
                  <Nullable value={r.originalDate} />
                </td>
                <td className="px-2 py-1">
                  <Nullable value={r.periodDate ?? r.sundayDate} />
                </td>
                <td className="px-2 py-1">
                  <Nullable value={r.value} />
                </td>
                <td className="max-w-[160px] truncate px-2 py-1" title={r.formula ?? ""}>
                  {r.formula ?? ""}
                </td>
                <td className="px-2 py-1">{r.cachedValue ?? ""}</td>
                <td className="px-2 py-1">{r.calculationStatus}</td>
                <td className="px-2 py-1">
                  <Flags flags={r.flags} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager
        page={q.data.page}
        hasMore={q.data.hasMore}
        busy={q.isFetching}
        onPage={setPage}
        label="Rows"
      />
    </div>
  );
}

function MappingCard({
  batchId,
  m,
  disabled,
}: {
  batchId: string;
  m: ImportMapping;
  disabled: boolean;
}) {
  const { csrfToken } = useAuth();
  const invalidate = useInvalidateImports();
  const review = useReviewImportMapping(csrfRequest(csrfToken));
  const stage = useStageImportMapping(csrfRequest(csrfToken));
  const [note, setNote] = useState("");
  const [showRows, setShowRows] = useState(false);
  const d = m.definition;
  const decide = (decision: "approved" | "rejected") =>
    review.mutate(
      { id: batchId, mappingId: m.id, data: { decision, note: note.trim() } },
      {
        onSuccess: () => {
          setNote("");
          void invalidate(batchId);
        },
      },
    );

  return (
    <li className="rounded-lg border bg-card p-4" data-testid={`card-mapping-${m.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-mono text-[13px] font-semibold">{d.target}</p>
          <p className="text-[12px] text-muted-foreground">
            {d.legacyLabel} · {d.ministry} · {d.unit} · {d.period ?? "week"}
          </p>
        </div>
        <StatusPill
          status={statusTone[m.status]}
          label={m.status.charAt(0).toUpperCase() + m.status.slice(1)}
        />
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11.5px] sm:grid-cols-4">
        <div>
          <dt className="inline text-muted-foreground">Range </dt>
          <dd className="inline">
            {d.sheet}!{d.valueColumn}
            {d.startRow}:{d.valueColumn}
            {d.endRow}
          </dd>
        </div>
        <div>
          <dt className="inline text-muted-foreground">Dates </dt>
          <dd className="inline">{d.dateColumn}</dd>
        </div>
        {d.sourceYear && (
          <div>
            <dt className="inline text-muted-foreground">Month year </dt>
            <dd className="inline">{d.sourceYear}</dd>
          </div>
        )}
        <div>
          <dt className="inline text-muted-foreground">Priority </dt>
          <dd className="inline">{d.priority}</dd>
        </div>
        <div>
          <dt className="inline text-muted-foreground">Confidence </dt>
          <dd className="inline">{d.confidence}</dd>
        </div>
        <div>
          <dt className="inline text-muted-foreground">Staged </dt>
          <dd className="inline">{m.stagedCount}</dd>
        </div>
        {d.supersedes && (
          <div className="col-span-2">
            <dt className="inline text-muted-foreground">Supersedes </dt>
            <dd className="inline">{d.supersedes.slice(0, 10)}</dd>
          </div>
        )}
      </dl>
      <p className="mt-2 text-[12px]">{d.semantics}</p>
      {m.reviewNote && (
        <p className="mt-1 text-[12px] text-muted-foreground">Review: {m.reviewNote}</p>
      )}

      {m.status === "draft" && (
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <label className="block text-[12px] font-medium">
            Review note
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              minLength={5}
              maxLength={1000}
              disabled={disabled}
              className={`${inputCls} mt-1`}
              data-testid={`input-review-note-${m.id}`}
            />
          </label>
          <button
            type="button"
            className={btnPrimary}
            disabled={disabled || note.trim().length < 5 || review.isPending}
            onClick={() => decide("approved")}
            data-testid={`button-approve-mapping-${m.id}`}
          >
            Approve
          </button>
          <button
            type="button"
            className={btn}
            disabled={disabled || note.trim().length < 5 || review.isPending}
            onClick={() => decide("rejected")}
            data-testid={`button-reject-mapping-${m.id}`}
          >
            Reject
          </button>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {m.status === "approved" && (
          <button
            type="button"
            className={btnPrimary}
            disabled={disabled || stage.isPending}
            onClick={() =>
              stage.mutate(
                { id: batchId, mappingId: m.id },
                { onSuccess: () => void invalidate(batchId) },
              )
            }
            data-testid={`button-stage-mapping-${m.id}`}
          >
            {stage.isPending ? "Staging" : m.stagedCount > 0 ? "Restage" : "Stage rows"}
          </button>
        )}
        {m.stagedCount > 0 && (
          <button
            type="button"
            className={btn}
            disabled={disabled}
            aria-expanded={showRows}
            onClick={() => setShowRows((v) => !v)}
            data-testid={`button-toggle-rows-${m.id}`}
          >
            {showRows ? "Hide rows" : "Preview rows"}
          </button>
        )}
      </div>
      <div className="mt-2 space-y-2">
        <FormError error={review.error} />
        <FormError error={stage.error} />
      </div>
      {showRows && !disabled && (
        <RowsPreview
          batchId={batchId}
          mappingId={m.id}
          period={d.period ?? "week"}
        />
      )}
    </li>
  );
}

export function ImportMappings({ detail, disabled }: { detail: ImportDetail; disabled: boolean }) {
  return (
    <Panel className="p-5 sm:p-6">
      <SectionHeading
        icon={GitBranch}
        title="Mappings"
        detail="Draft, review with a note, then stage as a separate step."
      />
      {disabled ? (
        <Note tone="warn">Batch is withdrawn. Mapping, review, and staging are disabled.</Note>
      ) : (
        <ImportMappingForm detail={detail} />
      )}
      {detail.mappings.length === 0 ? (
        <EmptyRecord>No mappings yet.</EmptyRecord>
      ) : (
        <ul className="mt-4 space-y-3">
          {detail.mappings.map((m) => (
            <MappingCard key={m.id} batchId={detail.batch.id} m={m} disabled={disabled} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

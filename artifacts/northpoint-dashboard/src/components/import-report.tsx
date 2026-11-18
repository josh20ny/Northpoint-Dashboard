import { useState } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import {
  getGetImportReportQueryKey,
  useApproveImportWeek,
  useGetImportReport,
  type ImportWeek,
  type ImportReviewMethod,
} from "@workspace/api-client-react";
import { Scale } from "lucide-react";
import { Panel, QueryError, StatusPill } from "@/components/kit";
import { EmptyRecord, FormError, SectionHeading } from "@/components/admin-controls";
import { Skeleton } from "@/components/ui/skeleton";
import {
  btnPrimary,
  csrfRequest,
  DownloadLink,
  Flags,
  IMPORT_QUERY,
  importHref,
  inputCls,
  Note,
  Nullable,
  useInvalidateImports,
} from "@/components/import-common";

const EXPORTS = [
  ["mappings", "Mappings CSV"],
  ["errors", "Errors CSV"],
  ["conflicts", "Conflicts CSV"],
  ["weekly", "Periods CSV"],
  ["report", "Report HTML"],
] as const;

function WeekRow({ batchId, w, disabled }: { batchId: string; w: ImportWeek; disabled: boolean }) {
  const { csrfToken } = useAuth();
  const invalidate = useInvalidateImports();
  const approve = useApproveImportWeek(csrfRequest(csrfToken));
  const [note, setNote] = useState("");
  const [method, setMethod] = useState<ImportReviewMethod>("two_source");
  const [confirmed, setConfirmed] = useState(false);
  const ownerReview = method === "owner_confirmed";
  const ownerEligible =
    ["adult_service_1", "adult_service_2"].includes(w.target) && w.unit === "attendance_count";
  const key = `${w.week}-${w.target}-${w.ministry}`;
  return (
    <li className="rounded-lg border bg-card p-3.5" data-testid={`card-week-${key}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px]">
          <span className="font-mono font-semibold">
            {w.period === "month" ? w.week.slice(0, 7) : w.week}
          </span>{" "}
          ·{" "}
          <span className="font-mono">{w.target}</span> · {w.ministry} · {w.unit}
        </p>
        <StatusPill
          status={w.approved ? "current" : "pending"}
          label={
            w.approved
              ? w.approval?.method === "owner_confirmed"
                ? "Owner confirmed"
                : "Two-source review approved"
              : "Unreviewed"
          }
        />
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[480px] text-[11.5px]">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-1 pr-2 font-medium">Cell</th>
              <th className="py-1 pr-2 font-medium">Mapping</th>
              <th className="py-1 pr-2 font-medium">Value</th>
              <th className="py-1 font-medium">Flags</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {w.evidence.map((e) => (
              <tr key={`${e.mappingId}-${e.coordinate}`} className="border-t">
                <td className="py-1 pr-2">
                  {e.sheet}!{e.coordinate}
                </td>
                <td className="py-1 pr-2">{e.mappingId.slice(0, 10)}</td>
                <td className="py-1 pr-2">
                  <Nullable value={e.value} />
                </td>
                <td className="py-1">
                  <Flags flags={e.flags} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-2 text-[11.5px]">
        <span className="text-muted-foreground">Variance</span>{" "}
        <span className="font-mono">
          <Nullable value={w.variance} />
        </span>
        <span className="text-muted-foreground">Flags</span> <Flags flags={w.flags} />
      </p>
      <p
        className="mt-1 truncate font-mono text-[10.5px] text-muted-foreground"
        title={w.evidenceHash}
      >
        Evidence {w.evidenceHash}
      </p>
      {!w.approved && (
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="block text-[12px] font-medium sm:col-span-2">
            Review method
            <select
              value={method}
              onChange={(e) => {
                setMethod(e.target.value as ImportReviewMethod);
                setConfirmed(false);
              }}
              disabled={disabled || approve.isPending}
              className={`${inputCls} mt-1`}
              data-testid={`select-review-method-${key}`}
            >
              <option value="two_source">Two-source comparison</option>
              {ownerEligible && <option value="owner_confirmed">Owner-confirmed review</option>}
            </select>
          </label>
          {ownerReview && (
            <div className="space-y-2 sm:col-span-2">
              <Note>
                Owner confirmation is not independent two-source verification. Missing, conflicting,
                future or invalid evidence still blocks approval.
              </Note>
              <label className="flex items-start gap-2 text-[12px]">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  disabled={disabled || approve.isPending}
                  data-testid={`checkbox-owner-confirmed-${key}`}
                />
                I confirm the owner verified the exact attendance values shown above.
              </label>
            </div>
          )}
          <label className="block text-[12px] font-medium">
            {ownerReview
              ? "Owner verification basis (20 characters minimum)"
              : "Approval note (10 characters minimum)"}
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
              disabled={disabled || approve.isPending}
              className={`${inputCls} mt-1`}
              data-testid={`input-week-note-${key}`}
            />
          </label>
          <button
            type="button"
            className={btnPrimary}
            disabled={
              disabled ||
              note.trim().length < (ownerReview ? 20 : 10) ||
              (ownerReview && !confirmed) ||
              approve.isPending
            }
            onClick={() =>
              approve.mutate(
                {
                  id: batchId,
                  data: {
                    week: w.week,
                    evidenceHash: w.evidenceHash,
                    note: note.trim(),
                    method,
                    ownerConfirmed: ownerReview && confirmed,
                  },
                },
                {
                  onSuccess: () => {
                    setNote("");
                    void invalidate(batchId);
                  },
                },
              )
            }
            data-testid={`button-approve-week-${key}`}
          >
            {approve.isPending
              ? "Saving"
              : ownerReview
                ? "Record owner confirmation"
                : "Approve this evidence"}
          </button>
        </div>
      )}
      {w.approval && (
        <div className="mt-3 space-y-1 rounded-md border bg-muted/25 p-3 text-[12px]">
          <p className="font-medium">
            {w.approval.method === "owner_confirmed"
              ? "Owner-confirmed review — not independent two-source verification"
              : "Two-source comparison review"}
          </p>
          <p className="whitespace-pre-wrap">{w.approval.note}</p>
          <p className="break-all text-muted-foreground">
            Reviewed by {w.approval.reviewedBy} · {new Date(w.approval.reviewedAt).toLocaleString()}
          </p>
        </div>
      )}
      <div className="mt-2">
        <FormError error={approve.error} />
      </div>
    </li>
  );
}

export function ImportReportPanel({ batchId, disabled }: { batchId: string; disabled: boolean }) {
  const q = useGetImportReport(batchId, {
    query: { ...IMPORT_QUERY, enabled: !disabled, queryKey: getGetImportReportQueryKey(batchId) },
  });
  const r = q.data;
  return (
    <Panel className="p-5 sm:p-6">
      <SectionHeading
        icon={Scale}
        title="Reconciliation"
        detail="Compare staged evidence by weekly or monthly reporting period."
      />
      <div className="mb-3 flex flex-wrap gap-2">
        {EXPORTS.map(([kind, label]) => (
          <DownloadLink
            key={kind}
            href={importHref(batchId, `exports/${kind}`)}
            label={label}
            disabled={disabled}
            testId={`link-export-${kind}`}
          />
        ))}
      </div>
      <Note>
        Approval records that you reviewed this exact evidence hash. It does not publish metrics. If
        evidence changes, the week needs a new review. Approved-week counts include explicitly
        owner-confirmed reviews; these are not independent two-source verification.
      </Note>
      {disabled ? (
        <div className="mt-3">
          <Note tone="warn">Batch is withdrawn. Report and approvals are disabled.</Note>
        </div>
      ) : q.isError && !r ? (
        <div className="mt-3">
          <QueryError title="Report unavailable" error={q.error} onRetry={() => void q.refetch()} />
        </div>
      ) : !r ? (
        <Skeleton className="mt-3 h-40 w-full" />
      ) : (
        <>
          {q.isRefetchError && (
            <div className="mt-3">
              <Note tone="warn">Refresh failed. Showing last loaded report.</Note>
            </div>
          )}
          <dl className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
            {[
              ["Staged rows", r.stagedRows],
              ["Flagged rows", r.flaggedRows],
              ["Approved periods", r.approvedWeeks],
            ].map(([k, v]) => (
              <div key={k} className="rounded-md border bg-muted/30 px-2.5 py-1.5">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="font-mono text-[15px] font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          {r.weeks.length === 0 ? (
            <EmptyRecord>No staged weeks yet. Stage an approved mapping first.</EmptyRecord>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {r.weeks.map((w) => (
                <WeekRow
                  key={`${w.week}-${w.target}-${w.ministry}-${w.evidenceHash}`}
                  batchId={batchId}
                  w={w}
                  disabled={disabled}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </Panel>
  );
}

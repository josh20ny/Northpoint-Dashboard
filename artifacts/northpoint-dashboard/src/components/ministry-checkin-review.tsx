import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useResolveCheckIn,
  useGetCheckInReview,
} from "@workspace/api-client-react";
import { ClipboardList } from "lucide-react";
import { Panel, QueryError } from "@/components/kit";
import { SectionHeading } from "@/components/admin-controls";
import { csrfRequest } from "@/lib/attendance";
import { invalidateMinistryData } from "@/lib/ministry-data";
import { CheckInReviewTable } from "@/components/ministry-checkin-review-table";

export { CheckInReviewTable } from "@/components/ministry-checkin-review-table";

export function MinistryCheckInReview({ csrfToken }: { csrfToken: string | null }) {
  const [page, setPage] = useState(1);
  const [saveError, setSaveError] = useState<string | null>(null);
  const qc = useQueryClient();
  const q = useGetCheckInReview(
    { page },
    { query: { staleTime: 30000, refetchOnMount: "always", refetchOnWindowFocus: true } },
  );
  const resolve = useResolveCheckIn(csrfRequest(csrfToken));

  const choose = (checkInId: string, action: "include" | "exclude") => {
    setSaveError(null);
    resolve.mutate(
      { checkInId, data: { action } },
      {
        onSuccess: () => void invalidateMinistryData(qc),
        onError: () => setSaveError("The resolution could not be saved. Refresh and try again."),
      },
    );
  };

  const data = q.data;
  return (
    <Panel className="p-5 sm:p-6" data-testid="section-checkin-review">
      <SectionHeading
        icon={ClipboardList}
        title="Check-In review"
        detail="Review unresolved source records. Decisions are audited and affect publication only; they never change Planning Center."
      />
      <p className="mb-3 text-[12px] text-muted-foreground">
        {data
          ? `${data.unresolved.toLocaleString()} unresolved · ${data.total.toLocaleString()} flagged records`
          : "Loading Check-In review…"}{" "}
        No child names or person IDs are shown.
      </p>
      {saveError && (
        <p role="alert" className="mb-3 rounded-md border border-destructive/30 px-3 py-2 text-[12px] text-destructive">
          {saveError}
        </p>
      )}
      {q.isError && !data ? (
        <QueryError title="Check-In review unavailable" error={q.error} onRetry={() => void q.refetch()} />
      ) : q.isLoading && !data ? (
        <div className="h-16 animate-pulse rounded-md bg-muted/40" />
      ) : !data?.items.length ? (
        <p className="rounded-md border border-dashed px-4 py-6 text-center text-[12px] text-muted-foreground">
          No unresolved Check-In records need review.
        </p>
      ) : (
        <>
          <CheckInReviewTable items={data.items} pending={resolve.isPending} onResolve={choose} />
          <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Include/exclude decisions are recorded in the Admin audit log. Republish Check-Ins to apply them.</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={page <= 1 || resolve.isPending}
                className="h-7 rounded-md border px-2 disabled:opacity-50"
                data-testid="button-checkin-review-previous"
              >
                Previous
              </button>
              <span>{page} / {Math.max(1, Math.ceil(data.total / data.pageSize))}</span>
              <button
                type="button"
                onClick={() => setPage((value) => value + 1)}
                disabled={page * data.pageSize >= data.total || resolve.isPending}
                className="h-7 rounded-md border px-2 disabled:opacity-50"
                data-testid="button-checkin-review-next"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </Panel>
  );
}

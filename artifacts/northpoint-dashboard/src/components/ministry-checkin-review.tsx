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
import {
  formatMetricValue,
  invalidateMinistryData,
  ministryName,
} from "@/lib/ministry-data";
import { CheckInReviewTable } from "@/components/ministry-checkin-review-table";

export { CheckInReviewTable } from "@/components/ministry-checkin-review-table";

export function MinistryCheckInReview({ csrfToken }: { csrfToken: string | null }) {
  const [page, setPage] = useState(1);
  const [reviewDate, setReviewDate] = useState<string | undefined>();
  const [saveError, setSaveError] = useState<string | null>(null);
  const qc = useQueryClient();
  const q = useGetCheckInReview(
    { page, ...(reviewDate ? { date: reviewDate } : {}) },
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
        detail="Review Sunday exceptions. Names and grade suggestions are visible to Admins only; decisions never change Planning Center."
      />
      <p className="mb-3 text-[12px] text-muted-foreground">
        {data
          ? `${data.unresolved.toLocaleString()} unresolved · ${data.total.toLocaleString()} flagged for ${data.selectedDate === "unknown" ? "unknown dates" : data.selectedDate}`
          : "Loading Check-In review…"}{" "}
      </p>
      {data && (
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <label className="grid gap-1 text-[11px] font-medium">
            Sunday
            <select
              value={reviewDate ?? data.selectedDate}
              onChange={(event) => {
                setPage(1);
                setReviewDate(event.currentTarget.value);
              }}
              className="h-9 min-w-56 rounded-md border bg-background px-3 text-[12px]"
              data-testid="select-checkin-review-sunday"
            >
              {data.availableSundays.map((date) => (
                <option key={date} value={date}>
                  {date === "unknown"
                    ? "Unknown service date"
                    : new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
                        weekday: "long",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                  {date === data.selectedDate ? " (selected)" : ""}
                </option>
              ))}
            </select>
          </label>
          <p className="text-[11px] text-muted-foreground" data-testid="text-checkin-review-preview-note">
            Preview totals update as you resolve records. Unresolved records are excluded; publication remains a separate step.
          </p>
        </div>
      )}
      {saveError && (
        <p role="alert" className="mb-3 rounded-md border border-destructive/30 px-3 py-2 text-[12px] text-destructive">
          {saveError}
        </p>
      )}
      {q.isError && !data ? (
        <QueryError title="Check-In review unavailable" error={q.error} onRetry={() => void q.refetch()} />
      ) : q.isLoading && !data ? (
        <div className="h-16 animate-pulse rounded-md bg-muted/40" />
      ) : !data ? null : (
        <>
          {data.attendancePreview.length > 0 && (
            <section className="mb-4 rounded-lg border p-3" aria-label="Check-In attendance preview">
              <h3 className="mb-2 text-[12px] font-semibold">Attendance preview</h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {data.attendancePreview.map((row) => (
                  <div
                    key={`${row.ministry}-${row.scope}`}
                    className="flex items-center justify-between gap-3 rounded-md bg-muted/30 px-3 py-2"
                    data-testid={`checkin-preview-${row.ministry}-${row.scope}`}
                  >
                    <span className="text-[11px]">
                      {ministryName(row.ministry)} · {row.scope.replace("service-", "Service ")}
                    </span>
                    <span className="text-right text-[12px] font-semibold">
                      {formatMetricValue(row.value, "people")}
                      <span className="ml-1 block text-[10px] font-normal text-muted-foreground">
                        {row.quality === "partial" ? "partial subtotal" : row.quality}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
          {data.items.length ? (
            <>
              <CheckInReviewTable items={data.items} pending={resolve.isPending} onResolve={choose} />
              <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Include/exclude decisions are recorded in the Admin audit log.</span>
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
          ) : (
            <p className="rounded-md border border-dashed px-4 py-6 text-center text-[12px] text-muted-foreground">
              No unresolved Check-In records need review for this Sunday.
            </p>
          )}
          {data.selectedDate === "unknown" && (
            <p className="mt-3 text-[11px] text-muted-foreground">
              These records cannot be assigned to an attendance Sunday until their source date is resolved.
            </p>
          )}
        </>
      )}
    </Panel>
  );
}

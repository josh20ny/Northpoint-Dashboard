import type { Query, QueryClient } from "@tanstack/react-query";
import type { AttendanceRevision } from "@workspace/api-client-react";

export const SLOTS = [
  { value: "adult_service_1", label: "Adult service 1" },
  { value: "adult_service_2", label: "Adult service 2" },
] as const;
export type SlotValue = (typeof SLOTS)[number]["value"];

export const slotLabel = (slot: string) => SLOTS.find((s) => s.value === slot)?.label ?? slot;

export const csrfRequest = (csrfToken: string | null) => ({
  request: { headers: { "X-CSRF-Token": csrfToken ?? "" } },
});

const isAttendanceKey = (q: Query) => {
  const k = q.queryKey[0];
  return (
    typeof k === "string" &&
    (k.startsWith("/api/v1/attendance") || k.startsWith("/api/v1/admin/attendance"))
  );
};

export const invalidateAttendance = (qc: QueryClient) =>
  qc.invalidateQueries({ predicate: isAttendanceKey });

/** Refresh every 60s while mounted, plus on mount and focus. */
export const attendancePolling = {
  staleTime: 30000,
  refetchOnMount: "always" as const,
  refetchOnWindowFocus: true,
  refetchIntervalInBackground: false,
  refetchInterval: 60000,
};

/**
 * Current revision for a scope (definition + date + slot): the in-scope revision
 * whose id no other in-scope revision references as previousId. Timestamps are not used.
 */
export function currentRevision(
  revisions: AttendanceRevision[],
  serviceDate: string,
  slot: string,
  definitionId?: string,
) {
  const scope = revisions.filter(
    (r) =>
      r.serviceDate === serviceDate &&
      r.slot === slot &&
      (!definitionId || r.definitionId === definitionId),
  );
  const superseded = new Set(scope.map((r) => r.previousId).filter((id): id is string => !!id));
  return scope.find((r) => !superseded.has(r.id));
}

export const QUALITY_LABEL: Record<string, string> = {
  complete: "Complete",
  partial: "Partial",
  missing: "Missing",
  unrecorded: "Unrecorded",
  invalidated: "Invalidated",
  future: "Future",
};

export const QUALITY_TONE: Record<string, string> = {
  complete: "ok",
  partial: "partial",
  missing: "unavailable",
  unrecorded: "off",
  invalidated: "error",
  future: "future",
};

export const fmtCount = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : n.toLocaleString("en-US");

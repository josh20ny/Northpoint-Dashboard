import type { PlanningCenterWorkspace } from "@workspace/api-client-react";
import { Panel } from "@/components/kit";

const labels: Record<string, string> = {
  people: "People",
  services: "Services",
  check_ins: "Check-Ins",
};
const n = (v: number) => v.toLocaleString();

export function SourceLifecycle({ ws }: { ws: PlanningCenterWorkspace }) {
  return (
    <Panel className="p-5 sm:p-6">
      <h3 className="text-[15px] font-semibold">Source record lifecycle</h3>
      <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
        History is preserved. “Not seen” means absent from the latest successfully completed
        accessible scan, not deleted. Failed, paused, or partial scans never mark records missing.
        Seeing a record again clears its missing flag immediately.
      </p>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {ws.lifecycle.map((row) => (
          <div key={row.product} className="rounded-md border bg-muted/20 p-3">
            <h4 className="text-[13px] font-medium">{labels[row.product]}</h4>
            <dl className="mt-2 space-y-1 text-[12px]">
              {(
                [
                  ["Stored records", row.total],
                  ["Observed / not flagged missing", row.observed],
                  ["Not seen in latest completed scan", row.notSeen],
                  ["Not yet assessed", row.unassessed],
                  ["Explicitly inactive", row.inactive],
                  ["Explicitly archived", row.archived],
                  ["Explicit source deletion markers", row.deletionMarkers],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-mono">{n(value)}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-[11px] text-muted-foreground">
              {row.lastAssessedAt
                ? `Last completed assessment: ${new Date(row.lastAssessedAt).toLocaleString()}`
                : "A new complete scan is needed to assess absence. Older imports are not retroactively assessed."}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
        Status counts can overlap presence counts. A zero means no explicit marker stored, not proof
        that none exist in Planning Center. Deletions are not universally discoverable; access
        changes require an Admin review, not mass deletion or zero attendance. No automatic purge is
        enabled in development. Retention and privacy-deletion procedures require a separate
        decision before production. These flags do not change historical totals.
      </p>
    </Panel>
  );
}

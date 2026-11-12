import { Panel, StatusPill } from "@/components/kit";

export function MinistryHealthSection({ ministry }: { ministry: string }) {
  const id = ministry.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return (
    <Panel title="Health metrics" meta={<StatusPill status="planned" label="Formula-based" />}>
      <p
        className="px-5 py-4 text-[13px] text-muted-foreground"
        data-testid={`status-health-metrics-planned-${id}`}
      >
        Health formulas and thresholds will be finalized in a later phase. No score is shown until
        those definitions are agreed.
      </p>
    </Panel>
  );
}

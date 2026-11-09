import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@workspace/replit-auth-web";
import {
  getGetPlanningCenterQueryKey,
  useSetPlanningCenterSchedule,
  type PlanningCenterWorkspace,
  type PlanningCenterSchedule,
} from "@workspace/api-client-react";
import { RefreshCcw } from "lucide-react";
import { Panel, StatusPill } from "@/components/kit";
import { FormError, SectionHeading } from "@/components/admin-controls";
import { btn, btnPrimary, csrfRequest, Note } from "@/components/import-common";

type Settings = Pick<PlanningCenterSchedule, "frequency" | "localTime" | "timeZone" | "weekDays">;
const settings = (s: PlanningCenterSchedule): Settings => ({
  frequency: s.frequency,
  localTime: s.localTime,
  timeZone: s.timeZone,
  weekDays: s.weekDays,
});
const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const frequencies = {
  daily: "Daily",
  twice_daily: "Twice daily",
  every_6_hours: "Every 6 hours",
  weekly: "Selected weekdays",
};
const zones = Array.from(
  new Set(["America/Chicago", "UTC", ...Intl.supportedValuesOf("timeZone")]),
);
const inputClass = "mt-1 w-full rounded-md border bg-background px-3 py-2 text-[13px]";

export function RefreshSchedule({ ws }: { ws: PlanningCenterWorkspace }) {
  const { csrfToken } = useAuth();
  const qc = useQueryClient();
  const s = ws.schedule;
  const [draft, setDraft] = useState<Settings>(() => settings(s));
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const savedKey = JSON.stringify(settings(s));
  // Polling keeps other Admin sessions current without discarding an unfinished edit.
  useEffect(() => {
    if (!dirty) setDraft(JSON.parse(savedKey) as Settings);
  }, [savedKey, dirty]);
  const save = useSetPlanningCenterSchedule({
    ...csrfRequest(csrfToken),
    mutation: {
      onSuccess: (result) => {
        qc.setQueryData<PlanningCenterWorkspace>(getGetPlanningCenterQueryKey(), (old) =>
          old ? { ...old, schedule: result } : old,
        );
        setDraft(settings(result));
        setDirty(false);
        setMessage("Refresh schedule saved.");
      },
      onSettled: () => void qc.invalidateQueries({ queryKey: getGetPlanningCenterQueryKey() }),
    },
  });
  const change = (update: Partial<Settings>) => {
    setDraft((old) => ({ ...old, ...update }));
    setDirty(true);
    setMessage("");
  };
  const ready =
    ws.connection?.state === "connected" &&
    ["people", "services", "check_ins"].every((p) =>
      ws.syncs.some((r) => r.product === p && r.mode === "backfill" && r.status === "complete"),
    );
  const valid =
    /^([01]\d|2[0-3]):[0-5]\d$/.test(draft.localTime) &&
    (draft.frequency !== "weekly" || draft.weekDays.length > 0);
  const date = (value: string | null) =>
    value
      ? new Date(value).toLocaleString("en-US", {
          timeZone: s.timeZone,
          timeZoneName: "short",
        })
      : "—";
  const active = ws.syncs.find((r) => r.id === s.activeRunId);
  return (
    <Panel className="p-5 sm:p-6" data-testid="card-pco-schedule">
      <SectionHeading
        icon={RefreshCcw}
        title="Scheduled refresh"
        detail="Choose when Planning Center refreshes run."
      />
      <div className="space-y-3 text-[12.5px] leading-relaxed">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p>People → Services → Check-Ins · incremental rescans, one at a time.</p>
          <StatusPill
            status={s.enabled ? "current" : "off"}
            label={s.enabled ? "Enabled" : "Paused"}
          />
        </div>
        <p data-testid="text-schedule-summary">
          Saved: {frequencies[s.frequency]}, {s.localTime} · {s.timeZone}
          {s.frequency === "weekly" && ` · ${s.weekDays.map((d) => days[d]).join(", ")}`}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) save.mutate({ data: { ...draft, enabled: s.enabled } });
          }}
          className="space-y-3"
        >
          <fieldset disabled={save.isPending} className="grid gap-3 sm:grid-cols-3">
            <label>
              Frequency
              <select
                className={inputClass}
                value={draft.frequency}
                onChange={(e) =>
                  change({
                    frequency: e.target.value as Settings["frequency"],
                    weekDays: draft.weekDays.length ? draft.weekDays : [0],
                  })
                }
                data-testid="select-schedule-frequency"
              >
                {Object.entries(frequencies).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {draft.frequency === "twice_daily" || draft.frequency === "every_6_hours"
                ? "Daily anchor time"
                : "Start time"}
              <input
                type="time"
                required
                step={60}
                className={inputClass}
                value={draft.localTime}
                onChange={(e) => change({ localTime: e.target.value })}
                data-testid="input-schedule-time"
              />
            </label>
            <label>
              Time zone
              <select
                className={inputClass}
                value={draft.timeZone}
                onChange={(e) => change({ timeZone: e.target.value })}
                data-testid="select-schedule-timezone"
              >
                {Array.from(new Set([draft.timeZone, ...zones])).map((z) => (
                  <option key={z} value={z}>
                    {z.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
          {draft.frequency === "weekly" && (
            <fieldset disabled={save.isPending}>
              <legend className="mb-1">Run on these weekdays</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {days.map((day, i) => (
                  <label key={day} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={draft.weekDays.includes(i)}
                      onChange={(e) =>
                        change({
                          weekDays: e.target.checked
                            ? [...draft.weekDays, i].sort()
                            : draft.weekDays.filter((d) => d !== i),
                        })
                      }
                      data-testid={`checkbox-schedule-day-${i}`}
                    />
                    {day}
                  </label>
                ))}
              </div>
              {!draft.weekDays.length && (
                <p className="mt-1 text-destructive" role="alert">
                  Select at least one weekday.
                </p>
              )}
            </fieldset>
          )}
          <p className="text-muted-foreground">
            {draft.frequency === "twice_daily"
              ? "Runs at the selected time and 12 hours later, wrapping into the same daily pattern. "
              : draft.frequency === "every_6_hours"
                ? "Runs at the selected time and 6, 12 and 18 local-clock hours later, repeating daily. "
                : ""}
            Times follow the selected zone. A skipped daylight-saving time shifts forward by the
            clock change; a repeated time runs only once. Imports can take several hours.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className={btnPrimary}
              disabled={
                !dirty || !valid || save.isPending || !ws.connection || (s.enabled && !ready)
              }
              data-testid="button-save-schedule"
            >
              {save.isPending ? "Saving" : "Save schedule"}
            </button>
            {dirty && (
              <button
                type="button"
                className={btn}
                disabled={save.isPending}
                onClick={() => {
                  setDraft(settings(s));
                  setDirty(false);
                  setMessage("");
                }}
              >
                Discard changes
              </button>
            )}
            <button
              type="button"
              className={btn}
              disabled={save.isPending || dirty || (!s.enabled && !ready)}
              onClick={() => save.mutate({ data: { enabled: !s.enabled } })}
              data-testid="button-pco-schedule"
            >
              {s.enabled ? "Pause scheduled refresh" : "Enable scheduled refresh"}
            </button>
          </div>
          {dirty && (
            <p className="text-muted-foreground">
              Unsaved changes. Saving keeps the schedule {s.enabled ? "enabled" : "paused"} and does
              not restart the current import.
            </p>
          )}
        </form>
        {message && <p role="status">{message}</p>}
        <FormError error={save.error} />
        <dl className="grid gap-2 sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Next cycle</dt>
            <dd data-testid="text-schedule-next">{date(s.nextRunAt)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Last cycle started</dt>
            <dd>{date(s.lastStartedAt)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Last cycle finished</dt>
            <dd>{date(s.lastFinishedAt)}</dd>
          </div>
        </dl>
        <p role="status" data-testid="text-schedule-status">
          Cycle: {s.status}.
          {active &&
            ` ${active.product.replace("_", "-")}: ${active.status}, ${active.pages.toLocaleString()} pages saved.`}
          {s.status === "running" && !s.enabled && " Cycle paused; saved progress retained."}
        </p>
        {s.error && <Note tone="warn">{s.error}</Note>}
        {!ready && (
          <Note>
            A confirmed connection and completed backfills for all three products are required to
            enable this schedule.
          </Note>
        )}
        <p className="text-muted-foreground">
          Unfinished imports delay new cycles. Pausing retains this schedule’s progress; manual
          imports are unchanged. Missed starts combine into one catch-up cycle, not a backlog.
          Processing still requires a running API; these controls do not configure unattended
          hosting.
        </p>
      </div>
    </Panel>
  );
}

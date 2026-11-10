import { useEffect, useState, type FormEvent } from "react";
import { keepPreviousData, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@workspace/replit-auth-web";
import {
  getGetGivingHealthQueryKey,
  getGetGivingPolicyQueryKey,
  useGetGivingHealth,
  useGetGivingPolicy,
  useSaveGivingPolicy,
  type GivingPolicy,
  type GivingPolicyInputCadencesItem,
  type GivingPolicyInputGrouping,
} from "@workspace/api-client-react";
import { Panel, QueryError, StatusPill, formatDate } from "@/components/kit";
import { FormError } from "@/components/admin-controls";
import { Skeleton } from "@/components/ui/skeleton";
import { csrfRequest } from "@/lib/attendance";
import { invalidateMinistryData, ministryPolling } from "@/lib/ministry-data";

const CADENCES: [GivingPolicyInputCadencesItem, string][] = [
  ["weekly", "Weekly"],
  ["every_other_week", "Every other week"],
  ["monthly", "Monthly"],
  ["quarterly", "Quarterly"],
  ["annual", "Annual"],
];
type Draft = {
  minimumGifts: string;
  toleranceDays: string;
  missedExpected: string;
  grouping: GivingPolicyInputGrouping;
  cadences: GivingPolicyInputCadencesItem[];
  note: string;
};
const toDraft = (p: GivingPolicy): Draft => ({
  minimumGifts: String(p.minimumGifts),
  toleranceDays: String(p.toleranceDays),
  missedExpected: String(p.missedExpected),
  grouping: p.grouping,
  cadences: [...p.cadences],
  note: "",
});
const prefixes = () => [getGetGivingPolicyQueryKey()[0], getGetGivingHealthQueryKey()[0]];
const inputCls = "h-10 w-full rounded-md border border-input bg-background px-3 text-[13px]";
const intIn = (v: string, lo: number, hi: number) => /^\d+$/.test(v) && Number(v) >= lo && Number(v) <= hi;
const isConflict = (e: unknown) => !!e && typeof e === "object" && "status" in e && (e as { status: number }).status === 409;

/** Admin only. Not rendered and not queried for other roles. */
export function GivingPolicyForm() {
  const { user, csrfToken } = useAuth();
  const isAdmin = user?.role === "admin";
  const qc = useQueryClient();
  const q = useGetGivingPolicy({ query: { enabled: isAdmin, queryKey: getGetGivingPolicyQueryKey(), ...ministryPolling } });
  const save = useSaveGivingPolicy(csrfRequest(csrfToken));
  const p = q.data;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<GivingPolicy | null>(null);
  const savedKey = p ? JSON.stringify(toDraft(p)) : "";
  useEffect(() => {
    if (savedKey && !dirty) setDraft(JSON.parse(savedKey) as Draft);
  }, [savedKey, dirty]);
  if (!isAdmin) return null;

  const change = (u: Partial<Draft>) => {
    setDraft((d) => (d ? { ...d, ...u } : d));
    setDirty(true);
    setSaved(null);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft || !p) return;
    let err: string | null = null;
    if (!intIn(draft.minimumGifts, 3, 24)) err = "Minimum gifts must be a whole number from 3 to 24.";
    else if (!intIn(draft.toleranceDays, 0, 3)) err = "Tolerance must be 0 to 3 days.";
    else if (!intIn(draft.missedExpected, 1, 12)) err = "Missed expected gifts must be 1 to 12.";
    else if (draft.cadences.length === 0) err = "Select at least one cadence.";
    else if (draft.note.trim().length < 10) err = "Explain the change in at least 10 characters.";
    setError(err);
    if (err) return;
    save.mutate(
      {
        data: {
          minimumGifts: Number(draft.minimumGifts),
          toleranceDays: Number(draft.toleranceDays),
          missedExpected: Number(draft.missedExpected),
          grouping: draft.grouping,
          cadences: draft.cadences,
          note: draft.note.trim(),
          previousId: p.id,
        },
      },
      {
        onSuccess: (r) => {
          setSaved(r);
          setDirty(false);
          void invalidateMinistryData(qc, prefixes());
        },
      },
    );
  };

  return (
    <Panel title="Giving formula" meta={<span className="text-[11px] text-muted-foreground">Admin only</span>}>
      {q.isError && !p ? (
        <div className="p-5"><QueryError title="Giving formula unavailable" error={q.error} onRetry={() => void q.refetch()} /></div>
      ) : !p || !draft ? (
        <div className="p-5"><Skeleton className="h-48 w-full" /></div>
      ) : (
        <form onSubmit={submit} className="space-y-4 p-5" noValidate data-testid="form-giving-policy">
          <div className="text-[12.5px] text-muted-foreground">
            <p>
              Current version <span className="font-mono text-foreground" data-testid="text-policy-version">{p.id}</span> ·{" "}
              {p.origin === "owner_default" ? "Owner default" : "Admin version"}
              {p.createdAt ? ` · Saved ${formatDate(p.createdAt, true)}` : ""}
            </p>
            {p.note && <p className="mt-1" data-testid="text-policy-note">Note: {p.note}</p>}
            <p className="mt-2">
              First-time giver: the first recorded gift for the person or joint giving unit, using Planning Center's lifetime first-donated date.
              Lapsed: a giving unit with a consistent cadence (at least the minimum gifts, intervals matching within the tolerance) that then misses the set number of expected gifts in a row.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1 text-[12px] font-medium">Minimum gifts (3 to 24)
              <input type="number" min={3} max={24} step={1} className={inputCls} value={draft.minimumGifts} onChange={(e) => change({ minimumGifts: e.target.value })} data-testid="input-policy-minimum-gifts" />
            </label>
            <label className="grid gap-1 text-[12px] font-medium">Tolerance in days (0 to 3)
              <input type="number" min={0} max={3} step={1} className={inputCls} value={draft.toleranceDays} onChange={(e) => change({ toleranceDays: e.target.value })} data-testid="input-policy-tolerance" />
            </label>
            <label className="grid gap-1 text-[12px] font-medium">Missed expected gifts (1 to 12)
              <input type="number" min={1} max={12} step={1} className={inputCls} value={draft.missedExpected} onChange={(e) => change({ missedExpected: e.target.value })} data-testid="input-policy-missed" />
            </label>
          </div>
          <label className="grid gap-1 text-[12px] font-medium sm:max-w-sm">Grouping
            <select className={inputCls} value={draft.grouping} onChange={(e) => change({ grouping: e.target.value as GivingPolicyInputGrouping })} data-testid="select-policy-grouping">
              <option value="joint_giving_unit">Joint giving unit (Planning Center joint givers)</option>
              <option value="person">Each PCO Giving person</option>
            </select>
          </label>
          <p className="text-[11.5px] text-muted-foreground">
            Joint units use only explicit Planning Center joint giver links, never guessed households. Past joint membership is not reconstructed; current links apply.
          </p>
          <fieldset>
            <legend className="mb-1 text-[12px] font-medium">Cadences that count as consistent</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-[12.5px]">
              {CADENCES.map(([c, label]) => (
                <label key={c} className="flex items-center gap-1.5">
                  <input type="checkbox" checked={draft.cadences.includes(c)} onChange={(e) => change({ cadences: e.target.checked ? CADENCES.map((x) => x[0]).filter((x) => x === c || draft.cadences.includes(x)) : draft.cadences.filter((x) => x !== c) })} data-testid={`checkbox-policy-cadence-${c}`} />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="grid gap-1 text-[12px] font-medium">Reason for change (10 to 1000 characters)
            <textarea rows={3} maxLength={1000} className="w-full rounded-md border border-input bg-background px-3 py-2 text-[13px]" value={draft.note} onChange={(e) => change({ note: e.target.value })} data-testid="input-policy-note" />
          </label>
          {error && <p role="alert" className="text-[12px] text-destructive" data-testid="text-policy-error">{error}</p>}
          {isConflict(save.error) ? (
            <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-950">
              Another admin saved a newer version. Your draft is kept.{" "}
              <button type="button" className="underline" onClick={() => { setDirty(false); save.reset(); void q.refetch(); }} data-testid="button-policy-load-latest">Load the latest version</button>{" "}
              and apply your change again.
            </div>
          ) : (
            <FormError error={save.error} />
          )}
          {saved && (
            <div role="status" className="rounded-md bg-accent/55 px-3 py-2.5 text-[12px] text-accent-foreground" data-testid="status-policy-saved">
              Saved version {saved.id}. Note: {saved.note}. Existing Giving figures are invalid until Giving is published again. Retained histories are unchanged.
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={!dirty || save.isPending} className="h-9 rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground disabled:opacity-60" data-testid="button-save-policy">
              {save.isPending ? "Saving" : "Save new version"}
            </button>
            {dirty && (
              <button type="button" disabled={save.isPending} onClick={() => { setDirty(false); setError(null); save.reset(); }} className="h-9 rounded-md border px-3 text-[12.5px]" data-testid="button-discard-policy">Discard changes</button>
            )}
          </div>
          {dirty && <p className="text-[11.5px] text-muted-foreground">Unsaved changes. Saving creates a new version; earlier versions are kept.</p>}
        </form>
      )}
    </Panel>
  );
}

function unitStatus(lapsed: boolean | null) {
  if (lapsed === null) return { status: "pending", label: "Unclassified" };
  return lapsed ? { status: "blocked", label: "Lapsed" } : { status: "connected", label: "Not lapsed" };
}

/** Admin only. Restricted financial inputs; not a church health score. */
export function GivingHealth() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [page, setPage] = useState(1);
  const params = { page };
  const q = useGetGivingHealth(params, {
    query: { enabled: isAdmin, queryKey: getGetGivingHealthQueryKey(params), placeholderData: keepPreviousData, ...ministryPolling },
  });
  if (!isAdmin) return null;
  const d = q.data;
  return (
    <Panel title="Giving units" meta={<span className="text-[11px] text-muted-foreground">Admin only · restricted</span>}>
      <p className="border-b px-5 py-3 text-[12px] text-muted-foreground">
        Restricted financial inputs for a later reporting phase. Person IDs are PCO Giving person IDs only; no names are shown.
        Unclassified means there is not enough consistent history to decide, which is different from not lapsed.
      </p>
      {q.isError && !d ? (
        <div className="p-5"><QueryError title="Giving units unavailable" error={q.error} onRetry={() => void q.refetch()} /></div>
      ) : !d ? (
        <div className="space-y-2 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
      ) : (
        <>
          <p className="px-5 pt-3 text-[11.5px] text-muted-foreground" data-testid="text-health-meta">
            Formula version {d.policyVersion ?? "none"} · Source as of {d.sourceAsOf ? formatDate(d.sourceAsOf, true) : "no source data yet"}
          </p>
          {d.issues.length > 0 && (
            <ul className="mx-5 mt-2 space-y-1 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-[12px] text-amber-950">{d.issues.map((i) => <li key={i}>{i}</li>)}</ul>
          )}
          {d.units.length === 0 ? (
            <p className="p-6 text-center text-[13px] text-muted-foreground" data-testid="status-health-empty">No giving units on this page. Giving data may not be imported yet.</p>
          ) : (
            <div className={`mt-3 overflow-x-auto ${q.isPlaceholderData ? "opacity-60" : ""}`}>
              <table className="w-full min-w-[860px] text-[12.5px]" aria-label="Giving units">
                <thead>
                  <tr className="border-b bg-muted/40 text-left">
                    {["Unit", "PCO Giving person IDs", "First recorded", "Last gift", "Cadence", "Expected dates", "Missed", "Status", "Reason"].map((h) => <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {d.units.map((u) => {
                    const st = unitStatus(u.lapsed);
                    return (
                      <tr key={u.unitId} className="border-b last:border-0 align-top" data-testid={`row-giving-unit-${u.unitId}`}>
                        <td className="px-3 py-2 font-mono text-[11.5px]">{u.unitId}</td>
                        <td className="px-3 py-2 font-mono text-[11.5px]">{u.personIds.join(", ") || "None"}</td>
                        <td className="px-3 py-2">{u.firstRecordedAt ? formatDate(u.firstRecordedAt) : "Unknown"}</td>
                        <td className="px-3 py-2">{u.lastGiftDate ? formatDate(u.lastGiftDate) : "Unknown"}</td>
                        <td className="px-3 py-2">{u.cadence ? u.cadence.replace(/_/g, " ") : "None found"}</td>
                        <td className="px-3 py-2 font-mono text-[11px]">{u.expectedDates.join(", ") || "None"}</td>
                        <td className="px-3 py-2 tabular-nums">{u.missedExpected ?? "Not assessed"}</td>
                        <td className="px-3 py-2"><StatusPill status={st.status} label={st.label} testId={`status-giving-unit-${u.unitId}`} /></td>
                        <td className="px-3 py-2 text-muted-foreground">{u.reason}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      <div className="flex items-center justify-between border-t px-5 py-3">
        <span className="text-[11.5px] text-muted-foreground" data-testid="text-health-page">Page {page}</span>
        <div className="flex gap-2">
          <button type="button" data-testid="button-health-previous" disabled={page <= 1 || q.isFetching} onClick={() => setPage((x) => Math.max(1, x - 1))} className="h-8 rounded-md border px-3 text-[12px] disabled:opacity-45">Previous</button>
          <button type="button" data-testid="button-health-next" disabled={!d?.hasMore || q.isFetching} onClick={() => setPage((x) => Math.min(10000, x + 1))} className="h-8 rounded-md border px-3 text-[12px] disabled:opacity-45">Next</button>
        </div>
      </div>
    </Panel>
  );
}

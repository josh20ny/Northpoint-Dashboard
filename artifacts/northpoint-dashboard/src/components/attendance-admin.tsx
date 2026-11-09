import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetAttendanceHistoryPreviewQueryKey,
  getListImportsQueryKey,
  useGetAttendanceHistoryPreview,
  useListImports,
  usePromoteAttendanceHistory,
  useSaveAttendanceDefinition,
  type AttendanceWorkspace,
  type AttendanceHistoryCandidate,
} from "@workspace/api-client-react";
import { History, Settings2 } from "lucide-react";
import { Panel, QueryError, StatusPill, formatDate } from "@/components/kit";
import { Skeleton } from "@/components/ui/skeleton";
import {
  EmptyRecord,
  FormError,
  SectionHeading,
  SelectField,
  SubmitButton,
  TextField,
} from "@/components/admin-controls";
import { SLOTS, csrfRequest, fmtCount, invalidateAttendance, slotLabel } from "@/lib/attendance";

export function DefinitionSetup({
  workspace,
  csrfToken,
}: {
  workspace: AttendanceWorkspace;
  csrfToken: string | null;
}) {
  const qc = useQueryClient();
  const mutation = useSaveAttendanceDefinition(csrfRequest(csrfToken));
  const [ministryId, setMinistryId] = useState(workspace.definition?.ministryId ?? "");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSaved(false);
    mutation.mutate(
      { data: { ministryId, effectiveFrom, note: note.trim() } },
      {
        onSuccess: () => {
          setNote("");
          setEffectiveFrom("");
          setSaved(true);
          void invalidateAttendance(qc);
        },
      },
    );
  };
  const d = workspace.definition;

  return (
    <Panel className="p-5 sm:p-6">
      <SectionHeading
        icon={Settings2}
        title="Count definition"
        detail="Admin only. Each save creates a new version; earlier versions stay in history."
      />
      {d ? (
        <dl className="mb-4 grid gap-2 rounded-md border bg-muted/35 p-3 text-[12.5px] sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Ministry</dt>
            <dd data-testid="text-definition-ministry">
              {workspace.ministries.find((m) => m.id === d.ministryId)?.name ?? "Not on list"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Effective from</dt>
            <dd>{formatDate(d.effectiveFrom)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Version</dt>
            <dd className="font-mono">v{d.version}</dd>
          </div>
          <p className="text-muted-foreground sm:col-span-3">{d.note}</p>
        </dl>
      ) : (
        <p className="mb-4 rounded-md bg-accent/50 px-3 py-2 text-[12px]">
          No definition yet. Staff cannot record counts until one is saved.
        </p>
      )}
      <p
        role="note"
        data-testid="text-definition-warning"
        className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-950"
      >
        Saving creates a new version. Counts recorded under earlier versions are not copied or
        replayed into it; they stay viewable under their own version.
      </p>
      {workspace.ministries.length === 0 ? (
        <EmptyRecord>
          No ministries are configured.{" "}
          <Link
            href="/administration"
            className="font-medium text-primary underline-offset-4 hover:underline"
            data-testid="link-setup-ministries"
          >
            Add one in Administration
          </Link>
          .
        </EmptyRecord>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField
              name="definition-ministry"
              label="Ministry"
              value={ministryId}
              onChange={setMinistryId}
            >
              {workspace.ministries.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </SelectField>
            <TextField
              name="definition-effective"
              label="Effective from"
              type="date"
              required
              value={effectiveFrom}
              onChange={setEffectiveFrom}
            />
          </div>
          <TextField
            name="definition-note"
            label="Change note"
            required
            maxLength={1000}
            value={note}
            onChange={setNote}
            hint="At least 20 characters. Say why this version applies."
          />
          <FormError error={mutation.error} />
          {saved && (
            <p role="status" className="text-[12px] text-muted-foreground">
              Definition saved.
            </p>
          )}
          {note.trim().length > 0 && note.trim().length < 20 && (
            <p className="text-[12px] text-destructive">
              {20 - note.trim().length} more characters needed.
            </p>
          )}
          <SubmitButton pending={mutation.isPending}>Save definition</SubmitButton>
        </form>
      )}
    </Panel>
  );
}

export function HistoryPromotion({
  workspace,
  csrfToken,
}: {
  workspace: AttendanceWorkspace;
  csrfToken: string | null;
}) {
  const qc = useQueryClient();
  const imports = useListImports({
    query: { queryKey: getListImportsQueryKey(), staleTime: 30000 },
  });
  const [batchId, setBatchId] = useState("");
  const preview = useGetAttendanceHistoryPreview(batchId, {
    query: {
      enabled: !!batchId,
      queryKey: getGetAttendanceHistoryPreviewQueryKey(batchId),
      staleTime: 30000,
      refetchOnWindowFocus: true,
    },
  });
  const promote = usePromoteAttendanceHistory(csrfRequest(csrfToken));
  const [week, setWeek] = useState("");
  const [ack, setAck] = useState(false);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<number | null>(null);

  const candidates = preview.data?.candidates ?? [];
  const weeks = Array.from(new Set(candidates.map((c) => c.week)));
  const pair = (w: string) => {
    const first = candidates.find((c) => c.week === w && c.slot === SLOTS[0].value);
    const second = candidates.find((c) => c.week === w && c.slot === SLOTS[1].value);
    return { first, second, ok: !!first?.eligible && !!second?.eligible };
  };
  const selected = week ? pair(week) : null;
  const definitionId = workspace.isCurrentDefinition ? workspace.definition?.id : undefined;
  const canSubmit =
    !!definitionId && !!selected?.ok && ack && note.trim().length >= 20 && !promote.isPending;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !selected?.first || !selected.second || !definitionId) return;
    setResult(null);
    promote.mutate(
      {
        batchId,
        data: {
          definitionId,
          week,
          firstHash: selected.first.evidenceHash,
          secondHash: selected.second.evidenceHash,
          note: note.trim(),
          acknowledgeAuthority: ack,
        },
      },
      {
        onSuccess: (r) => {
          setResult(r.promoted);
          setWeek("");
          setAck(false);
          setNote("");
          void invalidateAttendance(qc);
        },
      },
    );
  };

  const batches = imports.data?.batches ?? [];

  return (
    <Panel className="p-5 sm:p-6">
      <SectionHeading
        icon={History}
        title="Workbook history"
        detail="Admin only. Preview reviewed workbook weeks and promote one week at a time. Nothing is promoted automatically."
      />
      {!workspace.isCurrentDefinition ? (
        <p
          className="mb-3 rounded-md bg-accent/50 px-3 py-2 text-[12px]"
          data-testid="status-promotion-disabled"
        >
          Promotion is disabled while viewing a prior version.
        </p>
      ) : (
        !definitionId && (
          <p className="mb-3 rounded-md bg-accent/50 px-3 py-2 text-[12px]">
            Save a count definition first.
          </p>
        )
      )}
      {imports.isError ? (
        <QueryError
          title="Imports unavailable"
          error={imports.error}
          onRetry={() => void imports.refetch()}
        />
      ) : imports.isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : batches.length === 0 ? (
        <EmptyRecord>
          No workbook batches.{" "}
          <Link
            href="/administration/imports"
            className="font-medium text-primary hover:underline"
            data-testid="link-imports"
          >
            Open imports
          </Link>
        </EmptyRecord>
      ) : (
        <SelectField
          name="history-batch"
          label="Import batch"
          value={batchId}
          onChange={(v) => {
            setBatchId(v);
            setWeek("");
            setAck(false);
            setResult(null);
          }}
        >
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.filename} · snapshot {b.snapshotDate} · {b.state}
            </option>
          ))}
        </SelectField>
      )}

      {batchId &&
        (preview.isError ? (
          <div className="mt-4">
            <QueryError
              title="Preview unavailable"
              error={preview.error}
              onRetry={() => void preview.refetch()}
            />
          </div>
        ) : preview.isLoading ? (
          <div className="mt-4 space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : candidates.length === 0 ? (
          <div className="mt-4">
            <EmptyRecord>No attendance candidates in this batch.</EmptyRecord>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-md border">
            <table className="w-full text-[12.5px]">
              <caption className="sr-only">Workbook attendance candidates</caption>
              <thead className="bg-muted/50 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2">
                    Week
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Slot
                  </th>
                  <th scope="col" className="px-3 py-2 text-right">
                    Count
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Review
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Evidence hash
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {candidates.map((c: AttendanceHistoryCandidate) => (
                  <tr
                    key={`${c.week}-${c.slot}`}
                    className={c.week === week ? "bg-accent/40" : undefined}
                  >
                    <td className="px-3 py-2 font-mono">{c.week}</td>
                    <td className="px-3 py-2">{slotLabel(c.slot)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtCount(c.count)}</td>
                    <td className="px-3 py-2">{c.reviewMethod ?? "Not reviewed"}</td>
                    <td className="px-3 py-2 font-mono text-[11px]" title={c.evidenceHash}>
                      {c.evidenceHash.slice(0, 12)}
                    </td>
                    <td className="px-3 py-2">
                      <StatusPill
                        status={c.eligible ? "ok" : "off"}
                        label={c.eligible ? "Eligible" : "Not eligible"}
                      />
                      {c.flags.length > 0 && (
                        <span className="ml-2 text-[11px] text-muted-foreground">
                          {c.flags.join(", ")}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {batchId && candidates.length > 0 && (
        <form onSubmit={submit} className="mt-4 space-y-3 rounded-md border bg-muted/30 p-4">
          <SelectField name="history-week" label="Week to promote" value={week} onChange={setWeek}>
            {weeks.map((w) => {
              const p = pair(w);
              return (
                <option key={w} value={w} disabled={!p.ok}>
                  {w} {p.ok ? "· both slots eligible" : "· not eligible"}
                </option>
              );
            })}
          </SelectField>
          {selected?.ok && (
            <p className="text-[12px] text-muted-foreground">
              {slotLabel(SLOTS[0].value)}: {fmtCount(selected.first?.count)} ·{" "}
              {slotLabel(SLOTS[1].value)}: {fmtCount(selected.second?.count)}. No service occurrence
              is created.
            </p>
          )}
          <TextField
            name="history-note"
            label="Basis note"
            required
            maxLength={1000}
            value={note}
            onChange={setNote}
            hint="At least 20 characters. Name the source and who reviewed it."
          />
          <label className="flex items-start gap-2 text-[12.5px]">
            <input
              type="checkbox"
              data-testid="checkbox-authority"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
              className="mt-0.5"
            />
            I confirm I have authority to publish these workbook counts as official adult
            attendance.
          </label>
          <FormError error={promote.error} />
          {result !== null && (
            <p
              role="status"
              className="text-[12px] text-muted-foreground"
              data-testid="text-promoted"
            >
              Promoted {result} {result === 1 ? "record" : "records"}.
            </p>
          )}
          <button
            type="submit"
            data-testid="button-promote-week"
            disabled={!canSubmit}
            className="inline-flex h-9 items-center rounded-md bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {promote.isPending ? "Promoting…" : "Promote week"}
          </button>
        </form>
      )}
    </Panel>
  );
}
